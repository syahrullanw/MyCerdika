"""Regression tests for the PMB admin payment-proof recovery flow."""

from copy import deepcopy
from types import SimpleNamespace

import pytest

import routers.pmb as pmb


class FakeCollection:
    def __init__(self, document):
        self.document = deepcopy(document)

    async def find_one(self, query, projection=None):
        if query.get("id") != self.document.get("id"):
            return None
        result = deepcopy(self.document)
        for field, include in (projection or {}).items():
            if include == 0:
                result.pop(field, None)
        return result

    async def update_one(self, query, update):
        if query.get("id") == self.document.get("id"):
            self.document.update(deepcopy(update.get("$set") or {}))


class FakeUpload:
    filename = "mutasi-transfer.pdf"

    async def read(self, size=-1):
        return b"%PDF-1.7 admin proof"

    async def close(self):
        return None


def fake_request(db):
    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(db=db)))


@pytest.mark.asyncio
async def test_admin_payment_proof_creates_pending_registration_transaction(monkeypatch):
    applicant = {
        "id": "pmb-admin-proof-1",
        "name": "Calon Mahasiswa",
        "registration_number": "PMB-0001",
        "current_step": 2,
        "reg_payment_fee": 250000,
        "payment_history": [],
    }
    collection = FakeCollection(applicant)
    db = SimpleNamespace(pmb_applicants=collection)

    async def fake_settings(_db):
        return {"registration_fee": 250000, "pra_studi_total_fee": 3500000}

    async def fake_store(_file):
        return {"file_id": "proof_admin_test.pdf", "url": "/api/v1/pmb/proof/proof_admin_test.pdf"}

    monkeypatch.setattr(pmb, "get_or_init_settings", fake_settings)
    monkeypatch.setattr(pmb, "_store_pmb_payment_proof", fake_store)

    result = await pmb.admin_upload_pmb_payment_proof(
        applicant_id=applicant["id"],
        request=fake_request(db),
        file=FakeUpload(),
        kind="registration",
        payment_id="",
        notes="Ditemukan pada mutasi rekening tanggal 20 Agustus",
        user={"id": "admin-1", "name": "Admin PMB"},
    )

    assert result["ok"] is True
    assert result["kind"] == "registration"
    assert result["balances"]["reg_fee_paid"] == 0
    assert result["balances"]["reg_fee_remaining"] == 250000

    saved = collection.document
    assert saved["reg_payment_status"] == "pending_verification"
    assert saved["status"] == "pending_payment_verification"
    assert saved["payment_history"][-1]["status"] == "pending_verification"
    assert saved["payment_history"][-1]["payment_proof"] == result["url"]
    assert saved["payment_history"][-1]["notes"] == "Ditemukan pada mutasi rekening tanggal 20 Agustus"


@pytest.mark.asyncio
async def test_admin_payment_proof_replaces_selected_pending_transaction_without_marking_paid(monkeypatch):
    applicant = {
        "id": "pmb-admin-proof-2",
        "name": "Calon Mahasiswa",
        "registration_number": "PMB-0002",
        "reg_payment_fee": 250000,
        "payment_history": [
            {
                "id": "pay_reg_pending_1",
                "category": "registration",
                "custom_amount": 250000,
                "billed_amount": 250123,
                "payment_method": "MANUAL",
                "payment_proof": "",
                "status": "pending_verification",
            }
        ],
    }
    collection = FakeCollection(applicant)
    db = SimpleNamespace(pmb_applicants=collection)

    async def fake_settings(_db):
        return {"registration_fee": 250000, "pra_studi_total_fee": 3500000}

    async def fake_store(_file):
        return {"file_id": "proof_admin_replace.pdf", "url": "/api/v1/pmb/proof/proof_admin_replace.pdf"}

    monkeypatch.setattr(pmb, "get_or_init_settings", fake_settings)
    monkeypatch.setattr(pmb, "_store_pmb_payment_proof", fake_store)

    result = await pmb.admin_upload_pmb_payment_proof(
        applicant_id=applicant["id"],
        request=fake_request(db),
        file=FakeUpload(),
        kind="registration",
        payment_id="pay_reg_pending_1",
        notes="Bukti tambahan dari admin",
        user={"id": "admin-1", "name": "Admin PMB"},
    )

    assert result["payment_id"] == "pay_reg_pending_1"
    assert len(collection.document["payment_history"]) == 1
    assert collection.document["payment_history"][0]["payment_proof"] == result["url"]
    assert collection.document["payment_history"][0]["status"] == "pending_verification"
    assert collection.document["reg_payment_status"] == "pending_verification"
