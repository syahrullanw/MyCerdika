"""Regression coverage for ordinary-lecturer data scopes."""

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import server
from program_scope import resolve_program_identifiers
from routers.akademik import _active_period_identifiers
from routers.kurikulum import list_kurikulum
from routers.master_data import _fetch_jadwal_mengajar


def _matches(document, query):
    for key, expected in query.items():
        if key == "$or":
            if not any(_matches(document, branch) for branch in expected):
                return False
            continue
        actual = document.get(key)
        if isinstance(expected, dict):
            if "$ne" in expected and actual == expected["$ne"]:
                return False
            if "$in" in expected and actual not in expected["$in"]:
                return False
            if "$nin" in expected and actual in expected["$nin"]:
                return False
        elif actual != expected:
            return False
    return True


class FakeCursor:
    def __init__(self, items):
        self.items = [dict(item) for item in items]

    def sort(self, *_args):
        return self

    async def to_list(self, limit=None):
        items = self.items if limit in (None, 0) else self.items[:limit]
        return [dict(item) for item in items]


class FakeCollection:
    def __init__(self, items):
        self.items = [dict(item) for item in items]

    def find(self, query, _projection=None):
        return FakeCursor(item for item in self.items if _matches(item, query))

    async def find_one(self, query, _projection=None):
        return next((dict(item) for item in self.items if _matches(item, query)), None)

    async def distinct(self, field, query=None):
        source = self.items if not query else [item for item in self.items if _matches(item, query)]
        return list({item.get(field) for item in source if item.get(field) is not None})

    async def count_documents(self, query):
        return len([item for item in self.items if _matches(item, query)])


class FakeAggregateCollection(FakeCollection):
    def aggregate(self, _pipeline):
        return FakeCursor([])


def _database(**collections):
    return SimpleNamespace(**{
        name: value if isinstance(value, FakeCollection) else FakeCollection(value)
        for name, value in collections.items()
    })


PROGRAMS = [
    {"id": "RKJ-D4", "code": "RKJ-D4", "kode": "RKJ-D4", "name": "REKAYASA KOMPUTER JARINGAN", "nama": "REKAYASA KOMPUTER JARINGAN", "status": "active"},
    {"id": "PPEM-D4", "code": "PPEM-D4", "kode": "PPEM-D4", "name": "PPEM", "nama": "PPEM", "status": "active"},
]

LECTURER = {
    "id": "lecturer-1",
    "username": "lecturer-1",
    "nidn": "nidn-1",
    "role": "lecturer",
    "prodi_id": "RKJ-D4",
    "homebase": "REKAYASA KOMPUTER JARINGAN",
    "access_roles": [],
}

KAPRODI = {
    **LECTURER,
    "id": "kaprodi-1",
    "username": "kaprodi-1",
    "nidn": "nidn-kaprodi",
    "access_roles": ["kaprodi"],
    "access_scope_prodi_ids": ["RKJ-D4"],
}


def test_program_aliases_expand_homebase_id_to_code_and_name():
    db = _database(programs=PROGRAMS)

    values = asyncio.run(resolve_program_identifiers(db, "RKJ-D4"))

    assert "RKJ-D4" in values
    assert "REKAYASA KOMPUTER JARINGAN" in values
    assert "PPEM-D4" not in values


def test_kurikulum_for_ordinary_lecturer_is_limited_to_homebase():
    db = _database(
        programs=PROGRAMS,
        kurikulum=[
            {"id": "kur-rkj", "prodi_id": "RKJ-D4", "prodi_nama": "REKAYASA KOMPUTER JARINGAN"},
            {"id": "kur-ppem", "prodi_id": "PPEM-D4", "prodi_nama": "PPEM"},
        ],
    )

    rows = asyncio.run(list_kurikulum(object(), db=db, user=dict(LECTURER)))

    assert [row["id"] for row in rows] == ["kur-rkj"]


def test_kurikulum_for_kaprodi_is_limited_to_led_program():
    db = _database(
        programs=PROGRAMS,
        jabatan_assignments=[
            {"user_id": "kaprodi-1", "jabatan_kode": "KAPRODI", "prodi_id": "RKJ-D4", "status": "active"},
        ],
        kurikulum=[
            {"id": "kur-rkj", "prodi_id": "RKJ-D4", "prodi_nama": "REKAYASA KOMPUTER JARINGAN"},
            {"id": "kur-ppem", "prodi_id": "PPEM-D4", "prodi_nama": "PPEM"},
        ],
    )

    rows = asyncio.run(list_kurikulum(object(), db=db, user=dict(KAPRODI)))

    assert [row["id"] for row in rows] == ["kur-rkj"]


def test_schedule_combines_own_classes_with_active_homebase_classes_only():
    db = _database(
        programs=PROGRAMS,
        classes=[
            {"id": "own-cross-prodi", "status": "active", "academic_year": "2026/2027", "semester": "Ganjil", "program_id": "PPEM-D4", "lecturer_id": "lecturer-1", "sks": 3},
            {"id": "homebase-active", "status": "active", "academic_year": "2026/2027", "semester": "Ganjil", "program_id": "RKJ-D4", "lecturer_id": "lecturer-2", "sks": 3},
            {"id": "homebase-ended", "status": "ended", "academic_year": "2026/2027", "semester": "Ganjil", "program_id": "RKJ-D4", "lecturer_id": "lecturer-2", "sks": 3},
            {"id": "other-active", "status": "active", "academic_year": "2026/2027", "semester": "Ganjil", "program_id": "PPEM-D4", "lecturer_id": "lecturer-2", "sks": 3},
        ],
        users=[
            {"id": "lecturer-1", "name": "Dosen Satu"},
            {"id": "lecturer-2", "name": "Dosen Dua"},
        ],
        ruangan=[],
        courses=[],
    )

    rows = asyncio.run(_fetch_jadwal_mengajar(
        db,
        tahun_ajaran="2026/2027",
        semester="Ganjil",
        current_user=dict(LECTURER),
    ))

    assert {row["class_id"] for row in rows} == {"own-cross-prodi", "homebase-active"}
    assert next(row for row in rows if row["class_id"] == "own-cross-prodi")["is_own_schedule"] is True
    assert next(row for row in rows if row["class_id"] == "homebase-active")["is_own_schedule"] is False


def test_schedule_for_kaprodi_excludes_every_class_outside_led_program():
    db = _database(
        programs=PROGRAMS,
        jabatan_assignments=[
            {"user_id": "kaprodi-1", "jabatan_kode": "KAPRODI", "prodi_id": "RKJ-D4", "status": "active"},
        ],
        classes=[
            {"id": "rkj-own", "status": "active", "academic_year": "2026/2027", "semester": "Ganjil", "program_id": "RKJ-D4", "lecturer_id": "kaprodi-1", "sks": 3},
            {"id": "rkj-other", "status": "active", "academic_year": "2026/2027", "semester": "Ganjil", "program_id": "RKJ-D4", "lecturer_id": "lecturer-2", "sks": 3},
            {"id": "ppem-own", "status": "active", "academic_year": "2026/2027", "semester": "Ganjil", "program_id": "PPEM-D4", "lecturer_id": "kaprodi-1", "sks": 3},
        ],
        users=[
            {"id": "kaprodi-1", "name": "Kaprodi RKJ"},
            {"id": "lecturer-2", "name": "Dosen RKJ"},
        ],
        ruangan=[],
        courses=[],
    )

    rows = asyncio.run(_fetch_jadwal_mengajar(
        db,
        tahun_ajaran="2026/2027",
        semester="Ganjil",
        prodi_id="PPEM-D4",
        current_user=dict(KAPRODI),
    ))

    assert {row["class_id"] for row in rows} == {"rkj-own", "rkj-other"}


def test_kaprodi_lecturer_directory_only_contains_led_program(monkeypatch):
    database = _database(
        users=[
            {"id": "dosen-rkj", "name": "Dosen RKJ", "role": "lecturer", "prodi_id": "RKJ-D4", "status": "active"},
            {"id": "dosen-ppem", "name": "Dosen PPEM", "role": "lecturer", "prodi_id": "PPEM-D4", "status": "active"},
        ],
    )
    database.classes = FakeAggregateCollection([])
    database.stored_files = FakeAggregateCollection([])

    async def structural_scope(_user):
        return ["RKJ-D4"]

    async def resolved_scope(_user, _structural=None):
        return ["RKJ-D4", "REKAYASA KOMPUTER JARINGAN"]

    monkeypatch.setattr(server, "db", database)
    monkeypatch.setattr(server, "active_program_manager_scope_values", structural_scope)
    monkeypatch.setattr(server, "resolved_program_scope_values", resolved_scope)

    rows = asyncio.run(server.list_lecturers(dict(KAPRODI)))

    assert [row["id"] for row in rows] == ["dosen-rkj"]


def test_kaprodi_report_scope_remains_only_classes_they_teach(monkeypatch):
    database = _database(classes=[
        {"id": "own-rkj", "status": "active", "program_id": "RKJ-D4", "lecturer_id": "kaprodi-1"},
        {"id": "other-rkj", "status": "active", "program_id": "RKJ-D4", "lecturer_id": "lecturer-2"},
        {"id": "own-ppem", "status": "active", "program_id": "PPEM-D4", "lecturer_id": "kaprodi-1"},
    ])
    monkeypatch.setattr(server, "db", database)
    server._class_scope_cache.clear()

    class_ids = asyncio.run(server.lecturer_class_ids(dict(KAPRODI)))

    assert set(class_ids) == {"own-rkj", "own-ppem"}


def test_active_krs_period_aliases_include_period_code_and_semester_id():
    db = _database(
        academic_periods=[{"id": "period-old", "code": "20261", "is_active": True}],
        tahun_ajaran=[{"id": "20261", "is_active": True}],
    )

    assert asyncio.run(_active_period_identifiers(db)) == ["20261", "period-old"]


def test_lecturer_can_read_reports_and_student_records_dependencies():
    lecturer = dict(LECTURER)

    assert asyncio.run(server.require_lecturer_or_academic_manager(lecturer)) == lecturer
    assert asyncio.run(server.require_student_records_reader(lecturer)) == lecturer

    with pytest.raises(HTTPException) as raised:
        asyncio.run(server.require_lecturer_or_academic_manager({"id": "student-1", "role": "student"}))
    assert raised.value.status_code == 403


def test_student_records_use_homebase_not_only_owned_classes(monkeypatch):
    database = _database(users=[
        {"id": "student-homebase", "name": "Homebase", "role": "student", "prodi_id": "RKJ-D4", "class_ids": []},
        {"id": "student-other", "name": "Other", "role": "student", "prodi_id": "PPEM-D4", "class_ids": ["own-class"]},
    ])

    async def no_structural_scope(_user):
        return []

    async def homebase_scope(_user, _structural=None):
        return ["RKJ-D4", "REKAYASA KOMPUTER JARINGAN"]

    async def owned_classes(_user, include_deleted=False):
        return ["own-class"]

    async def progress(student_ids, class_ids=None):
        return {student_id: {"class_ids": class_ids or []} for student_id in student_ids}

    monkeypatch.setattr(server, "db", database)
    monkeypatch.setattr(server, "active_program_manager_scope_values", no_structural_scope)
    monkeypatch.setattr(server, "resolved_program_scope_values", homebase_scope)
    monkeypatch.setattr(server, "lecturer_class_ids", owned_classes)
    monkeypatch.setattr(server, "calculate_student_progress_many", progress)

    rows = asyncio.run(server.list_students(dict(LECTURER)))

    assert [row["id"] for row in rows] == ["student-homebase"]
    assert rows[0]["progress"]["class_ids"] == ["own-class"]
