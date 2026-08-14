from fastapi import HTTPException

from server import (
    AcademicDeadlineItemInput,
    AcademicDeadlineSettingsInput,
    AcademicCalendarEventInput,
    academic_deadline_event_payload,
    academic_deadline_visible_to_user,
    calendar_event_visible_to_user,
    can_manage_academic_calendar,
    class_matches_tahun_ajaran,
    preferred_program_scope_values,
    split_program_scope_values,
    validate_academic_deadline_settings,
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


def test_academic_deadline_visibility_matches_kaprodi_and_lecturer_targets():
    lecturer = {"role": "lecturer", "access_roles": []}
    kaprodi = {"role": "lecturer", "access_roles": ["kaprodi"]}

    assert not academic_deadline_visible_to_user("curriculum_setup", lecturer)
    assert academic_deadline_visible_to_user("curriculum_setup", kaprodi)
    assert academic_deadline_visible_to_user("rps_submission", lecturer)
    assert academic_deadline_visible_to_user("grade_entry", kaprodi)
    assert not academic_deadline_visible_to_user("rps_submission", {"role": "student"})
    assert academic_deadline_visible_to_user("curriculum_setup", {"role": "admin"})


def test_academic_deadline_validation_requires_date_when_enabled():
    payload = AcademicDeadlineSettingsInput(
        academic_year_id="ta-20261",
        deadlines={
            "curriculum_setup": AcademicDeadlineItemInput(
                enabled=True,
                deadline_at="2026-09-01T16:59:00+00:00",
            ),
            "rps_submission": AcademicDeadlineItemInput(enabled=False),
            "grade_entry": AcademicDeadlineItemInput(
                enabled=True,
                deadline_at="2027-01-20T16:59:00+00:00",
            ),
        },
    )
    normalized = validate_academic_deadline_settings(payload)
    assert normalized["academic_year_id"] == "ta-20261"
    assert normalized["deadlines"]["curriculum_setup"]["deadline_at"].startswith("2026-09-01")
    assert normalized["deadlines"]["rps_submission"]["deadline_at"] == ""

    missing_date = payload.model_copy(
        update={
            "deadlines": {
                "rps_submission": AcademicDeadlineItemInput(enabled=True),
            }
        }
    )
    try:
        validate_academic_deadline_settings(missing_date)
    except HTTPException as error:
        assert error.status_code == 400
    else:
        raise AssertionError("Deadline aktif tanpa tanggal harus ditolak")


def test_academic_deadline_event_payload_is_calendar_compatible():
    event = academic_deadline_event_payload(
        "rps_submission",
        {"enabled": True, "deadline_at": "2026-09-10T16:59:00+00:00"},
        "ta-20261",
    )
    assert event["source"] == "academic_deadline"
    assert event["type"] == "academic_deadline"
    assert event["target_role"] == "lecturer"
    assert event["academic_year_id"] == "ta-20261"
    assert event["date"].startswith("2026-09-10")


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
