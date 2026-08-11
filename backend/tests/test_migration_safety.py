from old_siakad_migration import build_plan
from routers.feeder import hold_finance_entries_for_reconciliation
from routers.master_data import AcademicConfigInput


def test_academic_config_toggle_is_a_partial_update():
    payload = AcademicConfigInput(use_fakultas=False)

    assert payload.model_dump(exclude_unset=True, exclude_none=True) == {
        "use_fakultas": False,
    }


def test_finance_updates_are_held_when_reconciliation_has_exceptions():
    entries = [
        {"collection": "programs", "status": "ready_update", "action": "update"},
        {"collection": "tuition_bills", "status": "ready_create", "action": "create"},
        {"collection": "tuition_payments", "status": "unchanged", "action": "none"},
    ]

    held = hold_finance_entries_for_reconciliation(
        entries,
        {"finance_migration_exceptions": 1},
    )

    assert held == 1
    assert entries[0]["status"] == "ready_update"
    assert entries[1]["status"] == "reconciliation_hold"
    assert entries[1]["action"] == "review"
    assert entries[2]["status"] == "unchanged"


def test_incremental_plan_tracks_faculty_without_removing_it_when_hidden_in_ui():
    current = {
        "users": [], "programs": [], "courses": [], "classes": [],
        "kurikulum": [], "academic_periods": [], "krs": [], "khs": [],
    }
    tables = {
        "fakultas": [{
            "FakultasID": "POLI", "KodePTI": "045067",
            "Nama": "Politeknik Contoh", "NA": "N",
        }],
    }

    updates, _ = build_plan(tables, current, {}, "20261", "latest.json")
    faculty = next(item for item in updates if item.collection == "fakultas")

    assert faculty.query == {"id": "POLI"}
    assert faculty.values["nama"] == "Politeknik Contoh"
    assert faculty.values["status"] == "active"
    assert faculty.upsert is True
