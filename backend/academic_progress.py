"""Pure helpers for curriculum and teaching-lecturer progress reporting."""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional


def _text(value: Any) -> str:
    return str(value or "").strip()


def _program_keys(program: Dict[str, Any]) -> set[str]:
    return {
        _text(program.get(field)).casefold()
        for field in ("id", "kode", "code", "nama", "name")
        if _text(program.get(field))
    }


def _record_program_keys(record: Dict[str, Any]) -> set[str]:
    return {
        _text(record.get(field)).casefold()
        for field in (
            "prodi_id",
            "prodi_kode",
            "prodi_code",
            "prodi_nama",
            "prodi_name",
            "program_id",
            "program_code",
            "program_name",
        )
        if _text(record.get(field))
    }


def _belongs_to_program(record: Dict[str, Any], program_keys: set[str]) -> bool:
    return bool(program_keys.intersection(_record_program_keys(record)))


def _updated_at(record: Dict[str, Any]) -> Optional[str]:
    value = _text(record.get("updated_at")) or _text(record.get("created_at"))
    return value or None


def _latest_timestamp(records: Iterable[Dict[str, Any]]) -> Optional[str]:
    values = [value for value in (_updated_at(record) for record in records) if value]
    return max(values) if values else None


def _current_curriculum(curricula: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    candidates = [
        item
        for item in curricula
        if _text(item.get("status")).casefold() not in {"inactive", "deleted"}
    ]
    if not candidates:
        return None

    # Prefer an active version. If data is still being prepared, a draft is the
    # best available basis for the progress card. The latest timestamp wins
    # when legacy data contains more than one active curriculum.
    candidates.sort(
        key=lambda item: (
            1 if _text(item.get("status")).casefold() == "active" else 0,
            _updated_at(item) or "",
            _text(item.get("tahun_mulai")),
        ),
        reverse=True,
    )
    return candidates[0]


def _course_has_lecturer(course: Dict[str, Any]) -> bool:
    if _text(course.get("dosen_utama_id")) or _text(course.get("dosen_utama_nama")):
        return True
    for field in ("dosen_anggota_ids", "dosen_anggota_namas"):
        value = course.get(field)
        if isinstance(value, list) and any(_text(item) for item in value):
            return True
    return False


def _course_sks(course: Dict[str, Any]) -> float:
    value = course.get("total_sks", course.get("sks"))
    if value is None:
        value = (course.get("sks_teori") or 0) + (course.get("sks_praktikum") or 0)
    try:
        return max(0.0, float(value or 0))
    except (TypeError, ValueError):
        return 0.0


def _percent(numerator: float, denominator: float) -> int:
    if denominator <= 0:
        return 0
    return max(0, min(100, round((numerator / denominator) * 100)))


def _status_label(
    curriculum: Optional[Dict[str, Any]],
    course_count: int,
    assigned_course_count: int,
    curriculum_progress: int,
    overall_progress: int,
) -> str:
    if overall_progress >= 100:
        return "Lengkap"
    if not curriculum:
        return "Belum dimulai"
    if course_count == 0:
        return "Kurikulum belum diisi"
    if assigned_course_count < course_count:
        return "Dosen pengampu belum lengkap"
    if curriculum_progress < 100:
        return "Kurikulum belum mencapai target SKS"
    return "Perlu ditinjau"


def build_curriculum_progress(
    programs: Iterable[Dict[str, Any]],
    curricula: Iterable[Dict[str, Any]],
    courses: Iterable[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Build one explainable progress item for every non-deleted program."""
    curriculum_list = list(curricula)
    course_list = list(courses)
    result: List[Dict[str, Any]] = []

    for program in programs:
        if _text(program.get("status")).casefold() == "deleted":
            continue

        program_keys = _program_keys(program)
        program_curricula = [
            item for item in curriculum_list if _belongs_to_program(item, program_keys)
        ]
        current = _current_curriculum(program_curricula)
        current_id = _text(current.get("id")) if current else ""
        program_courses = [
            item
            for item in course_list
            if current_id and _text(item.get("kurikulum_id")) == current_id
        ]
        # Legacy course documents may not carry kurikulum_id. Only use them if
        # there is no selected curriculum, so courses are never double-counted
        # across curriculum versions.
        if not current_id:
            program_courses = [
                item for item in course_list if _belongs_to_program(item, program_keys)
            ]

        entered_sks = sum(_course_sks(item) for item in program_courses)
        target_sks = 0.0
        if current:
            try:
                target_sks = max(0.0, float(current.get("total_sks_lulus") or 144))
            except (TypeError, ValueError):
                target_sks = 144.0

        assigned_course_count = sum(
            1 for item in program_courses if _course_has_lecturer(item)
        )
        curriculum_progress = _percent(entered_sks, target_sks)
        lecturer_progress = _percent(assigned_course_count, len(program_courses))
        overall_progress = round((curriculum_progress + lecturer_progress) / 2)
        entered_sks_number = float(entered_sks)
        status_label = _status_label(
            current,
            len(program_courses),
            assigned_course_count,
            curriculum_progress,
            overall_progress,
        )

        last_updated_records = list(program_curricula)
        last_updated_records.extend(program_courses)
        result.append(
            {
                "prodi_id": program.get("id"),
                "prodi_kode": program.get("kode") or program.get("code") or "",
                "prodi_nama": program.get("nama") or program.get("name") or "Program Studi",
                "kurikulum_id": current.get("id") if current else None,
                "kurikulum_kode": current.get("kode") if current else None,
                "kurikulum_nama": current.get("nama") if current else None,
                "kurikulum_status": current.get("status") if current else None,
                "kurikulum_count": len(
                    [
                        item
                        for item in program_curricula
                        if _text(item.get("status")).casefold() not in {"inactive", "deleted"}
                    ]
                ),
                "target_sks": int(target_sks) if target_sks.is_integer() else target_sks,
                "entered_sks": int(entered_sks_number) if entered_sks_number.is_integer() else entered_sks_number,
                "course_count": len(program_courses),
                "assigned_course_count": assigned_course_count,
                "curriculum_progress": curriculum_progress,
                "lecturer_progress": lecturer_progress,
                "overall_progress": overall_progress,
                "status_label": status_label,
                "last_updated_at": _latest_timestamp(last_updated_records),
            }
        )

    return sorted(result, key=lambda item: (_text(item["prodi_nama"]).casefold(), item["prodi_id"] or ""))


def summarize_curriculum_progress(items: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    item_list = list(items)
    count = len(item_list)

    def average(field: str) -> int:
        if not count:
            return 0
        return round(sum(float(item.get(field) or 0) for item in item_list) / count)

    timestamps = [item.get("last_updated_at") for item in item_list if item.get("last_updated_at")]
    return {
        "program_count": count,
        "completed_program_count": sum(1 for item in item_list if item.get("overall_progress") == 100),
        "average_progress": average("overall_progress"),
        "average_curriculum_progress": average("curriculum_progress"),
        "average_lecturer_progress": average("lecturer_progress"),
        "last_updated_at": max(timestamps) if timestamps else None,
    }
