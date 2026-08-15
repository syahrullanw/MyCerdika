"""Regression coverage for the required course lecturer before class creation."""

import asyncio

import pytest
from fastapi import HTTPException

try:
    from backend import server
except ImportError:  # Supports running pytest from the backend directory.
    import server


class FakeCollection:
    def __init__(self, document=None):
        self.document = dict(document or {})
        self.inserted = []

    async def find_one(self, *_args, **_kwargs):
        return dict(self.document) if self.document else None

    async def insert_one(self, document):
        self.inserted.append(dict(document))


class FakeDatabase:
    def __init__(self, course, lecturer=None, program=None):
        self.courses = FakeCollection(course)
        self.users = FakeCollection(lecturer)
        self.classes = FakeCollection()
        self.programs = FakeCollection(program)


def class_payload():
    return server.ClassInput(
        academic_year="2026/2027",
        semester="Ganjil",
        course_id="course-1",
        name="A",
        schedule="",
    )


def test_create_class_rejects_course_without_lecturer(monkeypatch):
    database = FakeDatabase({"id": "course-1", "name": "Algoritma"})
    monkeypatch.setattr(server, "db", database)

    with pytest.raises(HTTPException) as error:
        asyncio.run(server.create_class(class_payload(), {"id": "admin-1", "name": "Admin"}))

    assert error.value.status_code == 409
    assert "dosen pengampu" in str(error.value.detail).lower()
    assert database.classes.inserted == []


def test_create_class_uses_the_assigned_lecturer(monkeypatch):
    database = FakeDatabase(
        {
            "id": "course-1",
            "name": "Algoritma",
            "code": "IF101",
            "dosen_utama_id": "lecturer-1",
            "dosen_utama_nama": "Dosen Uji",
        },
        {"id": "lecturer-1", "name": "Dosen Uji"},
    )
    monkeypatch.setattr(server, "db", database)

    async def passthrough(document):
        return document

    monkeypatch.setattr(server, "enrich_class_payload", passthrough)
    created = asyncio.run(server.create_class(class_payload(), {"id": "admin-1", "name": "Admin"}))

    assert created["lecturer_id"] == "lecturer-1"
    assert created["lecturer_name"] == "Dosen Uji"
    assert len(database.classes.inserted) == 1


def test_create_class_expands_numeric_rombel_name_for_feeder(monkeypatch):
    database = FakeDatabase(
        {
            "id": "course-1",
            "name": "Algoritma",
            "code": "IF101",
            "program_id": "program-1",
            "dosen_utama_id": "lecturer-1",
            "dosen_utama_nama": "Dosen Uji",
        },
        {"id": "lecturer-1", "name": "Dosen Uji"},
        {"id": "program-1", "kode": "RKJ-D4", "nama": "Rekayasa Komputer Jaringan"},
    )
    monkeypatch.setattr(server, "db", database)

    async def passthrough(document):
        return document

    monkeypatch.setattr(server, "enrich_class_payload", passthrough)
    payload = server.ClassInput(
        academic_year="2026/2027",
        semester="Ganjil",
        course_id="course-1",
        name="01",
        schedule="",
    )
    created = asyncio.run(server.create_class(payload, {"id": "admin-1", "name": "Admin"}))

    assert created["name"] == "RKJ01"
