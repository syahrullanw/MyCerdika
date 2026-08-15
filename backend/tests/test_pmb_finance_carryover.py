import asyncio

from routers.keuangan import ensure_pmb_carryover_bill


class FakeCursor:
    def __init__(self, items):
        self.items = list(items)

    async def to_list(self, _limit=None):
        return list(self.items)


class FakeCollection:
    def __init__(self, items=None):
        self.items = list(items or [])

    def find(self, query, _projection=None):
        matched = []
        for item in self.items:
            if query.get("bill_id") and item.get("bill_id") != query["bill_id"]:
                continue
            if query.get("status") and item.get("status") != query["status"]:
                continue
            matched.append(dict(item))
        return FakeCursor(matched)

    async def find_one(self, query, _projection=None):
        for item in self.items:
            if query.get("source") and item.get("source") != query["source"]:
                continue
            if query.get("pmb_applicant_id") and item.get("pmb_applicant_id") != query["pmb_applicant_id"]:
                continue
            if query.get("id") and item.get("id") != query["id"]:
                continue
            excluded = (query.get("status") or {}).get("$nin") or []
            if item.get("status") in excluded:
                continue
            return dict(item)
        return None

    async def insert_one(self, item):
        self.items.append(dict(item))

    async def update_one(self, query, update):
        for item in self.items:
            if query.get("id") and item.get("id") != query["id"]:
                continue
            item.update(update.get("$set") or {})
            return


class FakeDb:
    def __init__(self):
        self.academic_periods = FakeCollection([{
            "id": "period-20261",
            "code": "20261",
            "name": "2026/2027 Ganjil",
            "is_active": True,
        }])
        self.tuition_bills = FakeCollection([])
        self.tuition_payments = FakeCollection([])


def test_pmb_carryover_bill_splits_regular_balance_and_is_idempotent():
    db = FakeDb()
    applicant = {
        "id": "app-1",
        "registration_number": "PMB-0001",
        "source": "pmb",
    }
    balances = {
        "reg_fee_remaining": 200000,
        "pra_fee_remaining": 1500000,
        "total_remaining_balance": 1700000,
    }
    student = {"id": "student-1", "name": "Alya", "nim": "2604010001"}

    first = asyncio.run(ensure_pmb_carryover_bill(
        db,
        student=student,
        applicant=applicant,
        balances=balances,
    ))
    second = asyncio.run(ensure_pmb_carryover_bill(
        db,
        student=student,
        applicant=applicant,
        balances=balances,
    ))

    assert first["status"] == "created"
    assert first["amount"] == 1700000
    assert len(first["bill"]["items"]) == 2
    assert second["status"] == "existing"
    assert len(db.tuition_bills.items) == 1


def test_imported_carryover_uses_manual_total_without_default_pra_studi_fee():
    db = FakeDb()
    result = asyncio.run(ensure_pmb_carryover_bill(
        db,
        student={"id": "student-import-1", "name": "Bima", "nim": "2604010002"},
        applicant={
            "id": "pmb_import_student-import-1",
            "registration_number": "2604010002",
            "source": "pmb_excel_import",
            "manual_payment_status": "outstanding",
        },
        balances={
            "reg_fee_remaining": 300000,
            "pra_fee_remaining": 3500000,
            "total_remaining_balance": 300000,
        },
    ))

    assert result["status"] == "created"
    assert result["amount"] == 300000
    assert len(result["bill"]["items"]) == 1
    assert result["bill"]["items"][0]["component_name"] == "Tunggakan PMB (Import Excel)"


def test_imported_pending_review_does_not_create_assumed_debt():
    db = FakeDb()
    result = asyncio.run(ensure_pmb_carryover_bill(
        db,
        student={"id": "student-import-2", "name": "Citra", "nim": "2604010003"},
        applicant={
            "id": "pmb_import_student-import-2",
            "source": "pmb_excel_import",
            "manual_payment_status": "pending",
        },
        balances={
            "reg_fee_remaining": 250000,
            "pra_fee_remaining": 3500000,
            "total_remaining_balance": 3750000,
        },
    ))

    assert result["status"] == "manual_review_required"
    assert result["bill"] is None
    assert db.tuition_bills.items == []


def test_imported_payment_correction_updates_existing_bill_before_payment():
    db = FakeDb()
    applicant = {
        "id": "app-import-correction",
        "registration_number": "IMP-2604010004",
        "source": "pmb_excel_import",
        "manual_payment_status": "outstanding",
    }
    student = {"id": "student-import-4", "name": "Dina", "nim": "2604010004"}

    first = asyncio.run(ensure_pmb_carryover_bill(
        db,
        student=student,
        applicant=applicant,
        balances={"total_remaining_balance": 450000},
    ))
    applicant["manual_payment_status"] = "paid"
    cleared = asyncio.run(ensure_pmb_carryover_bill(
        db,
        student=student,
        applicant=applicant,
        balances={"total_remaining_balance": 0},
    ))

    assert first["status"] == "created"
    assert cleared["status"] == "cleared"
    assert db.tuition_bills.items[0]["status"] == "void"


def test_imported_payment_correction_is_held_after_finance_payment():
    db = FakeDb()
    applicant = {
        "id": "app-import-reconcile",
        "source": "pmb_excel_import",
        "manual_payment_status": "outstanding",
    }
    student = {"id": "student-import-5", "name": "Eka", "nim": "2604010005"}
    first = asyncio.run(ensure_pmb_carryover_bill(
        db,
        student=student,
        applicant=applicant,
        balances={"total_remaining_balance": 500000},
    ))
    db.tuition_bills.items[0]["paid_amount"] = 100000
    applicant["manual_payment_outstanding"] = 700000
    result = asyncio.run(ensure_pmb_carryover_bill(
        db,
        student=student,
        applicant=applicant,
        balances={"total_remaining_balance": 700000},
    ))

    assert first["status"] == "created"
    assert result["status"] == "reconciliation_required"
    assert result["requested_amount"] == 700000
