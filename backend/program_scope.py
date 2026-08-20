"""Helpers for resolving program-study identifiers across legacy data shapes."""

from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Sequence


PROGRAM_ALIAS_FIELDS: Sequence[str] = (
    "id",
    "code",
    "kode",
    "name",
    "nama",
)

PROGRAM_RECORD_FIELDS: Sequence[str] = (
    "prodi_id",
    "prodi_kode",
    "program_id",
    "program_code",
    "prodi_name",
    "program_name",
    "nama_prodi",
)


def split_program_identifiers(*sources: Any) -> List[str]:
    """Normalize IDs, codes, names, and legacy CSV fields into unique values."""
    values: List[str] = []
    for source in sources:
        source_values: Iterable[Any]
        if isinstance(source, (list, tuple, set)):
            source_values = source
        else:
            source_values = [source]
        for value in source_values:
            for item in re.split(r"[,;|\n]+", str(value or "")):
                clean = item.strip()
                if clean and clean not in values:
                    values.append(clean)
    return values


async def resolve_program_identifiers(db: Any, *sources: Any) -> List[str]:
    """Expand a program ID/code/name to every alias stored in the program master."""
    raw_values = split_program_identifiers(*sources)
    if not raw_values:
        return []

    lookup = {value.casefold() for value in raw_values}
    resolved = set(raw_values)
    programs = await db.programs.find(
        {"status": {"$ne": "deleted"}},
        {"_id": 0, **{field: 1 for field in PROGRAM_ALIAS_FIELDS}},
    ).to_list(1000)
    for program in programs:
        aliases = split_program_identifiers(
            [program.get(field) for field in PROGRAM_ALIAS_FIELDS]
        )
        if any(alias.casefold() in lookup for alias in aliases):
            resolved.update(aliases)
    return sorted(resolved, key=str.casefold)


def record_matches_program_scope(
    record: Dict[str, Any],
    scope_values: Iterable[str],
    fields: Sequence[str] = PROGRAM_RECORD_FIELDS,
) -> bool:
    """Return whether a document belongs to one of the resolved program aliases."""
    lookup = {str(value or "").strip().casefold() for value in scope_values} - {""}
    if not lookup:
        return False
    return any(
        str(record.get(field) or "").strip().casefold() in lookup
        for field in fields
    )
