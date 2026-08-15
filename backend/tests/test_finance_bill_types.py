import asyncio
from types import SimpleNamespace

from routers.keuangan import (
    CreateBillInput,
    GenerateComponentBillsInput,
    create_tuition_bill,
    ensure_default_finance_components,
    generate_bills_from_component,
)


class FakeCursor:
    def __init__(self, items):
        self.items = list(items)

    async def to_list(self, _limit=None):
        return [dict(item) for item in self.items]


class FakeCollection:
    def __init__(self, items=None):
        self.items = list(items or [])

    async def find_one(self, query, _projection=None):
        for item in self.items:
            if self._matches(item, query):
                return dict(item)
        return None

    def find(self, query=None, _projection=None):
        return FakeCursor([item for item in self.items if self._matches(item, query or {})])

    async def insert_one(self, item):
        self.items.append(dict(item))

    @staticmethod
    def _matches(item, query):
        for key, expected in query.items():
            if key == "status" and isinstance(expected, dict) and "$nin" in expected:
                if item.get(key) in expected["$nin"]:
                    return False
                continue
            if key == "role" and item.get(key) != expected:
                return False
            if isinstance(expected, dict) and "$in" in expected:
                if item.get(key) not in expected["$in"]:
                    return False
                continue
            if item.get(key) != expected:
                return False
        return True


class FakeDb:
    def __init__(self):
        self.finance_components = FakeCollection([])
        self.finance_schemes = FakeCollection([])
        self.finance_scheme_rules = FakeCollection([])
        self.academic_periods = FakeCollection([{
            "id": "period-20261",
            "code": "20261",
            "name": "2026/2027 Ganjil",
            "is_active": True,
        }])
        self.tuition_bills = FakeCollection([])
        self.tuition_payments = FakeCollection([])
        self.users = FakeCollection([
            {"id": "student-1", "role": "student", "status": "active", "name": "Alya", "nim": "2604010001", "prodi_id": "prodi-rkj"},
            {"id": "student-2", "role": "student", "status": "active", "name": "Bima", "nim": "2604010002", "prodi_id": "prodi-bd"},
        ])


def make_request(db):
    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(db=db)))


def test_default_bill_types_are_seeded_once():
    db = FakeDb()

    first = asyncio.run(ensure_default_finance_components(db))
    second = asyncio.run(ensure_default_finance_components(db))

    assert {item["code"] for item in first} == {"UKT", "GEDUNG"}
    assert second == []
    assert len(db.finance_components.items) == 2


def test_manual_bill_can_use_a_bill_type_for_one_student():
    db = FakeDb()
    asyncio.run(ensure_default_finance_components(db))
    ukt = next(item for item in db.finance_components.items if item["code"] == "UKT")

    result = asyncio.run(create_tuition_bill(
        CreateBillInput(
            student_id="student-1",
            component_id=ukt["id"],
            amount=2750000,
            academic_period_id="period-20261",
        ),
        make_request(db),
        {},
    ))

    assert result["bill"]["bill_type_code"] == "UKT"
    assert result["bill"]["title"] == "UKT"
    assert result["bill"]["amount"] == 2750000


def test_component_generator_creates_for_all_active_students_and_skips_duplicates():
    db = FakeDb()
    asyncio.run(ensure_default_finance_components(db))
    gedung = next(item for item in db.finance_components.items if item["code"] == "GEDUNG")
    payload = GenerateComponentBillsInput(
        component_id=gedung["id"],
        academic_period_id="period-20261",
        amount=5000000,
    )

    first = asyncio.run(generate_bills_from_component(payload, make_request(db), {}))
    second = asyncio.run(generate_bills_from_component(payload, make_request(db), {}))

    assert first["created"] == 2
    assert first["skipped"] == 0
    assert second["created"] == 0
    assert second["skipped"] == 2
    assert {bill["bill_type_code"] for bill in db.tuition_bills.items} == {"GEDUNG"}


def test_component_generator_can_target_one_program_study():
    db = FakeDb()
    asyncio.run(ensure_default_finance_components(db))
    ukt = next(item for item in db.finance_components.items if item["code"] == "UKT")
    payload = GenerateComponentBillsInput(
        component_id=ukt["id"],
        prodi_id="prodi-rkj",
        academic_period_id="period-20261",
        amount=2750000,
    )

    result = asyncio.run(generate_bills_from_component(payload, make_request(db), {}))

    assert result["created"] == 1
    assert result["skipped"] == 0
    assert result["bills"][0]["student_id"] == "student-1"
    assert result["bills"][0]["amount"] == 2750000
