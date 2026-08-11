from fastapi import HTTPException

from server import (
    AcademicCalendarEventInput,
    calendar_event_visible_to_user,
    can_manage_academic_calendar,
    class_matches_tahun_ajaran,
    preferred_program_scope_values,
    split_program_scope_values,
    validate_academic_calendar_event,
)


def test_academic_calendar_visibility_honors_audience_and_program_scope():
    event = {
        "status": "published",
        "audience": "student",
        "target_prodi_ids": ["prodi-ti"],
    }

    assert calendar_event_visible_to_user(event, {"role": "student", "prodi_id": "prodi-ti"})
    assert not calendar_event_visible_to_user(event, {"role": "student", "prodi_id": "prodi-si"})
    assert not calendar_event_visible_to_user(event, {"role": "lecturer", "prodi_id": "prodi-ti"})
    assert calendar_event_visible_to_user(event, {"role": "admin"})


def test_academic_operator_can_manage_calendar_without_changing_base_role():
    assert can_manage_academic_calendar({"role": "lecturer", "access_roles": ["academic_operator"]})
    assert not can_manage_academic_calendar({"role": "lecturer", "access_roles": []})


def test_calendar_event_validation_normalizes_and_rejects_invalid_range():
    payload = AcademicCalendarEventInput(
        title="Ujian Tengah Semester",
        category="exam",
        start_at="2026-10-12",
        end_at="2026-10-16",
        academic_year_id="ta-20261",
        audience="all",
        target_prodi_ids=["prodi-ti", "prodi-ti", ""],
    )
    normalized = validate_academic_calendar_event(payload)
    assert normalized["category"] == "exam"
    assert normalized["target_prodi_ids"] == ["prodi-ti"]
    assert normalized["start_at"].startswith("2026-10-12")

    invalid_range = payload.model_copy(update={"end_at": "2026-10-01"})
    try:
        validate_academic_calendar_event(invalid_range)
    except HTTPException as error:
        assert error.status_code == 400
    else:
        raise AssertionError("Rentang tanggal terbalik harus ditolak")


def test_dashboard_semester_class_scope_supports_direct_id_and_legacy_year_fields():
    target = {"id": "ta-20261", "tahun": "2026/2027", "semester": "Ganjil"}

    assert class_matches_tahun_ajaran({"tahun_ajaran_id": "ta-20261"}, target, "ta-20261")
    assert class_matches_tahun_ajaran(
        {"academic_year": "2026/2027", "semester": "Ganjil"}, target, "ta-20261"
    )
    assert not class_matches_tahun_ajaran(
        {"academic_year": "2026/2027", "semester": "Genap"}, target, "ta-20261"
    )


def test_program_scope_splits_legacy_multi_program_values_without_duplicates():
    assert split_program_scope_values(
        "BD-D4,PPEM-D4,RKJ-D4",
        ["RKJ-D4", "PTP-D4"],
    ) == ["BD-D4", "PPEM-D4", "RKJ-D4", "PTP-D4"]


def test_active_structural_program_scope_overrides_legacy_profile_programs():
    user = {"prodi_id": "BD-D4,PPEM-D4,RKJ-D4"}
    assert preferred_program_scope_values(user, ["RKJ-D4"]) == ["RKJ-D4"]
