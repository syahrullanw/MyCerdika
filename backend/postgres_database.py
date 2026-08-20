"""Small async document API backed by PostgreSQL JSONB.

The application historically called Motor collections directly.  This module
keeps that narrow async API at the persistence boundary so the HTTP/domain code
can move to PostgreSQL without a risky, all-at-once endpoint rewrite.
"""

from __future__ import annotations

import base64
import asyncio
import copy
import hashlib
import json
import os
import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, AsyncIterator, Dict, List, Optional, Tuple
from urllib.parse import urlsplit
from uuid import UUID

import asyncpg


_MISSING = object()
_FIELD_NAME = re.compile(r"^[A-Za-z0-9_.-]+$")


def json_value(value: Any) -> Any:
    """Convert BSON/Python values into values accepted by PostgreSQL JSONB."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (UUID, Decimal)):
        return str(value)
    if isinstance(value, bytes):
        return {"$binary_base64": base64.b64encode(value).decode("ascii")}
    if isinstance(value, dict):
        return {str(key): json_value(item) for key, item in value.items() if key != "_id"}
    if isinstance(value, (list, tuple, set)):
        return [json_value(item) for item in value]
    # Handles migration-only BSON values such as ObjectId and Decimal128
    # without making the running application depend on pymongo/bson.
    return str(value)


def _json_dump(value: Any) -> str:
    return json.dumps(json_value(value), ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def _decode_document(value: Any) -> Dict[str, Any]:
    if isinstance(value, str):
        value = json.loads(value)
    return copy.deepcopy(value)


def _path_parts(path: str) -> List[str]:
    if not isinstance(path, str) or not path or not _FIELD_NAME.fullmatch(path):
        raise ValueError(f"Nama field database tidak valid: {path!r}")
    return path.split(".")


def _sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _sql_node(path: str) -> str:
    parts = ",".join(_sql_literal(part) for part in _path_parts(path))
    return f"data #> ARRAY[{parts}]"


def _projection_expression(projection: Optional[Dict[str, int]]) -> str:
    """Build a small JSONB projection in PostgreSQL.

    The old compatibility layer selected the complete JSON document and only
    removed fields after it had crossed the database/driver boundary. That is
    particularly expensive for submissions and users because those documents
    may contain attachment metadata and nested arrays. Keep the Mongo-like
    projection API, but let PostgreSQL discard unused fields first.
    """
    if not projection:
        return "data"

    included = [
        str(path)
        for path, enabled in projection.items()
        if enabled and path != "_id"
    ]
    if included:
        fragments: List[str] = []
        for path in included:
            parts = _path_parts(path)
            expression = _sql_node(path)
            for part in reversed(parts):
                expression = f"jsonb_build_object({_sql_literal(part)}, {expression})"
            fragments.append(expression)
        # jsonb_strip_nulls keeps missing fields close to Mongo projection
        # semantics while still avoiding a full-row transfer.
        return "jsonb_strip_nulls(" + " || ".join(fragments) + ")"

    expression = "data"
    for path, enabled in projection.items():
        if not enabled and path != "_id":
            expression = f"({expression} #- ARRAY[{','.join(_sql_literal(part) for part in _path_parts(str(path)))}])"
    return expression


def _nested_document(path: str, value: Any) -> Dict[str, Any]:
    nested: Any = json_value(value)
    for part in reversed(_path_parts(path)):
        nested = {part: nested}
    return nested


def _nested_containment_documents(path: str, value: Any) -> List[Dict[str, Any]]:
    """Build JSONB containment candidates for object and embedded-array paths."""
    parts = _path_parts(path)
    normalized_value = json_value(value)
    # Mongo-like equality matches a scalar against an item in an array. Keep
    # the direct scalar candidate and add an array candidate for PostgreSQL's
    # JSONB containment operator so queries such as participant_ids: user_id
    # work for chat conversations and other membership arrays.
    candidates: List[Any] = [
        {parts[-1]: normalized_value},
        {parts[-1]: [normalized_value]},
    ]
    for part in reversed(parts[:-1]):
        nested: List[Any] = []
        for candidate in candidates:
            nested.append({part: candidate})
            nested.append({part: [candidate]})
        candidates = nested
    return candidates


def _get_path(document: Any, path: str, default: Any = _MISSING) -> Any:
    current = document
    for part in _path_parts(path):
        if not isinstance(current, dict) or part not in current:
            return default
        current = current[part]
    return current


def _get_match_path(document: Any, path: str, default: Any = _MISSING) -> Any:
    """Resolve dotted query paths through embedded arrays using Mongo-like semantics."""
    parts = _path_parts(path)

    def resolve(current: Any, index: int) -> Any:
        if index >= len(parts):
            return current
        if isinstance(current, list):
            values: List[Any] = []
            for item in current:
                value = resolve(item, index)
                if value is _MISSING:
                    continue
                values.extend(value if isinstance(value, list) else [value])
            return values if values else _MISSING
        if not isinstance(current, dict) or parts[index] not in current:
            return _MISSING
        return resolve(current[parts[index]], index + 1)

    value = resolve(document, 0)
    return default if value is _MISSING else value


def _set_path(document: Dict[str, Any], path: str, value: Any) -> None:
    parts = _path_parts(path)
    current = document
    for part in parts[:-1]:
        child = current.get(part)
        if not isinstance(child, dict):
            child = {}
            current[part] = child
        current = child
    current[parts[-1]] = json_value(value)


def _delete_path(document: Dict[str, Any], path: str) -> None:
    parts = _path_parts(path)
    current: Any = document
    for part in parts[:-1]:
        if not isinstance(current, dict) or part not in current:
            return
        current = current[part]
    if isinstance(current, dict):
        current.pop(parts[-1], None)


def _value_equals(actual: Any, expected: Any) -> bool:
    if actual is _MISSING:
        return expected is None
    if isinstance(actual, list) and not isinstance(expected, list):
        return expected in actual
    return actual == expected


def _compare(actual: Any, expected: Any, operator: str) -> bool:
    if actual is _MISSING or actual is None:
        return False
    try:
        if operator == "$lt":
            return actual < expected
        if operator == "$lte":
            return actual <= expected
        if operator == "$gt":
            return actual > expected
        if operator == "$gte":
            return actual >= expected
    except TypeError:
        return False
    raise ValueError(f"Operator pembanding tidak didukung: {operator}")


def _matches_field(actual: Any, condition: Any) -> bool:
    if not isinstance(condition, dict) or not any(str(key).startswith("$") for key in condition):
        return _value_equals(actual, condition)
    for operator, expected in condition.items():
        if operator == "$eq" and not _value_equals(actual, expected):
            return False
        if operator == "$ne" and _value_equals(actual, expected):
            return False
        if operator == "$in" and not any(_value_equals(actual, item) for item in expected):
            return False
        if operator == "$nin" and any(_value_equals(actual, item) for item in expected):
            return False
        if operator == "$exists" and ((actual is not _MISSING) != bool(expected)):
            return False
        if operator in {"$lt", "$lte", "$gt", "$gte"} and not _compare(actual, expected, operator):
            return False
        if operator == "$size" and (not isinstance(actual, list) or len(actual) != int(expected)):
            return False
        if operator not in {"$eq", "$ne", "$in", "$nin", "$exists", "$lt", "$lte", "$gt", "$gte", "$size"}:
            raise ValueError(f"Operator query tidak didukung: {operator}")
    return True


def matches(document: Dict[str, Any], query: Optional[Dict[str, Any]]) -> bool:
    """Mongo-like match semantics used by updates and aggregation."""
    for field, condition in (query or {}).items():
        if field == "$or":
            if not any(matches(document, item) for item in condition):
                return False
        elif field == "$and":
            if not all(matches(document, item) for item in condition):
                return False
        elif field.startswith("$"):
            raise ValueError(f"Operator query tidak didukung: {field}")
        elif not _matches_field(_get_match_path(document, field), condition):
            return False
    return True


class _QueryCompiler:
    def __init__(self, first_parameter: int = 1):
        self.parameters: List[str] = []
        self.first_parameter = first_parameter

    def _parameter(self, value: Any) -> str:
        self.parameters.append(_json_dump(value))
        return f"${self.first_parameter + len(self.parameters) - 1}::jsonb"

    def _equals(self, field: str, node: str, value: Any) -> str:
        if field == "id" and isinstance(value, str):
            self.parameters.append(value)
            return f"(document_id = ${self.first_parameter + len(self.parameters) - 1}::text)"
        if isinstance(value, list):
            parameter = self._parameter(value)
            return f"({node} = {parameter})"
        node_parameter = self._parameter(value)
        containment = " OR ".join(
            f"data @> {self._parameter(candidate)}"
            for candidate in _nested_containment_documents(field, value)
        )
        if value is None:
            return f"({node} IS NULL OR {node} = {node_parameter} OR {containment})"
        return f"({node} = {node_parameter} OR {containment})"

    def _field(self, field: str, condition: Any) -> str:
        node = _sql_node(field)
        if not isinstance(condition, dict) or not any(str(key).startswith("$") for key in condition):
            return self._equals(field, node, condition)
        parts: List[str] = []
        for operator, expected in condition.items():
            if operator == "$eq":
                parts.append(self._equals(field, node, expected))
            elif operator == "$ne":
                parts.append(f"({node} IS NULL OR NOT {self._equals(field, node, expected)})")
            elif operator in {"$in", "$nin"}:
                options = [self._equals(field, node, item) for item in expected]
                combined = "(" + (" OR ".join(options) if options else "FALSE") + ")"
                parts.append(combined if operator == "$in" else f"({node} IS NULL OR NOT {combined})")
            elif operator == "$exists":
                parts.append(f"({node} IS {'NOT ' if expected else ''}NULL)")
            elif operator in {"$lt", "$lte", "$gt", "$gte"}:
                sql_operator = {"$lt": "<", "$lte": "<=", "$gt": ">", "$gte": ">="}[operator]
                parts.append(f"({node} IS NOT NULL AND {node} {sql_operator} {self._parameter(expected)})")
            elif operator == "$size":
                parts.append(f"(jsonb_typeof({node}) = 'array' AND jsonb_array_length({node}) = {int(expected)})")
            else:
                raise ValueError(f"Operator query tidak didukung: {operator}")
        return "(" + " AND ".join(parts) + ")"

    def compile(self, query: Optional[Dict[str, Any]]) -> str:
        parts: List[str] = []
        for field, condition in (query or {}).items():
            if field in {"$or", "$and"}:
                children = [self.compile(item) for item in condition]
                joiner = " OR " if field == "$or" else " AND "
                parts.append("(" + (joiner.join(children) if children else ("FALSE" if field == "$or" else "TRUE")) + ")")
            elif field.startswith("$"):
                raise ValueError(f"Operator query tidak didukung: {field}")
            else:
                parts.append(self._field(field, condition))
        return " AND ".join(parts) if parts else "TRUE"


def _project(document: Dict[str, Any], projection: Optional[Dict[str, int]]) -> Dict[str, Any]:
    if not projection:
        return copy.deepcopy(document)
    included = [path for path, enabled in projection.items() if enabled and path != "_id"]
    if included:
        output: Dict[str, Any] = {}
        for path in included:
            value = _get_path(document, path)
            if value is not _MISSING:
                _set_path(output, path, value)
        return output
    output = copy.deepcopy(document)
    for path, enabled in projection.items():
        if not enabled and path != "_id":
            _delete_path(output, path)
    return output


def _sort_value(document: Dict[str, Any], field: str) -> Tuple[int, int, Any]:
    value = _get_path(document, field)
    if value is _MISSING or value is None:
        return (0, 0, "")
    if isinstance(value, bool):
        return (1, 0, int(value))
    if isinstance(value, (int, float)):
        return (1, 1, value)
    if isinstance(value, str):
        return (1, 2, value)
    return (1, 3, _json_dump(value))


def _array_filter_queries(array_filters: Optional[List[Dict[str, Any]]]) -> Dict[str, Dict[str, Any]]:
    queries: Dict[str, Dict[str, Any]] = {}
    for definition in array_filters or []:
        if not isinstance(definition, dict) or not definition:
            raise ValueError("Array filter harus berupa object yang tidak kosong")
        for path, condition in definition.items():
            identifier, separator, nested_path = str(path).partition(".")
            if (
                not separator
                or not nested_path
                or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*", identifier)
            ):
                raise ValueError(f"Array filter tidak didukung: {path!r}")
            _path_parts(nested_path)
            queries.setdefault(identifier, {})[nested_path] = condition
    return queries


def _set_filtered_path(
    document: Dict[str, Any],
    path: str,
    value: Any,
    filter_queries: Dict[str, Dict[str, Any]],
) -> None:
    parts = path.split(".")
    filtered = [
        (index, match.group(1))
        for index, part in enumerate(parts)
        if (match := re.fullmatch(r"\$\[([A-Za-z][A-Za-z0-9_]*)\]", part))
    ]
    if len(filtered) != 1:
        raise ValueError(f"Path array filter tidak didukung: {path!r}")
    index, identifier = filtered[0]
    if identifier not in filter_queries:
        raise ValueError(f"Array filter untuk {identifier!r} tidak ditemukan")
    prefix = ".".join(parts[:index])
    suffix = ".".join(parts[index + 1 :])
    if not prefix:
        raise ValueError(f"Path array filter tidak memiliki field induk: {path!r}")
    current = _get_path(document, prefix, [])
    if not isinstance(current, list):
        return
    updated = list(current)
    for item_index, item in enumerate(updated):
        if not isinstance(item, dict) or not matches(item, filter_queries[identifier]):
            continue
        if suffix:
            replacement = copy.deepcopy(item)
            _set_path(replacement, suffix, value)
            updated[item_index] = replacement
        else:
            updated[item_index] = json_value(value)
    _set_path(document, prefix, updated)


def _apply_update(
    document: Dict[str, Any],
    update: Dict[str, Any],
    array_filters: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    if not any(str(key).startswith("$") for key in update):
        return json_value(update)
    output = copy.deepcopy(document)
    filter_queries = _array_filter_queries(array_filters)
    for operator, changes in update.items():
        if operator == "$set":
            for path, value in changes.items():
                if "$[" in path:
                    _set_filtered_path(output, path, value, filter_queries)
                else:
                    _set_path(output, path, value)
        elif operator == "$unset":
            for path in changes:
                _delete_path(output, path)
        elif operator == "$addToSet":
            for path, value in changes.items():
                values = value.get("$each", []) if isinstance(value, dict) and "$each" in value else [value]
                current = _get_path(output, path, [])
                current = list(current) if isinstance(current, list) else []
                for item in values:
                    normalized = json_value(item)
                    if normalized not in current:
                        current.append(normalized)
                _set_path(output, path, current)
        elif operator == "$pull":
            for path, value in changes.items():
                current = _get_path(output, path, [])
                if isinstance(current, list):
                    kept = [item for item in current if not _matches_field(item, value)]
                    _set_path(output, path, kept)
        elif operator == "$push":
            for path, value in changes.items():
                values = value.get("$each", []) if isinstance(value, dict) and "$each" in value else [value]
                current = _get_path(output, path, [])
                current = list(current) if isinstance(current, list) else []
                current.extend(json_value(item) for item in values)
                _set_path(output, path, current)
        else:
            raise ValueError(f"Operator update tidak didukung: {operator}")
    return output


def _upsert_base(query: Dict[str, Any]) -> Dict[str, Any]:
    base: Dict[str, Any] = {}
    for field, value in query.items():
        if field.startswith("$"):
            continue
        if isinstance(value, dict) and any(str(key).startswith("$") for key in value):
            if set(value) == {"$eq"}:
                _set_path(base, field, value["$eq"])
            continue
        _set_path(base, field, value)
    return base


@dataclass
class WriteResult:
    matched_count: int = 0
    modified_count: int = 0
    deleted_count: int = 0
    inserted_id: Optional[int] = None
    upserted_id: Optional[int] = None


class PostgresCursor:
    def __init__(self, collection: "PostgresCollection", query: Dict[str, Any], projection: Optional[Dict[str, int]] = None):
        self.collection = collection
        self.query = query
        self.projection = projection
        self.sort_fields: List[Tuple[str, int]] = []
        self.skip_count = 0

    def sort(self, key_or_list: Any, direction: Optional[int] = None) -> "PostgresCursor":
        if isinstance(key_or_list, str):
            self.sort_fields = [(key_or_list, int(direction or 1))]
        else:
            self.sort_fields = [(str(field), int(order)) for field, order in key_or_list]
        return self

    def skip(self, count: int) -> "PostgresCursor":
        self.skip_count = max(0, int(count))
        return self

    async def to_list(self, length: Optional[int]) -> List[Dict[str, Any]]:
        documents = await self.collection._find(
            self.query,
            sort_fields=self.sort_fields,
            skip=self.skip_count,
            limit=length,
            projection=self.projection,
        )
        return documents

    def __aiter__(self) -> AsyncIterator[Dict[str, Any]]:
        async def iterate() -> AsyncIterator[Dict[str, Any]]:
            for item in await self.to_list(None):
                yield item
        return iterate()


class AggregateCursor:
    def __init__(self, collection: "PostgresCollection", pipeline: List[Dict[str, Any]]):
        self.collection = collection
        self.pipeline = pipeline

    async def to_list(self, length: Optional[int]) -> List[Dict[str, Any]]:
        return await self.collection._aggregate(self.pipeline, length)

    def __aiter__(self) -> AsyncIterator[Dict[str, Any]]:
        async def iterate() -> AsyncIterator[Dict[str, Any]]:
            for item in await self.to_list(None):
                yield item
        return iterate()


def _expression(document: Dict[str, Any], expression: Any) -> Any:
    if isinstance(expression, str) and expression.startswith("$"):
        value = _get_path(document, expression[1:], None)
        return None if value is _MISSING else value
    if not isinstance(expression, dict):
        return expression
    if "$ifNull" in expression:
        first, fallback = expression["$ifNull"]
        value = _expression(document, first)
        return _expression(document, fallback) if value is None else value
    if "$eq" in expression:
        left, right = expression["$eq"]
        return _expression(document, left) == _expression(document, right)
    if "$cond" in expression:
        condition, truthy, falsy = expression["$cond"]
        return _expression(document, truthy) if _expression(document, condition) else _expression(document, falsy)
    raise ValueError(f"Ekspresi agregasi tidak didukung: {next(iter(expression), '')}")


def _aggregate_group(documents: List[Dict[str, Any]], specification: Dict[str, Any]) -> List[Dict[str, Any]]:
    groups: Dict[str, Dict[str, Any]] = {}
    keys: Dict[str, Any] = {}
    for document in documents:
        group_value = _expression(document, specification.get("_id"))
        serialized = _json_dump(group_value)
        keys[serialized] = group_value
        output = groups.setdefault(serialized, {"_id": group_value})
        for name, accumulator in specification.items():
            if name == "_id":
                continue
            if not isinstance(accumulator, dict) or "$sum" not in accumulator:
                raise ValueError(f"Accumulator agregasi tidak didukung: {name}")
            value = _expression(document, accumulator["$sum"])
            output[name] = output.get(name, 0) + (value if isinstance(value, (int, float)) else 0)
    return [groups[key] for key in groups]


class PostgresCollection:
    def __init__(self, database: "PostgresDatabase", name: str):
        if not name or not re.fullmatch(r"[A-Za-z0-9_-]+", name):
            raise ValueError(f"Nama collection tidak valid: {name!r}")
        self.database = database
        self.name = name
        self.table_name = f"app_doc_{name}"
        self._ready = False

    @property
    def pool(self) -> asyncpg.Pool:
        return self.database.pool

    async def _ensure_table(self) -> None:
        if not self._ready:
            await self.database.ensure_collection(self.name, self.table_name)
            self._ready = True

    async def _rows(
        self,
        query: Optional[Dict[str, Any]],
        *,
        connection: Any = None,
        for_update: bool = False,
        one: bool = False,
        sort_fields: Optional[List[Tuple[str, int]]] = None,
        skip: int = 0,
        limit: Optional[int] = None,
        projection: Optional[Dict[str, int]] = None,
    ) -> List[Any]:
        await self._ensure_table()
        compiler = _QueryCompiler(first_parameter=1)
        where = compiler.compile(query)
        order = ""
        if sort_fields:
            order_parts = []
            for field, direction in sort_fields:
                descending = int(direction) < 0
                order_parts.append(
                    f"{_sql_node(field)} {'DESC' if descending else 'ASC'} "
                    f"NULLS {'LAST' if descending else 'FIRST'}"
                )
            order = " ORDER BY " + ", ".join(order_parts) + ", row_id ASC"
        selected_limit = 1 if one else limit
        limit_sql = f" LIMIT {max(0, int(selected_limit))}" if selected_limit is not None else ""
        offset_sql = f" OFFSET {max(0, int(skip))}" if skip else ""
        lock = " FOR UPDATE" if for_update else ""
        selected_data = _projection_expression(projection)
        sql = f"SELECT row_id, {selected_data} AS data FROM {self.table_name} WHERE ({where}){order}{limit_sql}{offset_sql}{lock}"
        executor = connection or self.pool
        return list(await executor.fetch(sql, *compiler.parameters))

    async def _find(
        self,
        query: Optional[Dict[str, Any]],
        *,
        sort_fields: Optional[List[Tuple[str, int]]] = None,
        skip: int = 0,
        limit: Optional[int] = None,
        projection: Optional[Dict[str, int]] = None,
    ) -> List[Dict[str, Any]]:
        rows = await self._rows(
            query,
            sort_fields=sort_fields,
            skip=skip,
            limit=limit,
            projection=projection,
        )
        return [_decode_document(row["data"]) for row in rows]

    def find(self, query: Optional[Dict[str, Any]] = None, projection: Optional[Dict[str, int]] = None) -> PostgresCursor:
        return PostgresCursor(self, query or {}, projection)

    async def find_one(self, query: Optional[Dict[str, Any]] = None, projection: Optional[Dict[str, int]] = None) -> Optional[Dict[str, Any]]:
        rows = await self._rows(query or {}, one=True, projection=projection)
        return _decode_document(rows[0]["data"]) if rows else None

    async def insert_one(self, document: Dict[str, Any]) -> WriteResult:
        await self._ensure_table()
        normalized = json_value(document)
        row_id = await self.pool.fetchval(
            f"INSERT INTO {self.table_name} (data) VALUES ($1::jsonb) RETURNING row_id",
            _json_dump(normalized),
        )
        return WriteResult(inserted_id=int(row_id))

    async def update_one(
        self,
        query: Dict[str, Any],
        update: Dict[str, Any],
        upsert: bool = False,
        array_filters: Optional[List[Dict[str, Any]]] = None,
    ) -> WriteResult:
        await self._ensure_table()
        async with self.pool.acquire() as connection:
            async with connection.transaction():
                rows = await self._rows(query, connection=connection, for_update=True, one=True)
                if not rows:
                    if not upsert:
                        return WriteResult()
                    document = _apply_update(_upsert_base(query), update, array_filters)
                    row_id = await connection.fetchval(
                        f"INSERT INTO {self.table_name} (data) VALUES ($1::jsonb) RETURNING row_id",
                        _json_dump(document),
                    )
                    return WriteResult(upserted_id=int(row_id))
                before = _decode_document(rows[0]["data"])
                after = _apply_update(before, update, array_filters)
                modified = int(after != before)
                if modified:
                    await connection.execute(
                        f"UPDATE {self.table_name} SET data = $1::jsonb, updated_at = NOW() WHERE row_id = $2",
                        _json_dump(after),
                        rows[0]["row_id"],
                    )
                return WriteResult(matched_count=1, modified_count=modified)

    async def update_many(
        self,
        query: Dict[str, Any],
        update: Dict[str, Any],
        upsert: bool = False,
        array_filters: Optional[List[Dict[str, Any]]] = None,
    ) -> WriteResult:
        await self._ensure_table()
        async with self.pool.acquire() as connection:
            async with connection.transaction():
                rows = await self._rows(query, connection=connection, for_update=True)
                if not rows and upsert:
                    document = _apply_update(_upsert_base(query), update, array_filters)
                    row_id = await connection.fetchval(
                        f"INSERT INTO {self.table_name} (data) VALUES ($1::jsonb) RETURNING row_id",
                        _json_dump(document),
                    )
                    return WriteResult(upserted_id=int(row_id))
                modified = 0
                for row in rows:
                    before = _decode_document(row["data"])
                    after = _apply_update(before, update, array_filters)
                    if after != before:
                        await connection.execute(
                            f"UPDATE {self.table_name} SET data = $1::jsonb, updated_at = NOW() WHERE row_id = $2",
                            _json_dump(after),
                            row["row_id"],
                        )
                        modified += 1
                return WriteResult(matched_count=len(rows), modified_count=modified)

    async def delete_one(self, query: Dict[str, Any]) -> WriteResult:
        await self._ensure_table()
        async with self.pool.acquire() as connection:
            async with connection.transaction():
                rows = await self._rows(query, connection=connection, for_update=True, one=True)
                if not rows:
                    return WriteResult()
                await connection.execute(f"DELETE FROM {self.table_name} WHERE row_id = $1", rows[0]["row_id"])
                return WriteResult(deleted_count=1)

    async def delete_many(self, query: Dict[str, Any]) -> WriteResult:
        await self._ensure_table()
        compiler = _QueryCompiler(first_parameter=1)
        where = compiler.compile(query)
        result = await self.pool.execute(
            f"DELETE FROM {self.table_name} WHERE ({where})",
            *compiler.parameters,
        )
        return WriteResult(deleted_count=int(result.rsplit(" ", 1)[-1]))

    async def find_one_and_delete(self, query: Dict[str, Any], projection: Optional[Dict[str, int]] = None) -> Optional[Dict[str, Any]]:
        await self._ensure_table()
        async with self.pool.acquire() as connection:
            async with connection.transaction():
                rows = await self._rows(query, connection=connection, for_update=True, one=True)
                if not rows:
                    return None
                await connection.execute(f"DELETE FROM {self.table_name} WHERE row_id = $1", rows[0]["row_id"])
                return _project(_decode_document(rows[0]["data"]), projection)

    async def count_documents(self, query: Optional[Dict[str, Any]] = None) -> int:
        await self._ensure_table()
        compiler = _QueryCompiler(first_parameter=1)
        where = compiler.compile(query or {})
        return int(await self.pool.fetchval(
            f"SELECT COUNT(*) FROM {self.table_name} WHERE ({where})",
            *compiler.parameters,
        ))

    async def distinct(self, field: str, query: Optional[Dict[str, Any]] = None) -> List[Any]:
        values: List[Any] = []
        for document in await self._find(query or {}):
            value = _get_path(document, field)
            if value is _MISSING:
                continue
            candidates = value if isinstance(value, list) else [value]
            for candidate in candidates:
                if candidate not in values:
                    values.append(candidate)
        return values

    def aggregate(self, pipeline: List[Dict[str, Any]]) -> AggregateCursor:
        return AggregateCursor(self, pipeline)

    async def _aggregate(self, pipeline: List[Dict[str, Any]], length: Optional[int]) -> List[Dict[str, Any]]:
        await self._ensure_table()
        match_query: Dict[str, Any] = {}
        group: Optional[Dict[str, Any]] = None
        for stage in pipeline:
            if "$match" in stage and group is None:
                match_query = stage["$match"]
            elif "$group" in stage and group is None:
                group = stage["$group"]
            else:
                raise ValueError(f"Tahap agregasi tidak didukung: {next(iter(stage), '')}")
        if group is None:
            return await self._find(match_query, limit=length)
        group_field = group.get("_id")
        if not isinstance(group_field, str) or not group_field.startswith("$"):
            raise ValueError("Agregasi PostgreSQL memerlukan group _id berupa field")
        group_node = _sql_node(group_field[1:])
        compiler = _QueryCompiler(first_parameter=1)
        where = compiler.compile(match_query)
        selections = [f"{group_node} AS group_key"]
        for output_name, accumulator in group.items():
            if output_name == "_id":
                continue
            if not _FIELD_NAME.fullmatch(output_name) or not isinstance(accumulator, dict) or "$sum" not in accumulator:
                raise ValueError(f"Accumulator agregasi tidak didukung: {output_name}")
            value = accumulator["$sum"]
            if isinstance(value, (int, float)):
                expression = f"SUM({value})"
            elif isinstance(value, dict) and "$ifNull" in value:
                source, fallback = value["$ifNull"]
                if not isinstance(source, str) or not source.startswith("$") or not isinstance(fallback, (int, float)):
                    raise ValueError(f"Ekspresi $ifNull tidak didukung: {output_name}")
                node = _sql_node(source[1:])
                numeric = f"CASE WHEN jsonb_typeof({node}) = 'number' THEN ({node} #>> '{{}}')::numeric END"
                expression = f"SUM(COALESCE({numeric}, {fallback}))"
            elif isinstance(value, dict) and "$cond" in value:
                condition, truthy, falsy = value["$cond"]
                if (
                    not isinstance(condition, dict)
                    or "$eq" not in condition
                    or not isinstance(truthy, (int, float))
                    or not isinstance(falsy, (int, float))
                ):
                    raise ValueError(f"Ekspresi $cond tidak didukung: {output_name}")
                left, right = condition["$eq"]
                if not isinstance(left, str) or not left.startswith("$"):
                    raise ValueError(f"Ekspresi $eq tidak didukung: {output_name}")
                node = _sql_node(left[1:])
                parameter = compiler._parameter(right)
                expression = f"SUM(CASE WHEN {node} = {parameter} THEN {truthy} ELSE {falsy} END)"
            else:
                raise ValueError(f"Ekspresi $sum tidak didukung: {output_name}")
            selections.append(f"{expression} AS {output_name}")
        limit_sql = f" LIMIT {max(0, int(length))}" if length is not None else ""
        rows = await self.pool.fetch(
            f"SELECT {', '.join(selections)} FROM {self.table_name} WHERE ({where}) "
            f"GROUP BY {group_node}{limit_sql}",
            *compiler.parameters,
        )
        output: List[Dict[str, Any]] = []
        for row in rows:
            group_value = row["group_key"]
            if isinstance(group_value, str):
                group_value = json.loads(group_value)
            item: Dict[str, Any] = {"_id": group_value}
            for name in group:
                if name == "_id":
                    continue
                value = row[name]
                if isinstance(value, Decimal):
                    value = int(value) if value == value.to_integral_value() else float(value)
                item[name] = value
            output.append(item)
        return output

    async def create_index(self, keys: Any, unique: bool = False, sparse: bool = False, **_: Any) -> str:
        await self._ensure_table()
        fields = [(keys, 1)] if isinstance(keys, str) else list(keys)
        paths = [str(field) for field, _direction in fields]
        signature = f"{self.name}|{paths}|{unique}|{sparse}"
        index_name = "idx_doc_" + hashlib.sha1(signature.encode("utf-8")).hexdigest()[:20]
        expressions = ", ".join("document_id" if path == "id" else f"({_sql_node(path)})" for path in paths)
        predicates: List[str] = []
        if sparse:
            predicates.extend(f"{_sql_node(path)} IS NOT NULL" for path in paths)
        unique_sql = "UNIQUE " if unique else ""
        where_sql = f" WHERE {' AND '.join(predicates)}" if predicates else ""
        await self.pool.execute(
            f"CREATE {unique_sql}INDEX IF NOT EXISTS {index_name} ON {self.table_name} ({expressions}){where_sql}"
        )
        return index_name


class PostgresDatabase:
    def __init__(self, url: str, schema_path: Optional[Path] = None):
        if not url:
            raise ValueError("DATABASE_URL wajib diisi")
        self.url = url.replace("postgresql+asyncpg://", "postgresql://", 1)
        parsed = urlsplit(self.url)
        self.name = parsed.path.lstrip("/") or "postgres"
        self.schema_path = schema_path
        self._pool: Optional[asyncpg.Pool] = None
        self._collections: Dict[str, PostgresCollection] = {}
        self._schema_lock = asyncio.Lock()
        self._ensured_tables: set[str] = set()

    @property
    def pool(self) -> asyncpg.Pool:
        if self._pool is None:
            raise RuntimeError("Koneksi PostgreSQL belum dibuka")
        return self._pool

    async def connect(self) -> None:
        if self._pool is not None:
            return
        min_size = max(1, int(os.environ.get("DB_POOL_MIN_SIZE", "1")))
        # A single 1 GB application host should not reserve ten database
        # connections for a lightweight JSONB API. Deployments can still
        # override this for larger hosts with DB_POOL_MAX_SIZE.
        max_size = max(min_size, int(os.environ.get("DB_POOL_MAX_SIZE", "3")))
        self._pool = await asyncpg.create_pool(
            self.url,
            min_size=min_size,
            max_size=max_size,
            command_timeout=float(os.environ.get("DB_COMMAND_TIMEOUT", "60")),
        )
        async with self.pool.acquire() as connection:
            paths = [self.schema_path] if self.schema_path else sorted((Path(__file__).parent / "migrations").glob("*.sql"))
            for path in paths:
                await connection.execute(path.read_text(encoding="utf-8"))

    async def ensure_collection(self, name: str, table_name: str) -> None:
        if table_name in self._ensured_tables:
            return
        if not re.fullmatch(r"app_doc_[A-Za-z0-9_-]+", table_name):
            raise ValueError(f"Nama tabel domain tidak valid: {table_name!r}")
        async with self._schema_lock:
            if table_name in self._ensured_tables:
                return
            async with self.pool.acquire() as connection:
                async with connection.transaction():
                    await connection.execute(
                        f"""
                        CREATE TABLE IF NOT EXISTS {table_name} (
                            row_id BIGSERIAL PRIMARY KEY,
                            data JSONB NOT NULL DEFAULT '{{}}'::JSONB CHECK (jsonb_typeof(data) = 'object'),
                            document_id TEXT GENERATED ALWAYS AS (data->>'id') STORED,
                            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                        )
                        """
                    )
                    await connection.execute(
                        "INSERT INTO app_collection_registry (collection_name, table_name) VALUES ($1, $2) "
                        "ON CONFLICT (collection_name) DO UPDATE SET table_name = EXCLUDED.table_name",
                        name,
                        table_name,
                    )
                    legacy_exists = await connection.fetchval("SELECT to_regclass('public.app_documents') IS NOT NULL")
                    target_count = await connection.fetchval(f"SELECT COUNT(*) FROM {table_name}")
                    if legacy_exists and not target_count:
                        await connection.execute(
                            f"INSERT INTO {table_name} (data, created_at, updated_at) "
                            "SELECT data, created_at, updated_at FROM app_documents WHERE collection_name = $1",
                            name,
                        )
                    suffix = hashlib.sha1(table_name.encode("utf-8")).hexdigest()[:16]
                    await connection.execute(
                        f"CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_id_{suffix} "
                        f"ON {table_name} (document_id) WHERE document_id IS NOT NULL"
                    )
                    await connection.execute(
                        f"CREATE INDEX IF NOT EXISTS idx_domain_data_{suffix} "
                        f"ON {table_name} USING GIN (data jsonb_path_ops)"
                    )
            self._ensured_tables.add(table_name)

    async def close(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None
            self._ensured_tables.clear()
            for collection in self._collections.values():
                collection._ready = False

    async def list_collection_names(self) -> List[str]:
        rows = await self.pool.fetch("SELECT collection_name FROM app_collection_registry ORDER BY collection_name")
        return [str(row["collection_name"]) for row in rows]

    def __getitem__(self, name: str) -> PostgresCollection:
        if name not in self._collections:
            self._collections[name] = PostgresCollection(self, name)
        return self._collections[name]

    def __getattr__(self, name: str) -> PostgresCollection:
        if name.startswith("_"):
            raise AttributeError(name)
        return self[name]


__all__ = ["PostgresDatabase", "json_value", "matches"]
