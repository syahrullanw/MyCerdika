"""Guardrails for preserving course and class history.

Course master data is a template for future class offerings. Once a course is
referenced by a class or a KRS document, changing its identity in place can
silently rewrite the meaning of an ongoing or historical learning record.
"""

from __future__ import annotations

from typing import Any, Dict, List, Mapping, Optional


COURSE_IDENTITY_LABELS = {
    "kurikulum_id": "kurikulum",
    "prodi_id": "prodi",
    "kode": "kode",
    "nama": "nama",
    "sks": "SKS",
    "semester_paket": "semester paket",
    "sifat": "sifat",
}


def _as_mapping(value: Any) -> Mapping[str, Any]:
    if isinstance(value, Mapping):
        return value
    if hasattr(value, "model_dump"):
        return value.model_dump()
    if hasattr(value, "dict"):
        return value.dict()
    return {}


def _first(mapping: Mapping[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        if key in mapping:
            return mapping.get(key)
    return default


def _text(value: Any) -> str:
    return str(value or "").strip().casefold()


def _number(value: Any) -> Optional[int]:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _course_total_sks(course: Mapping[str, Any]) -> Optional[int]:
    theory = _number(_first(course, "sks_teori"))
    practical = _number(_first(course, "sks_praktikum")) or 0
    total = _number(_first(course, "sks", "total_sks"))
    if theory is not None:
        return theory + practical
    return total


def _course_identity_value(course: Mapping[str, Any], field: str) -> Any:
    if field == "kurikulum_id":
        return _first(course, "kurikulum_id")
    if field == "prodi_id":
        return _first(course, "prodi_id", "program_id")
    if field == "kode":
        return _first(course, "kode", "code")
    if field == "nama":
        return _first(course, "nama", "name")
    if field == "sks":
        return _course_total_sks(course)
    if field == "semester_paket":
        return _first(course, "semester_paket", "semester")
    if field == "sifat":
        return _first(course, "sifat")
    return None


def course_identity_changes(existing: Mapping[str, Any], incoming: Any) -> List[str]:
    """Return identity fields that would change in an incoming course payload."""
    current = _as_mapping(existing)
    target = _as_mapping(incoming)
    changes: List[str] = []

    fields = (
        ("kurikulum_id", ("kurikulum_id",)),
        ("prodi_id", ("prodi_id", "program_id")),
        ("kode", ("kode", "code")),
        ("nama", ("nama", "name")),
        ("sks", ("sks_teori", "sks_praktikum", "sks", "total_sks", "credits")),
        ("semester_paket", ("semester_paket", "semester")),
        ("sifat", ("sifat",)),
    )

    for field, keys in fields:
        provided_keys = [key for key in keys if key in target]
        if not provided_keys:
            continue
        if field == "sks":
            if "credits" in target:
                target_value = _number(target.get("credits"))
            elif "sks_teori" in target or "sks_praktikum" in target:
                target_value = (_number(target.get("sks_teori")) or 0) + (_number(target.get("sks_praktikum")) or 0)
            else:
                target_value = _number(_first(target, *provided_keys))
            current_value = _course_total_sks(current)
        else:
            target_value = _first(target, *provided_keys)
            current_value = _course_identity_value(current, field)

        if field in {"kode", "nama", "sifat", "prodi_id", "kurikulum_id"}:
            different = _text(current_value) != _text(target_value)
        elif field == "semester_paket":
            current_number = _number(current_value)
            target_number = _number(target_value)
            different = (
                current_number != target_number
                if current_number is not None and target_number is not None
                else _text(current_value) != _text(target_value)
            )
        else:
            different = current_value != target_value
        if different:
            changes.append(field)

    return changes


def course_lecturer_changes(existing: Mapping[str, Any], incoming: Any) -> List[str]:
    """Return lecturer assignment fields that would change."""
    current = _as_mapping(existing)
    target = _as_mapping(incoming)
    changes: List[str] = []

    if "dosen_utama_id" in target and _text(current.get("dosen_utama_id")) != _text(target.get("dosen_utama_id")):
        changes.append("dosen_utama_id")

    if "dosen_anggota_ids" in target:
        current_ids = [str(item).strip() for item in (current.get("dosen_anggota_ids") or []) if str(item).strip()]
        target_ids = [str(item).strip() for item in (target.get("dosen_anggota_ids") or []) if str(item).strip()]
        if current_ids != target_ids:
            changes.append("dosen_anggota_ids")

    return changes


def _course_ids_from_krs(document: Mapping[str, Any]) -> set[str]:
    ids: set[str] = set()
    for key in ("items", "courses"):
        entries = document.get(key) or []
        if isinstance(entries, list):
            ids.update(
                str(item.get("course_id") or "").strip()
                for item in entries
                if isinstance(item, Mapping) and str(item.get("course_id") or "").strip()
            )
    direct_id = str(document.get("course_id") or "").strip()
    if direct_id:
        ids.add(direct_id)
    return ids


async def course_usage_summary(db: Any, course_id: str) -> Dict[str, Any]:
    """Find class/KRS references that make a course master record historical."""
    classes = await db.classes.find(
        {"course_id": course_id, "status": {"$ne": "deleted"}},
        {"_id": 0, "id": 1, "status": 1},
    ).to_list(None)

    krs_documents: List[Dict[str, Any]] = []
    krs_collection = getattr(db, "krs", None)
    if krs_collection is not None:
        candidates = await krs_collection.find(
            {},
            {"_id": 0, "course_id": 1, "items": 1, "courses": 1},
        ).to_list(None)
        krs_documents = [document for document in candidates if course_id in _course_ids_from_krs(document)]

    return {
        "locked": bool(classes or krs_documents),
        "class_count": len(classes),
        "class_statuses": sorted({str(item.get("status") or "active") for item in classes}),
        "krs_count": len(krs_documents),
    }


def course_usage_description(usage: Mapping[str, Any]) -> str:
    references: List[str] = []
    class_count = int(usage.get("class_count") or 0)
    krs_count = int(usage.get("krs_count") or 0)
    if class_count:
        references.append(f"{class_count} kelas")
    if krs_count:
        references.append(f"{krs_count} dokumen KRS")
    return " dan ".join(references) or "riwayat akademik"


def course_identity_lock_detail(usage: Mapping[str, Any], changes: List[str]) -> str:
    labels = [COURSE_IDENTITY_LABELS.get(field, field) for field in changes]
    changed_labels = ", ".join(labels)
    return (
        f"Mata kuliah sudah digunakan oleh {course_usage_description(usage)}. "
        f"Perubahan identitas ({changed_labels}) dikunci agar riwayat KRS, nilai, dan pembelajaran tidak berubah. "
        "Buat Mata Kuliah pengganti untuk perubahan substantif."
    )


def course_lecturer_lock_detail(usage: Mapping[str, Any]) -> str:
    return (
        f"Mata kuliah sudah digunakan oleh {course_usage_description(usage)}. "
        "Perubahan dosen dilakukan pada kelas melalui menu Jadwal Mengajar > Ganti Dosen "
        "agar penugasan kelas dan riwayat pembelajaran tetap jelas."
    )
