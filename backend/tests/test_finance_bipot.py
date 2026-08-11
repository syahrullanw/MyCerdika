import asyncio

from old_siakad_finance_migration import build_finance_plan
from routers.keuangan import _bill_document, get_financial_clearance


class _Cursor:
    def __init__(self, documents):
        self.documents = documents

    async def to_list(self, _limit):
        return self.documents


class _Collection:
    def __init__(self, document=None, documents=None):
        self.document = document
        self.documents = documents or []
        self.query = None

    async def find_one(self, query, _projection):
        self.query = query
        return self.document

    def find(self, query, _projection):
        self.query = query
        return _Cursor(self.documents)


def test_scheme_policy_preserves_explicit_zero_thresholds():
    bill = _bill_document(
        student={"id": "student-1", "name": "Alya", "nim": "240001"},
        period={"id": "20261", "code": "20261", "name": "2026/2027 Ganjil"},
        title="UKT",
        items=[{
            "id": "item-1", "component_name": "UKT", "gross_amount": 1_000_000,
            "discount_amount": 0, "scholarship_amount": 0, "paid_amount": 0,
        }],
        due_date="2026-09-01",
        scheme={
            "id": "scheme-1", "krs_min_payment_percent": 0,
            "uts_min_payment_percent": 0, "uas_min_payment_percent": 0,
        },
    )

    assert bill["amount"] == 1_000_000
    assert bill["clearance_policy"] == {
        "krs_min_payment_percent": 0.0,
        "uts_min_payment_percent": 0.0,
        "uas_min_payment_percent": 0.0,
    }


def test_legacy_payment_is_capped_to_paid_bipot_item_and_exception_is_recorded():
    tables = {
        "bipotnama": [{"BIPOTNamaID": "UKT", "Nama": "UKT", "NA": "N"}],
        "bipot": [{"BIPOTID": "SCHEME", "Nama": "Skema", "Tahun": "2026", "NA": "N"}],
        "bipot2": [{"BIPOT2ID": "RULE", "BIPOTID": "SCHEME", "BIPOTNamaID": "UKT", "Besar": "100000", "Jumlah": "1", "NA": "N"}],
        "bipotmhsw": [{"BIPOTMhswID": "ITEM", "MhswID": "MHS-1", "TahunID": "20261", "BIPOTID": "SCHEME", "BIPOTNamaID": "UKT", "Besar": "100000", "Jumlah": "1", "Dibayar": "100000", "NA": "N"}],
        "bayarmhsw": [{"BayarMhswID": "PAY-1", "MhswID": "MHS-1", "TahunID": "20261", "Jumlah": "150000", "NA": "N"}],
        "bayarmhsw2": [{"BayarMhswID": "PAY-1", "BIPOTNamaID": "UKT", "Jumlah": "150000", "NA": "N"}],
    }

    plan, summary = build_finance_plan(tables, "fixture.json")

    assert plan["tuition_payments"][0]["amount"] == 100_000
    assert summary["payment_amount"] == 100_000
    assert summary["unreconciled_payment_amount"] == 50_000
    assert plan["finance_migration_exceptions"][0]["type"] == "unmatched_payment_allocation"


def test_clearance_matches_period_id_and_period_code():
    db = type("FakeDb", (), {
        "academic_periods": _Collection({"id": "period-20261", "code": "20261"}),
        "tuition_bills": _Collection(documents=[]),
    })()

    clearance = asyncio.run(get_financial_clearance(db, "student-1", "20261", "krs"))

    assert clearance["is_clear"] is True
    assert set(db.tuition_bills.query["academic_period_id"]["$in"]) == {"period-20261", "20261"}
