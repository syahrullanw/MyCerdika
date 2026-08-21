from academic_period_state import (
    academic_year_label,
    choose_canonical_period,
    period_state_update,
)


def test_choose_canonical_period_keeps_only_newest_active_period():
    periods = [
        {
            "id": "20252",
            "tahun": "2025",
            "semester": "Genap",
            "is_active": True,
            "status": "active",
        },
        {
            "id": "20261",
            "tahun": "2026",
            "semester": "Ganjil",
            "is_active": True,
            "status": "active",
        },
    ]

    assert choose_canonical_period(periods)["id"] == "20261"


def test_preferred_period_wins_over_restore_order():
    periods = [
        {"id": "20261", "tahun": "2026", "semester": "Ganjil", "is_active": True},
        {"id": "20252", "tahun": "2025", "semester": "Genap", "is_active": True},
    ]

    assert choose_canonical_period(periods, preferred_id="20252")["id"] == "20252"


def test_inactive_active_marker_becomes_reopenable_draft():
    update = period_state_update(
        {"id": "20252", "is_active": True, "status": "active"},
        "20261",
    )

    assert update == {"is_active": False, "status": "draft"}


def test_academic_year_label_normalizes_short_year_and_genap():
    assert academic_year_label({"tahun": "2026", "semester": "Ganjil"}) == "2026/2027"
    assert academic_year_label({"tahun": "2026", "semester": "Genap"}) == "2025/2026"
