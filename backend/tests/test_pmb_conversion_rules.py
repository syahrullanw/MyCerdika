"""Regression coverage for the PMB-to-SIAKAD conversion guardrails."""

import asyncio

try:
    from backend.routers.pmb import (
        _class_period_matches,
        _class_track_matches,
        _next_student_nim,
        conversion_block_reason,
    )
except ImportError:
    from routers.pmb import (
        _class_period_matches,
        _class_track_matches,
        _next_student_nim,
        conversion_block_reason,
    )


class FakeCursor:
    def __init__(self, items):
        self.items = list(items)

    async def to_list(self, _limit=None):
        return [dict(item) for item in self.items]


class FakeUsers:
    def __init__(self, items):
        self.items = items

    def find(self, *_args, **_kwargs):
        return FakeCursor(self.items)


class FakePrograms:
    def __init__(self, items):
        self.items = items

    def find(self, *_args, **_kwargs):
        return FakeCursor(self.items)


class FakeDatabase:
    def __init__(self, users, programs):
        self.users = FakeUsers(users)
        self.programs = FakePrograms(programs)


def test_conversion_requires_passed_sk_and_reregistration():
    applicant = {
        "test_status": "passed",
        "sk_approved": False,
        "reregistration_status": "pending",
        "prodi_id": "prodi-1",
    }

    assert "SK" in conversion_block_reason(applicant)

    applicant["sk_approved"] = True
    assert "Daftar ulang" in conversion_block_reason(applicant)

    applicant["reregistration_status"] = "completed"
    assert conversion_block_reason(applicant) == ""


def test_class_period_and_track_are_checked():
    context = {
        "tahun_ajaran_id": "ta-2026",
        "academic_year": "2026/2027",
        "semester": "ganjil",
    }
    applicant = {"class_type": "reguler", "learning_mode": "online"}

    current = {
        "tahun_ajaran_id": "ta-2026",
        "status": "active",
        "class_type": "reguler",
        "learning_mode": "online",
    }
    old = {**current, "tahun_ajaran_id": "ta-2025"}
    wrong_track = {**current, "learning_mode": "offline"}

    assert _class_period_matches(current, context)
    assert not _class_period_matches(old, context)
    assert _class_track_matches(current, applicant)
    assert not _class_track_matches(wrong_track, applicant)


def test_nim_sequence_is_per_program_prefix():
    database = FakeDatabase(
        users=[
            {"role": "student", "nim": "2627040001"},
            {"role": "student", "nim": "2627050009"},
        ],
        programs=[
            {"id": "prodi-1", "kode": "RKJ-D4", "nama": "Rekayasa Komputer Jaringan", "nim_code": "04"},
        ],
    )

    nim = asyncio.run(
        _next_student_nim(
            database,
            {"active_period_name": "TA 2026/2027"},
            database.programs.items[0],
            database.programs.items,
        )
    )

    assert nim == "2627040002"
