"""Keep academic-period state consistent after imports, restores, and edits."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, Optional


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def period_code(document: Dict[str, Any]) -> str:
    return str(document.get("code") or document.get("id") or "").strip()


def academic_year_label(document: Dict[str, Any]) -> str:
    """Return the normalized ``YYYY/YYYY`` label used by class records."""
    raw = str(
        document.get("tahun")
        or document.get("year")
        or document.get("academic_year")
        or document.get("name")
        or document.get("nama")
        or ""
    ).strip()
    match = re.search(r"(\d{4})\s*/\s*(\d{4})", raw)
    if match:
        return f"{match.group(1)}/{match.group(2)}"

    year_match = re.search(r"\d{4}", raw)
    if not year_match:
        return raw
    start_year = int(year_match.group(0))
    semester = str(document.get("semester") or "").strip().lower()
    if semester == "genap":
        return f"{start_year - 1}/{start_year}"
    return f"{start_year}/{start_year + 1}"


def _period_start_year(document: Dict[str, Any]) -> int:
    raw_values = (
        document.get("tahun"),
        document.get("year"),
        document.get("academic_year"),
        document.get("name"),
        document.get("nama"),
        document.get("code"),
        document.get("id"),
    )
    for value in raw_values:
        match = re.search(r"\d{4}", str(value or ""))
        if match:
            return int(match.group(0))
    return -1


def _period_sort_key(document: Dict[str, Any]) -> tuple[Any, ...]:
    semester = str(document.get("semester") or "").strip().lower()
    semester_rank = {"ganjil": 1, "genap": 2, "pendek": 3}.get(semester, 0)
    # Academic year is the primary source of truth. Activation timestamps are
    # only a tie-breaker because restored records can carry the same timestamp.
    return (
        _period_start_year(document),
        semester_rank,
        str(document.get("activated_at") or ""),
        str(document.get("updated_at") or ""),
        period_code(document),
    )


def _matches_preferred(
    document: Dict[str, Any],
    preferred_id: Optional[str],
    preferred_code: Optional[str],
) -> bool:
    values = {
        str(document.get("id") or "").strip(),
        str(document.get("code") or "").strip(),
    }
    return bool(
        (preferred_id and str(preferred_id).strip() in values)
        or (preferred_code and str(preferred_code).strip() in values)
    )


def choose_canonical_period(
    documents: Iterable[Dict[str, Any]],
    *,
    preferred_id: Optional[str] = None,
    preferred_code: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Choose exactly one period to remain active.

    A caller-provided target wins. Otherwise the newest period among records
    marked active wins. If a restore contains no active marker, the newest
    available period is used so the application never boots without a current
    period when period data exists.
    """
    records = [document for document in documents if isinstance(document, dict)]
    if not records:
        return None

    preferred = next(
        (
            document
            for document in records
            if _matches_preferred(document, preferred_id, preferred_code)
        ),
        None,
    )
    if preferred:
        return preferred

    active = [
        document
        for document in records
        if bool(document.get("is_active")) or document.get("status") == "active"
    ]
    return max(active or records, key=_period_sort_key)


def period_state_update(document: Dict[str, Any], active_key: str) -> Dict[str, Any]:
    """Build the state fields for one period without changing other metadata."""
    document_keys = {
        str(document.get("id") or "").strip(),
        str(document.get("code") or "").strip(),
    }
    is_active = str(active_key or "").strip() in document_keys
    update: Dict[str, Any] = {
        "is_active": is_active,
        "status": "active" if is_active else (
            "draft" if document.get("status") == "active" else document.get("status") or "draft"
        ),
    }
    return update


async def normalize_academic_period_state(
    db: Any,
    *,
    preferred_tahun_ajaran_id: Optional[str] = None,
    preferred_period_code: Optional[str] = None,
) -> Dict[str, Any]:
    """Reconcile period flags and migrated classes across both period stores.

    ``tahun_ajaran`` is the source used by the semester wizard. The older
    ``academic_periods`` store is still read by KRS/finance flows, so both are
    normalized when they exist. Only classes that are active/ended and carry
    migration evidence are reopened; intentionally finalized/archived classes
    remain historical.
    """
    tahun_ajaran = await db.tahun_ajaran.find({}, {"_id": 0}).to_list(None)
    target_ta = choose_canonical_period(
        tahun_ajaran,
        preferred_id=preferred_tahun_ajaran_id,
        preferred_code=preferred_period_code,
    )

    changed_tahun_ajaran = 0
    if target_ta:
        active_ta_key = str(target_ta.get("id") or target_ta.get("code") or "").strip()
        for document in tahun_ajaran:
            update = period_state_update(document, active_ta_key)
            if any(document.get(key) != value for key, value in update.items()):
                await db.tahun_ajaran.update_one(
                    {"id": document.get("id")},
                    {"$set": update},
                )
                changed_tahun_ajaran += 1

    academic_periods = await db.academic_periods.find({}, {"_id": 0}).to_list(None)
    target_period = choose_canonical_period(
        academic_periods,
        preferred_code=(
            preferred_period_code
            or (period_code(target_ta) if target_ta else None)
        ),
    )
    changed_academic_periods = 0
    if target_period:
        active_period_key = period_code(target_period)
        for document in academic_periods:
            update = period_state_update(document, active_period_key)
            if any(document.get(key) != value for key, value in update.items()):
                await db.academic_periods.update_one(
                    {"id": document.get("id")},
                    {"$set": update},
                )
                changed_academic_periods += 1

    changed_classes = 0
    active_class_period = target_ta or target_period
    if target_ta:
        active_year = academic_year_label(target_ta)
        active_semester = str(target_ta.get("semester") or "").strip()
        active_ta_id = str(target_ta.get("id") or "").strip()
        active_code = period_code(target_ta)
        class_query = {
            "academic_year": active_year,
            "semester": active_semester,
            "status": {"$in": ["active", "ended"]},
        }
        class_documents = await db.classes.find(class_query, {"_id": 0}).to_list(None)
        for class_document in class_documents:
            has_migration_marker = bool(
                str(class_document.get("period_code") or "").strip() == active_code
                or str(class_document.get("tahun_ajaran_id") or "").strip() == active_ta_id
                or class_document.get("migration_source")
            )
            # A manually ended class must remain ended. Migrated classes do not
            # carry ended_at, so they can safely be reopened when their period
            # becomes the operational period.
            if not has_migration_marker or class_document.get("ended_at"):
                continue
            class_update = {
                "status": "active",
                "tahun_ajaran_id": active_ta_id,
                "tahun_ajaran_label": f"{active_semester} {target_ta.get('tahun', '')}".strip(),
            }
            if all(class_document.get(key) == value for key, value in class_update.items()):
                continue
            class_update["updated_at"] = now_iso()
            result = await db.classes.update_one(
                {"id": class_document.get("id")},
                {"$set": class_update},
            )
            changed_classes += int(getattr(result, "modified_count", 0) or 0)

        await db.app_settings.update_one(
            {"id": "main"},
            {
                "$set": {
                    "active_academic_year": target_ta.get("tahun"),
                    "active_semester": target_ta.get("semester"),
                }
            },
            upsert=True,
        )

    return {
        "active_tahun_ajaran_id": (target_ta or {}).get("id", ""),
        "active_period_code": period_code(target_period) if target_period else "",
        "changed_tahun_ajaran": changed_tahun_ajaran,
        "changed_academic_periods": changed_academic_periods,
        "changed_classes": changed_classes,
        "active_class_period": academic_year_label(active_class_period) if active_class_period else "",
    }
