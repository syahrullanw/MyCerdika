"""Regression coverage for teaching-schedule conflict protection."""

import asyncio

import pytest
from fastapi import HTTPException

try:
    from backend.routers.master_data import (
        JadwalMengajarInput,
        _parse_jam,
        _schedule_suggestions,
        _times_overlap,
        update_jadwal_mengajar,
    )
except ImportError:  # Supports running pytest from the backend directory.
    from routers.master_data import (
        JadwalMengajarInput,
        _parse_jam,
        _schedule_suggestions,
        _times_overlap,
        update_jadwal_mengajar,
    )


class FakeCursor:
    def __init__(self, items):
        self.items = list(items)

    async def to_list(self, _limit=None):
        return [dict(item) for item in self.items]


def _matches(document, query):
    for key, expected in query.items():
        actual = document.get(key)
        if isinstance(expected, dict):
            if "$ne" in expected and actual == expected["$ne"]:
                return False
            if "$in" in expected and actual not in expected["$in"]:
                return False
        elif actual != expected:
            return False
    return True


class FakeCollection:
    def __init__(self, items):
        self.items = [dict(item) for item in items]
        self.updated = []

    async def find_one(self, query, _projection=None):
        return next((dict(item) for item in self.items if _matches(item, query)), None)

    def find(self, query, _projection=None):
        return FakeCursor([item for item in self.items if _matches(item, query)])

    async def update_one(self, query, update):
        self.updated.append((query, update))


def test_parse_jam_rejects_invalid_clock_values_and_overlap_boundary_is_safe():
    assert _parse_jam("08:00") == 480
    assert _parse_jam("23:59") == 1439
    assert _parse_jam("24:00") == -1
    assert _parse_jam("08:60") == -1
    assert _parse_jam("8.00") == -1
    assert _times_overlap(480, 580, 580, 680) is False
    assert _times_overlap(480, 580, 579, 680) is True


def test_suggestions_avoid_same_lecturer_and_same_room():
    class_doc = {"id": "target", "lecturer_id": "lecturer-1"}
    scheduled = [
        {
            "id": "lecturer-conflict",
            "jadwal_hari": 1,
            "jadwal_jam_mulai": "08:00",
            "jadwal_jam_selesai": "09:40",
            "lecturer_id": "lecturer-1",
            "ruangan_id": "room-2",
        },
        {
            "id": "room-conflict",
            "jadwal_hari": 1,
            "jadwal_jam_mulai": "08:00",
            "jadwal_jam_selesai": "09:40",
            "lecturer_id": "lecturer-2",
            "ruangan_id": "room-1",
        },
    ]
    rooms = [
        {"id": "room-1", "kode": "R1"},
        {"id": "room-2", "kode": "R2"},
        {"id": "room-3", "kode": "R3"},
    ]

    suggestions = _schedule_suggestions(
        class_doc=class_doc,
        hari=1,
        mulai=480,
        selesai=580,
        ruangan_id="room-1",
        scheduled_classes=scheduled,
        rooms=rooms,
    )

    assert suggestions
    assert all(
        not (
            suggestion["hari"] == 1
            and suggestion["jam_mulai"] == "08:00"
            and suggestion["ruangan_id"] in {"room-1", "room-2"}
        )
        for suggestion in suggestions
    )
    assert all(suggestion["jam_mulai"] != "08:00" or suggestion["ruangan_id"] == "room-3" for suggestion in suggestions)


def test_update_schedule_returns_conflicts_and_alternatives_but_ignores_ended_classes():
    classes = FakeCollection(
        [
            {
                "id": "target",
                "status": "active",
                "academic_year": "2026/2027",
                "semester": "Ganjil",
                "lecturer_id": "lecturer-1",
                "course_name": "Target Course",
            },
            {
                "id": "active-conflict",
                "status": "active",
                "academic_year": "2026/2027",
                "semester": "Ganjil",
                "jadwal_hari": 1,
                "jadwal_jam_mulai": "08:00",
                "jadwal_jam_selesai": "09:40",
                "lecturer_id": "lecturer-1",
                "ruangan_id": "room-1",
                "course_name": "Existing Course",
            },
            {
                "id": "ended-same-slot",
                "status": "ended",
                "academic_year": "2026/2027",
                "semester": "Ganjil",
                "jadwal_hari": 1,
                "jadwal_jam_mulai": "08:00",
                "jadwal_jam_selesai": "09:40",
                "lecturer_id": "lecturer-1",
                "ruangan_id": "room-1",
                "course_name": "Old Course",
            },
        ]
    )
    rooms = FakeCollection(
        [
            {"id": "room-1", "status": "active", "kode": "R1", "nama": "Ruang 1", "gedung_id": "building-1"},
            {"id": "room-2", "status": "active", "kode": "R2", "nama": "Ruang 2", "gedung_id": "building-1"},
        ]
    )
    database = type("FakeDatabase", (), {"classes": classes, "ruangan": rooms})()

    with pytest.raises(HTTPException) as raised:
        asyncio.run(
            update_jadwal_mengajar(
                "target",
                JadwalMengajarInput(hari=1, jam_mulai="08:00", jam_selesai="09:40", ruangan_id="room-1"),
                request=object(),
                db=database,
                _={},
            )
        )

    error = raised.value
    assert error.status_code == 409
    assert error.detail["conflicts"][0]["class_id"] == "active-conflict"
    assert all(item["class_id"] != "ended-same-slot" for item in error.detail["conflicts"])
    assert error.detail["suggestions"]
    assert not classes.updated
