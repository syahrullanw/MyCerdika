import asyncio

from course_lifecycle import (
    course_identity_changes,
    course_lecturer_changes,
    course_usage_summary,
)


class FakeCursor:
    def __init__(self, documents):
        self.documents = documents

    async def to_list(self, _limit=None):
        return list(self.documents)


class FakeCollection:
    def __init__(self, documents):
        self.documents = documents

    def find(self, _query=None, _projection=None):
        return FakeCursor(self.documents)


class FakeDatabase:
    def __init__(self, classes, krs):
        self.classes = FakeCollection(classes)
        self.krs = FakeCollection(krs)


def test_course_identity_change_detects_substantive_edits():
    existing = {
        "kurikulum_id": "kur-1",
        "prodi_id": "prodi-1",
        "code": "MK01",
        "name": "Pemrograman Web",
        "sks_teori": 2,
        "sks_praktikum": 1,
        "semester_paket": 3,
        "sifat": "wajib",
    }
    incoming = {
        "kurikulum_id": "kur-1",
        "prodi_id": "prodi-1",
        "kode": "MK01",
        "nama": "Pemrograman Web Lanjut",
        "sks_teori": 3,
        "sks_praktikum": 1,
        "semester_paket": 4,
        "sifat": "pilihan",
    }

    assert course_identity_changes(existing, incoming) == ["nama", "sks", "semester_paket", "sifat"]


def test_lecturer_change_is_separate_from_course_identity():
    existing = {"dosen_utama_id": "d-1", "dosen_anggota_ids": ["d-2"]}
    assert course_identity_changes(existing, {"kode": "MK01"}) == ["kode"]
    assert course_lecturer_changes(existing, {"dosen_utama_id": "d-3", "dosen_anggota_ids": ["d-2"]}) == ["dosen_utama_id"]


def test_course_usage_summary_finds_class_and_krs_references():
    usage = asyncio.run(
        course_usage_summary(
            FakeDatabase(
                classes=[{"id": "class-1", "course_id": "course-1", "status": "active"}],
                krs=[{"id": "krs-1", "items": [{"course_id": "course-1"}]}],
            ),
            "course-1",
        )
    )

    assert usage["locked"] is True
    assert usage["class_count"] == 1
    assert usage["krs_count"] == 1
