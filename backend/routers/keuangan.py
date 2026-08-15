"""Pembiayaan mahasiswa: skema BIPOT, tagihan, pembayaran, dan clearance akademik.

Model ini mempertahankan kompatibilitas endpoint tagihan lama, tetapi menyimpan
tagihan sebagai dokumen ber-item agar pembayaran, potongan, beasiswa, cicilan,
dan jejak verifikasi dapat diaudit seperti struktur OLD-SIAKAD.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from postgres_database import PostgresDatabase


router = APIRouter(prefix="/api/v1/keuangan", tags=["SIAKAD Keuangan"])

ACTIVE_BILL_STATUSES = {"unpaid", "partial", "awaiting_verification", "overdue"}
PAYMENT_METHODS = ("QRIS", "VA_BCA", "VA_MANDIRI", "TRANSFER", "CASH", "MANUAL")
FINANCIAL_STAGES = ("krs", "uts", "uas")
DEFAULT_FINANCE_COMPONENTS = (
    {
        "code": "UKT",
        "name": "UKT",
        "category": "tuition",
        "default_amount": 0.0,
        "scholarship_eligible": True,
        "discount_eligible": True,
        "late_fee_eligible": False,
        "is_active": True,
        "is_system": True,
    },
    {
        "code": "GEDUNG",
        "name": "GEDUNG",
        "category": "facility",
        "default_amount": 0.0,
        "scholarship_eligible": False,
        "discount_eligible": True,
        "late_fee_eligible": False,
        "is_active": True,
        "is_system": True,
    },
)


class ComponentInput(BaseModel):
    code: str = Field(min_length=1, max_length=30)
    name: str = Field(min_length=1, max_length=120)
    category: str = "tuition"
    default_amount: float = Field(0, ge=0)
    scholarship_eligible: bool = True
    discount_eligible: bool = True
    late_fee_eligible: bool = False
    is_active: bool = True


class FinanceSchemeInput(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=120)
    academic_year: str = ""
    prodi_id: str = ""
    program_id: str = ""
    is_default: bool = False
    is_active: bool = True
    krs_min_payment_percent: float = Field(0, ge=0, le=100)
    uts_min_payment_percent: float = Field(45, ge=0, le=100)
    uas_min_payment_percent: float = Field(100, ge=0, le=100)
    notes: str = ""


class FinanceRuleInput(BaseModel):
    component_id: str = Field(min_length=1)
    amount: float = Field(ge=0)
    quantity: int = Field(1, ge=1)
    automatic: bool = True
    charge_stage: str = "registration"
    recurrence: str = "once"
    scholarship_eligible: Optional[bool] = None
    discount_eligible: Optional[bool] = None
    is_active: bool = True


class BillItemInput(BaseModel):
    component_id: str = ""
    component_name: str = ""
    category: str = "tuition"
    amount: float = Field(ge=0)
    quantity: int = Field(1, ge=1)
    scholarship_eligible: bool = True
    discount_eligible: bool = True


class CreateBillInput(BaseModel):
    student_id: str = Field(min_length=1)
    academic_period_id: Optional[str] = None
    component_id: Optional[str] = None
    title: str = ""
    amount: Optional[float] = Field(None, ge=0)
    due_date: Optional[str] = None
    scheme_id: str = ""
    category: str = "tuition"
    notes: str = ""
    installment_count: int = Field(1, ge=1, le=24)
    items: List[BillItemInput] = Field(default_factory=list)


class GenerateBillsInput(BaseModel):
    scheme_id: str = Field(min_length=1)
    academic_period_id: Optional[str] = None
    due_date: Optional[str] = None
    student_ids: List[str] = Field(default_factory=list)
    installment_count: int = Field(1, ge=1, le=24)


class GenerateComponentBillsInput(BaseModel):
    component_id: str = Field(min_length=1)
    academic_period_id: Optional[str] = None
    prodi_id: Optional[str] = None
    amount: Optional[float] = Field(None, ge=0)
    title: str = ""
    due_date: Optional[str] = None
    student_ids: List[str] = Field(default_factory=list)
    installment_count: int = Field(1, ge=1, le=24)


class PayBillInput(BaseModel):
    bill_id: str = Field(min_length=1)
    payment_method: str = Field("MANUAL")
    amount: float = Field(gt=0)
    reference_number: str = ""
    proof_url: str = ""
    notes: str = ""


class VerifyPaymentInput(BaseModel):
    action: str = Field(pattern="^(approve|reject)$")
    notes: str = ""


class BillAdjustmentInput(BaseModel):
    adjustment_type: str = Field(pattern="^(discount|scholarship|waiver)$")
    amount: float = Field(gt=0)
    reason: str = Field(min_length=1)
    component_id: str = ""


class PaymentAccountInput(BaseModel):
    name: str = Field(min_length=1)
    bank_name: str = ""
    account_number: str = ""
    account_holder: str = ""
    payment_method: str = "TRANSFER"
    is_active: bool = True


def get_db(request: Request) -> PostgresDatabase:
    return request.app.state.db


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def clean(value: Any) -> str:
    return str(value or "").strip()


def money(value: Any) -> float:
    try:
        return round(float(value or 0), 2)
    except (TypeError, ValueError):
        return 0.0


async def get_current_user_from_request(request: Request) -> Dict[str, Any]:
    auth = request.headers.get("authorization") or ""
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token diperlukan")
    token = auth.replace("Bearer ", "", 1).strip()
    db: PostgresDatabase = request.app.state.db
    session = await db.sessions.find_one({"token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Sesi tidak ditemukan")
    user = await db.users.find_one({"id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Sesi tidak valid")
    request.state.current_user = user
    return user


async def require_campus_admin(request: Request) -> Dict[str, Any]:
    user = await get_current_user_from_request(request)
    if user.get("role") != "admin" and "finance_officer" not in (user.get("access_roles") or []):
        raise HTTPException(status_code=403, detail="Hanya admin kampus atau petugas keuangan aktif yang diizinkan")
    return user


async def get_active_period(db: PostgresDatabase) -> Dict[str, Any]:
    period = await db.academic_periods.find_one({"is_active": True}, {"_id": 0})
    if not period:
        period = {
            "id": "period_default",
            "code": "20251",
            "name": "Tahun Akademik 2025/2026 Ganjil",
        }
    return period


async def ensure_default_finance_components(db: PostgresDatabase) -> List[Dict[str, Any]]:
    """Seed the built-in bill types without overwriting admin settings."""
    created: List[Dict[str, Any]] = []
    for definition in DEFAULT_FINANCE_COMPONENTS:
        code = clean(definition.get("code")).upper()
        existing = await db.finance_components.find_one({"code": code}, {"_id": 0})
        if existing:
            continue
        document = {
            "id": new_id("component"),
            **definition,
            "code": code,
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        await db.finance_components.insert_one(document)
        created.append(document)
    return created


def student_id_candidates(student: Dict[str, Any] | str) -> List[str]:
    if isinstance(student, str):
        return [student] if student else []
    return list(dict.fromkeys(filter(None, [
        clean(student.get("id")),
        clean(student.get("nim")),
        clean(student.get("username")),
    ])))


def _bill_item(
    *,
    component_id: str,
    component_name: str,
    category: str,
    amount: float,
    quantity: int = 1,
    scholarship_eligible: bool = True,
    discount_eligible: bool = True,
    source_rule_id: str = "",
) -> Dict[str, Any]:
    gross_amount = round(money(amount) * max(int(quantity), 1), 2)
    return {
        "id": new_id("billitem"),
        "component_id": clean(component_id) or "MANUAL",
        "component_name": clean(component_name) or "Biaya Pendidikan",
        "category": clean(category) or "tuition",
        "quantity": max(int(quantity), 1),
        "gross_amount": gross_amount,
        "discount_amount": 0.0,
        "scholarship_amount": 0.0,
        "net_amount": gross_amount,
        "paid_amount": 0.0,
        "status": "unpaid" if gross_amount else "paid",
        "scholarship_eligible": bool(scholarship_eligible),
        "discount_eligible": bool(discount_eligible),
        "source_rule_id": clean(source_rule_id),
    }


def _item_net(item: Dict[str, Any]) -> float:
    gross = money(item.get("gross_amount"))
    adjusted = money(item.get("discount_amount")) + money(item.get("scholarship_amount"))
    return round(max(gross - adjusted, 0), 2)


def _refresh_item_statuses(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    refreshed: List[Dict[str, Any]] = []
    for original in items:
        item = dict(original)
        item["gross_amount"] = money(item.get("gross_amount"))
        item["discount_amount"] = money(item.get("discount_amount"))
        item["scholarship_amount"] = money(item.get("scholarship_amount"))
        item["net_amount"] = _item_net(item)
        item["paid_amount"] = min(money(item.get("paid_amount")), item["net_amount"])
        if item["paid_amount"] >= item["net_amount"]:
            item["status"] = "paid"
        elif item["paid_amount"] > 0:
            item["status"] = "partial"
        else:
            item["status"] = "unpaid"
        refreshed.append(item)
    return refreshed


def _bill_totals(items: List[Dict[str, Any]]) -> Dict[str, float]:
    return {
        "gross_amount": round(sum(money(item.get("gross_amount")) for item in items), 2),
        "discount_amount": round(sum(money(item.get("discount_amount")) for item in items), 2),
        "scholarship_amount": round(sum(money(item.get("scholarship_amount")) for item in items), 2),
        "amount": round(sum(money(item.get("net_amount")) for item in items), 2),
        "paid_amount": round(sum(money(item.get("paid_amount")) for item in items), 2),
    }


def _installments(amount: float, count: int, due_date: str) -> List[Dict[str, Any]]:
    count = max(int(count or 1), 1)
    if not amount:
        return []
    base = round(amount / count, 2)
    result = []
    allocated = 0.0
    for sequence in range(1, count + 1):
        installment_amount = base if sequence < count else round(amount - allocated, 2)
        allocated = round(allocated + installment_amount, 2)
        result.append({
            "sequence": sequence,
            "amount": installment_amount,
            "due_date": due_date,
            "status": "unpaid",
        })
    return result


async def _pending_amount(db: PostgresDatabase, bill_id: str) -> float:
    pending = await db.tuition_payments.find(
        {"bill_id": bill_id, "status": "pending"},
        {"_id": 0, "amount": 1},
    ).to_list(1000)
    return round(sum(money(payment.get("amount")) for payment in pending), 2)


async def _refresh_bill(db: PostgresDatabase, bill: Dict[str, Any]) -> Dict[str, Any]:
    items = _refresh_item_statuses(list(bill.get("items") or []))
    totals = _bill_totals(items)
    pending_amount = await _pending_amount(db, bill["id"])
    amount = totals["amount"]
    paid_amount = totals["paid_amount"]
    if amount <= 0 or paid_amount >= amount:
        status = "paid"
    elif pending_amount > 0:
        status = "awaiting_verification"
    elif paid_amount > 0:
        status = "partial"
    else:
        status = "unpaid"
    installments = list(bill.get("installments") or [])
    cumulative_paid = paid_amount
    for installment in installments:
        if cumulative_paid >= money(installment.get("amount")):
            installment["status"] = "paid"
            cumulative_paid = round(cumulative_paid - money(installment.get("amount")), 2)
        elif cumulative_paid > 0:
            installment["status"] = "partial"
            cumulative_paid = 0.0
        else:
            installment["status"] = "unpaid"
    update = {
        "items": items,
        **totals,
        "pending_amount": pending_amount,
        "remaining_amount": round(max(amount - paid_amount, 0), 2),
        "status": status,
        "installments": installments,
        "updated_at": now_iso(),
    }
    await db.tuition_bills.update_one({"id": bill["id"]}, {"$set": update})
    return {**bill, **update}


async def _find_bill_for_user(
    db: PostgresDatabase,
    bill_id: str,
    user: Dict[str, Any],
) -> Dict[str, Any]:
    bill = await db.tuition_bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Tagihan tidak ditemukan")
    if user.get("role") != "admin" and bill.get("student_id") not in student_id_candidates(user):
        raise HTTPException(status_code=403, detail="Anda tidak berhak mengakses tagihan ini")
    return bill


async def get_financial_clearance(
    db: PostgresDatabase,
    student: Dict[str, Any] | str,
    academic_period_id: str,
    stage: str = "krs",
) -> Dict[str, Any]:
    """Nilai kelayakan keuangan untuk KRS/UTS/UAS.

    Tanpa tagihan pada periode tersebut, mahasiswa dianggap clear agar sistem
    belum mengunci mahasiswa ketika generator tagihan belum dijalankan.
    """
    stage = clean(stage).lower() or "krs"
    if stage not in FINANCIAL_STAGES:
        raise HTTPException(status_code=400, detail="Tahap clearance harus krs, uts, atau uas")
    candidates = student_id_candidates(student)
    period_candidates = [clean(academic_period_id)]
    period = await db.academic_periods.find_one(
        {"$or": [{"id": clean(academic_period_id)}, {"code": clean(academic_period_id)}]},
        {"_id": 0, "id": 1, "code": 1},
    )
    if period:
        period_candidates.extend([clean(period.get("id")), clean(period.get("code"))])
    query: Dict[str, Any] = {
        "student_id": {"$in": candidates},
        "academic_period_id": {"$in": list(dict.fromkeys(filter(None, period_candidates)))},
        "status": {"$in": list(ACTIVE_BILL_STATUSES | {"paid"})},
    }
    bills = await db.tuition_bills.find(query, {"_id": 0}).to_list(1000)
    if not bills:
        return {
            "stage": stage,
            "required_percent": 0.0,
            "paid_percent": 100.0,
            "is_clear": True,
            "bill_count": 0,
            "total_amount": 0.0,
            "paid_amount": 0.0,
            "reason": "Belum ada tagihan aktif pada periode ini",
        }
    threshold_field = f"{stage}_min_payment_percent"
    required_percent = max(
        money((bill.get("clearance_policy") or {}).get(threshold_field))
        for bill in bills
    )
    total_amount = round(sum(money(bill.get("amount")) for bill in bills), 2)
    paid_amount = round(sum(money(bill.get("paid_amount")) for bill in bills), 2)
    paid_percent = 100.0 if total_amount <= 0 else round(paid_amount / total_amount * 100, 2)
    return {
        "stage": stage,
        "required_percent": required_percent,
        "paid_percent": paid_percent,
        "is_clear": paid_percent >= required_percent,
        "bill_count": len(bills),
        "total_amount": total_amount,
        "paid_amount": paid_amount,
        "remaining_amount": round(max(total_amount - paid_amount, 0), 2),
        "reason": "Memenuhi batas kelunasan" if paid_percent >= required_percent else (
            f"Minimal pelunasan {required_percent:.0f}% untuk {stage.upper()}"
        ),
    }


async def _student_funding_type(student: Dict[str, Any]) -> str:
    registration = student.get("registration") or {}
    return clean(student.get("jenis_pembiayaan_id") or registration.get("jenis_pembiayaan_id"))


async def _apply_automatic_scholarship(
    items: List[Dict[str, Any]],
    student: Dict[str, Any],
) -> List[Dict[str, Any]]:
    # Referensi OLD SIAKAD: 3 = Beasiswa Penuh. Skema parsial tetap ditangani
    # bendahara melalui adjustment agar nominal dan surat keputusan dapat diaudit.
    if await _student_funding_type(student) != "3":
        return items
    result = []
    for original in items:
        item = dict(original)
        if item.get("scholarship_eligible"):
            item["scholarship_amount"] = money(item.get("gross_amount"))
        result.append(item)
    return result


def _bill_document(
    *,
    student: Dict[str, Any],
    period: Dict[str, Any],
    title: str,
    items: List[Dict[str, Any]],
    due_date: str,
    scheme: Optional[Dict[str, Any]] = None,
    category: str = "tuition",
    notes: str = "",
    installment_count: int = 1,
    source: str = "manual",
) -> Dict[str, Any]:
    items = _refresh_item_statuses(items)
    totals = _bill_totals(items)
    amount = totals["amount"]
    policy_source = scheme or {
        "krs_min_payment_percent": 0.0,
        "uts_min_payment_percent": 45.0,
        "uas_min_payment_percent": 100.0,
    }
    policy = {
        "krs_min_payment_percent": money(policy_source.get("krs_min_payment_percent")),
        "uts_min_payment_percent": money(policy_source.get("uts_min_payment_percent")),
        "uas_min_payment_percent": money(policy_source.get("uas_min_payment_percent")),
    }
    return {
        "id": new_id("bill"),
        "student_id": clean(student.get("id")),
        "student_name": clean(student.get("name")),
        "nim": clean(student.get("nim")),
        "prodi_id": clean(student.get("prodi_id")),
        "prodi_name": clean(student.get("prodi_name") or student.get("prodi_nama")),
        "academic_period_id": clean(period.get("id")),
        "academic_period_code": clean(period.get("code")),
        "academic_period_name": clean(period.get("name")),
        "scheme_id": clean((scheme or {}).get("id")),
        "scheme_code": clean((scheme or {}).get("code")),
        "scheme_name": clean((scheme or {}).get("name")),
        "title": clean(title) or "Tagihan Pembiayaan Mahasiswa",
        "category": clean(category) or "tuition",
        "items": items,
        **totals,
        "pending_amount": 0.0,
        "remaining_amount": round(max(amount - totals["paid_amount"], 0), 2),
        "status": "paid" if amount <= 0 else "unpaid",
        "due_date": clean(due_date),
        "installments": _installments(amount, installment_count, clean(due_date)),
        "adjustments": [],
        "clearance_policy": policy,
        "notes": clean(notes),
        "source": source,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }


def _pmb_carryover_items(
    total_remaining: float,
    imported: bool,
    balances: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Build the finance line items for a PMB opening balance."""
    items: List[Dict[str, Any]] = []
    if imported:
        # Imported workbooks do not carry reliable PMB transaction detail;
        # finance therefore receives the one total manually verified by PMB.
        items.append(_bill_item(
            component_id="PMB-OUTSTANDING",
            component_name="Tunggakan PMB (Import Excel)",
            category="pmb_carryover",
            amount=total_remaining,
            scholarship_eligible=False,
            discount_eligible=False,
        ))
        return items

    registration_remaining = money(balances.get("reg_fee_remaining"))
    pra_studi_remaining = money(balances.get("pra_fee_remaining"))
    if registration_remaining > 0:
        items.append(_bill_item(
            component_id="PMB-REGISTRATION-ARREARS",
            component_name="Sisa Biaya Pendaftaran PMB",
            category="pmb_registration",
            amount=registration_remaining,
            scholarship_eligible=False,
            discount_eligible=False,
        ))
    if pra_studi_remaining > 0:
        items.append(_bill_item(
            component_id="PMB-PRA-STUDI-ARREARS",
            component_name="Sisa Biaya Pra-Studi PMB",
            category="pmb_pra_studi",
            amount=pra_studi_remaining,
            scholarship_eligible=False,
            discount_eligible=False,
        ))
    if not items:
        items.append(_bill_item(
            component_id="PMB-OUTSTANDING",
            component_name="Tunggakan PMB",
            category="pmb_carryover",
            amount=total_remaining,
            scholarship_eligible=False,
            discount_eligible=False,
        ))
    return items


async def ensure_pmb_carryover_bill(
    db: PostgresDatabase,
    *,
    student: Dict[str, Any],
    applicant: Dict[str, Any],
    balances: Dict[str, Any],
    period: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Create one auditable SIAKAD bill for an unpaid PMB balance.

    PMB remains the source of truth for the admission payment history. This
    helper only creates the opening balance in SIAKAD so the debt is visible
    in the regular finance module and can participate in clearance rules.
    Repeated conversion/import-review requests are safe because the bill is
    identified by the PMB applicant id.
    """
    applicant_id = clean(applicant.get("id"))
    student_id = clean(student.get("id"))
    if not applicant_id or not student_id:
        return {"status": "not_required", "created": False, "bill": None, "amount": 0.0}

    imported = clean(applicant.get("source")) == "pmb_excel_import"
    if imported and clean(applicant.get("manual_payment_status")) not in {"paid", "outstanding"}:
        return {
            "status": "manual_review_required",
            "created": False,
            "bill": None,
            "amount": 0.0,
        }

    total_remaining = money(balances.get("total_remaining_balance"))
    existing = await db.tuition_bills.find_one(
        {
            "source": "pmb_carryover",
            "pmb_applicant_id": applicant_id,
            "status": {"$nin": ["cancelled", "void"]},
        },
        {"_id": 0},
    )
    if existing:
        # Payment corrections are allowed before the finance team records a
        # payment. Once a bill has financial activity, do not silently rewrite
        # the ledger; flag it for an explicit finance reconciliation instead.
        pending_amount = 0.0
        payments = getattr(db, "tuition_payments", None)
        if payments is not None:
            pending = await payments.find(
                {"bill_id": clean(existing.get("id")), "status": "pending"},
                {"_id": 0, "amount": 1},
            ).to_list(1000)
            pending_amount = round(sum(money(item.get("amount")) for item in pending), 2)
        has_financial_activity = money(existing.get("paid_amount")) > 0 or pending_amount > 0
        existing_amount = money(existing.get("amount"))

        if has_financial_activity and abs(existing_amount - total_remaining) > 0.009:
            return {
                "status": "reconciliation_required",
                "created": False,
                "bill": existing,
                "amount": existing_amount,
                "requested_amount": total_remaining,
            }
        if has_financial_activity or abs(existing_amount - total_remaining) <= 0.009:
            return {
                "status": "existing",
                "created": False,
                "bill": existing,
                "amount": existing_amount,
            }

        if total_remaining <= 0:
            update = {
                "status": "void",
                "remaining_amount": 0.0,
                "voided_at": now_iso(),
                "void_reason": "Saldo PMB telah dinyatakan lunas pada proses review migrasi.",
                "migration_snapshot": {
                    "captured_at": now_iso(),
                    "reg_fee_remaining": money(balances.get("reg_fee_remaining")),
                    "pra_fee_remaining": money(balances.get("pra_fee_remaining")),
                    "total_remaining_balance": 0.0,
                    "manual_payment_status": clean(applicant.get("manual_payment_status")),
                },
                "updated_at": now_iso(),
            }
            await db.tuition_bills.update_one({"id": existing.get("id")}, {"$set": update})
            return {
                "status": "cleared",
                "created": False,
                "bill": {**existing, **update},
                "amount": 0.0,
            }

        current_period = period or await get_active_period(db)
        items = _pmb_carryover_items(total_remaining, imported, balances)
        totals = _bill_totals(items)
        due_date = clean(applicant.get("converted_at") or applicant.get("updated_at")) or now_iso()
        update = {
            "student_id": student_id,
            "student_name": clean(student.get("name")),
            "nim": clean(student.get("nim")),
            "prodi_id": clean(student.get("prodi_id")),
            "prodi_name": clean(student.get("prodi_name") or student.get("prodi_nama")),
            "academic_period_id": clean(current_period.get("id")),
            "academic_period_code": clean(current_period.get("code")),
            "academic_period_name": clean(current_period.get("name")),
            "items": items,
            **totals,
            "pending_amount": 0.0,
            "remaining_amount": totals["amount"],
            "status": "unpaid",
            "due_date": due_date,
            "installments": _installments(totals["amount"], len(existing.get("installments") or []) or 1, due_date),
            "migration_snapshot": {
                "captured_at": now_iso(),
                "reg_fee_remaining": money(balances.get("reg_fee_remaining")),
                "pra_fee_remaining": money(balances.get("pra_fee_remaining")),
                "total_remaining_balance": total_remaining,
                "manual_payment_status": clean(applicant.get("manual_payment_status")),
            },
            "updated_at": now_iso(),
        }
        await db.tuition_bills.update_one({"id": existing.get("id")}, {"$set": update})
        return {
            "status": "updated",
            "created": False,
            "bill": {**existing, **update},
            "amount": totals["amount"],
        }

    if total_remaining <= 0:
        return {"status": "not_required", "created": False, "bill": None, "amount": 0.0}

    current_period = period or await get_active_period(db)
    items = _pmb_carryover_items(total_remaining, imported, balances)

    registration_number = clean(applicant.get("registration_number"))
    bill = _bill_document(
        student=student,
        period=current_period,
        title=f"Tunggakan PMB{f' — {registration_number}' if registration_number else ''}",
        items=items,
        due_date=clean(applicant.get("converted_at") or applicant.get("updated_at")) or now_iso(),
        category="pmb_carryover",
        notes=(
            "Saldo PMB dipindahkan saat aktivasi SIAKAD. "
            f"Sumber: {'Import Excel' if imported else 'Konversi PMB'}"
        ),
        source="pmb_carryover",
    )
    bill.update({
        "pmb_applicant_id": applicant_id,
        "pmb_registration_number": registration_number,
        "migration_type": "pmb_to_siakad",
        "migration_snapshot": {
            "captured_at": now_iso(),
            "reg_fee_remaining": money(balances.get("reg_fee_remaining")),
            "pra_fee_remaining": money(balances.get("pra_fee_remaining")),
            "total_remaining_balance": total_remaining,
            "manual_payment_status": clean(applicant.get("manual_payment_status")),
        },
    })
    try:
        await db.tuition_bills.insert_one(bill)
    except Exception:
        # A concurrent conversion may have inserted the same carryover bill
        # after the lookup above. The unique sparse index makes that race
        # safe; return the winner instead of creating a second bill.
        concurrent = await db.tuition_bills.find_one(
            {
                "source": "pmb_carryover",
                "pmb_applicant_id": applicant_id,
                "status": {"$nin": ["cancelled", "void"]},
            },
            {"_id": 0},
        )
        if concurrent:
            return {
                "status": "existing",
                "created": False,
                "bill": concurrent,
                "amount": money(concurrent.get("amount")),
            }
        raise
    return {"status": "created", "created": True, "bill": bill, "amount": total_remaining}


@router.get("/components")
async def list_components(
    request: Request,
    _: Dict[str, Any] = Depends(get_current_user_from_request),
):
    db = get_db(request)
    await ensure_default_finance_components(db)
    items = await db.finance_components.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    return {"ok": True, "items": items}


@router.post("/components")
async def create_component(
    payload: ComponentInput,
    request: Request,
    _: Dict[str, Any] = Depends(require_campus_admin),
):
    db = get_db(request)
    code = clean(payload.code).upper()
    if await db.finance_components.find_one({"code": code}, {"_id": 0, "id": 1}):
        raise HTTPException(status_code=409, detail="Kode komponen biaya sudah digunakan")
    document = {"id": new_id("component"), **payload.model_dump(), "code": code, "created_at": now_iso(), "updated_at": now_iso()}
    await db.finance_components.insert_one(document)
    return {"ok": True, "component": document}


@router.put("/components/{component_id}")
async def update_component(
    component_id: str,
    payload: ComponentInput,
    request: Request,
    _: Dict[str, Any] = Depends(require_campus_admin),
):
    db = get_db(request)
    existing = await db.finance_components.find_one({"id": component_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Komponen biaya tidak ditemukan")
    code = clean(payload.code).upper()
    duplicate = await db.finance_components.find_one({"code": code, "id": {"$ne": component_id}}, {"_id": 0, "id": 1})
    if duplicate:
        raise HTTPException(status_code=409, detail="Kode komponen biaya sudah digunakan")
    update = {**payload.model_dump(), "code": code, "updated_at": now_iso()}
    await db.finance_components.update_one({"id": component_id}, {"$set": update})
    return {"ok": True, "component": {**existing, **update}}


@router.get("/schemes")
async def list_schemes(
    request: Request,
    _: Dict[str, Any] = Depends(get_current_user_from_request),
):
    db = get_db(request)
    schemes = await db.finance_schemes.find({}, {"_id": 0}).sort("academic_year", -1).to_list(500)
    rules = await db.finance_scheme_rules.find({}, {"_id": 0}).to_list(2000)
    rules_by_scheme: Dict[str, List[Dict[str, Any]]] = {}
    for rule in rules:
        rules_by_scheme.setdefault(clean(rule.get("scheme_id")), []).append(rule)
    for scheme in schemes:
        scheme["rules"] = rules_by_scheme.get(clean(scheme.get("id")), [])
    return {"ok": True, "items": schemes}


@router.post("/schemes")
async def create_scheme(
    payload: FinanceSchemeInput,
    request: Request,
    _: Dict[str, Any] = Depends(require_campus_admin),
):
    db = get_db(request)
    code = clean(payload.code).upper()
    if await db.finance_schemes.find_one({"code": code}, {"_id": 0, "id": 1}):
        raise HTTPException(status_code=409, detail="Kode skema pembiayaan sudah digunakan")
    document = {"id": new_id("scheme"), **payload.model_dump(), "code": code, "created_at": now_iso(), "updated_at": now_iso()}
    await db.finance_schemes.insert_one(document)
    return {"ok": True, "scheme": document}


@router.put("/schemes/{scheme_id}")
async def update_scheme(
    scheme_id: str,
    payload: FinanceSchemeInput,
    request: Request,
    _: Dict[str, Any] = Depends(require_campus_admin),
):
    db = get_db(request)
    existing = await db.finance_schemes.find_one({"id": scheme_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Skema pembiayaan tidak ditemukan")
    code = clean(payload.code).upper()
    duplicate = await db.finance_schemes.find_one({"code": code, "id": {"$ne": scheme_id}}, {"_id": 0, "id": 1})
    if duplicate:
        raise HTTPException(status_code=409, detail="Kode skema pembiayaan sudah digunakan")
    update = {**payload.model_dump(), "code": code, "updated_at": now_iso()}
    await db.finance_schemes.update_one({"id": scheme_id}, {"$set": update})
    return {"ok": True, "scheme": {**existing, **update}}


@router.post("/schemes/{scheme_id}/rules")
async def create_scheme_rule(
    scheme_id: str,
    payload: FinanceRuleInput,
    request: Request,
    _: Dict[str, Any] = Depends(require_campus_admin),
):
    db = get_db(request)
    scheme = await db.finance_schemes.find_one({"id": scheme_id}, {"_id": 0})
    if not scheme:
        raise HTTPException(status_code=404, detail="Skema pembiayaan tidak ditemukan")
    component = await db.finance_components.find_one({"id": payload.component_id}, {"_id": 0})
    if not component:
        raise HTTPException(status_code=404, detail="Komponen biaya tidak ditemukan")
    duplicate = await db.finance_scheme_rules.find_one(
        {"scheme_id": scheme_id, "component_id": payload.component_id, "charge_stage": payload.charge_stage},
        {"_id": 0, "id": 1},
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="Komponen sudah ada pada skema di tahap penagihan ini")
    document = {
        "id": new_id("rule"),
        "scheme_id": scheme_id,
        "component_id": payload.component_id,
        "component_code": component.get("code", ""),
        "component_name": component.get("name", ""),
        "category": component.get("category", "tuition"),
        **payload.model_dump(),
        "scholarship_eligible": component.get("scholarship_eligible", True) if payload.scholarship_eligible is None else payload.scholarship_eligible,
        "discount_eligible": component.get("discount_eligible", True) if payload.discount_eligible is None else payload.discount_eligible,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.finance_scheme_rules.insert_one(document)
    return {"ok": True, "rule": document}


@router.delete("/schemes/{scheme_id}/rules/{rule_id}")
async def delete_scheme_rule(
    scheme_id: str,
    rule_id: str,
    request: Request,
    _: Dict[str, Any] = Depends(require_campus_admin),
):
    db = get_db(request)
    result = await db.finance_scheme_rules.delete_one({"id": rule_id, "scheme_id": scheme_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Aturan biaya tidak ditemukan")
    return {"ok": True}


@router.get("/periods")
async def list_periods(
    request: Request,
    _: Dict[str, Any] = Depends(get_current_user_from_request),
):
    db = get_db(request)
    periods = await db.academic_periods.find({}, {"_id": 0}).sort("code", -1).to_list(100)
    if not periods:
        periods = [await get_active_period(db)]
    return {"ok": True, "items": periods}


@router.get("/students")
async def list_students_for_finance(
    request: Request,
    _: Dict[str, Any] = Depends(require_campus_admin),
):
    db = get_db(request)
    students = await db.users.find(
        {"role": "student", "status": {"$ne": "deleted"}},
        {"_id": 0, "id": 1, "nim": 1, "name": 1, "prodi_id": 1, "prodi_name": 1, "jenis_pembiayaan_id": 1, "registration": 1},
    ).sort("name", 1).to_list(5000)
    return {"ok": True, "items": students}


@router.get("/bills")
async def list_bills(
    request: Request,
    academic_period_id: str = "",
    status: str = "",
    student_id: str = "",
    user: Dict[str, Any] = Depends(get_current_user_from_request),
):
    db = get_db(request)
    query: Dict[str, Any] = {}
    if user.get("role") != "admin":
        query["student_id"] = {"$in": student_id_candidates(user)}
    elif student_id:
        query["student_id"] = student_id
    if academic_period_id:
        query["academic_period_id"] = academic_period_id
    if status:
        query["status"] = status
    bills = await db.tuition_bills.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)
    return {"ok": True, "bills": bills}


@router.get("/my-bills")
async def list_my_bills(
    request: Request,
    user: Dict[str, Any] = Depends(get_current_user_from_request),
):
    """Endpoint kompatibel untuk portal mahasiswa dan daftar admin."""
    db = get_db(request)
    query: Dict[str, Any] = {}
    if user.get("role") != "admin":
        query["student_id"] = {"$in": student_id_candidates(user)}
    bills = await db.tuition_bills.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)
    return {"ok": True, "bills": bills}


@router.get("/bills/{bill_id}")
async def get_bill(
    bill_id: str,
    request: Request,
    user: Dict[str, Any] = Depends(get_current_user_from_request),
):
    db = get_db(request)
    bill = await _find_bill_for_user(db, bill_id, user)
    payments = await db.tuition_payments.find({"bill_id": bill_id}, {"_id": 0}).sort("submitted_at", -1).to_list(1000)
    return {"ok": True, "bill": bill, "payments": payments}


@router.post("/bills")
async def create_tuition_bill(
    payload: CreateBillInput,
    request: Request,
    _: Dict[str, Any] = Depends(require_campus_admin),
):
    db = get_db(request)
    student = await db.users.find_one({"id": payload.student_id, "role": "student"}, {"_id": 0})
    if not student:
        raise HTTPException(status_code=404, detail="Mahasiswa tidak ditemukan")
    period = await get_active_period(db)
    if payload.academic_period_id:
        period = await db.academic_periods.find_one(
            {"$or": [{"id": payload.academic_period_id}, {"code": payload.academic_period_id}]},
            {"_id": 0},
        ) or {**period, "id": payload.academic_period_id}
    component = None
    if payload.component_id:
        component = await db.finance_components.find_one({"id": payload.component_id}, {"_id": 0})
        if not component:
            raise HTTPException(status_code=404, detail="Jenis tagihan tidak ditemukan")

    scheme = None
    if payload.scheme_id:
        scheme = await db.finance_schemes.find_one({"id": payload.scheme_id}, {"_id": 0})
        if not scheme:
            raise HTTPException(status_code=404, detail="Skema pembiayaan tidak ditemukan")
    items = [
        _bill_item(
            component_id=item.component_id,
            component_name=item.component_name,
            category=item.category,
            amount=item.amount,
            quantity=item.quantity,
            scholarship_eligible=item.scholarship_eligible,
            discount_eligible=item.discount_eligible,
        )
        for item in payload.items
    ]
    if not items:
        if payload.amount is None:
            raise HTTPException(status_code=400, detail="Masukkan minimal satu item atau nominal tagihan")
        items = [_bill_item(
            component_id=component.get("id", "MANUAL") if component else "MANUAL",
            component_name=component.get("name", "") if component else (payload.title or "Biaya Pendidikan"),
            category=component.get("category", payload.category) if component else payload.category,
            amount=payload.amount,
            scholarship_eligible=component.get("scholarship_eligible", True) if component else True,
            discount_eligible=component.get("discount_eligible", True) if component else True,
        )]
    items = await _apply_automatic_scholarship(items, student)
    bill_title = payload.title or (component.get("name") if component else "Biaya Pendidikan")
    bill_category = component.get("category", payload.category) if component else payload.category
    document = _bill_document(
        student=student,
        period=period,
        title=bill_title,
        items=items,
        due_date=payload.due_date or now_iso(),
        scheme=scheme,
        category=bill_category,
        notes=payload.notes,
        installment_count=payload.installment_count,
    )
    if component:
        document.update({
            "bill_type_id": component.get("id", ""),
            "bill_type_code": component.get("code", ""),
            "bill_type_name": component.get("name", ""),
        })
    await db.tuition_bills.insert_one(document)
    return {"ok": True, "message": "Tagihan berhasil dibuat", "bill": document}


@router.post("/generate")
async def generate_bills_from_scheme(
    payload: GenerateBillsInput,
    request: Request,
    _: Dict[str, Any] = Depends(require_campus_admin),
):
    db = get_db(request)
    scheme = await db.finance_schemes.find_one({"id": payload.scheme_id, "is_active": True}, {"_id": 0})
    if not scheme:
        raise HTTPException(status_code=404, detail="Skema pembiayaan aktif tidak ditemukan")
    rules = await db.finance_scheme_rules.find(
        {"scheme_id": payload.scheme_id, "is_active": True, "automatic": True},
        {"_id": 0},
    ).to_list(500)
    if not rules:
        raise HTTPException(status_code=400, detail="Skema belum memiliki aturan biaya otomatis")
    period = await get_active_period(db)
    if payload.academic_period_id:
        period = await db.academic_periods.find_one(
            {"$or": [{"id": payload.academic_period_id}, {"code": payload.academic_period_id}]},
            {"_id": 0},
        ) or {**period, "id": payload.academic_period_id}
    query: Dict[str, Any] = {"role": "student", "status": {"$nin": ["deleted", "inactive", "lulus", "do"]}}
    if payload.student_ids:
        query["id"] = {"$in": payload.student_ids}
    elif scheme.get("prodi_id"):
        query["prodi_id"] = scheme.get("prodi_id")
    students = await db.users.find(query, {"_id": 0}).to_list(5000)
    created = 0
    skipped = 0
    created_bills: List[Dict[str, Any]] = []
    for student in students:
        existing = await db.tuition_bills.find_one(
            {
                "student_id": student.get("id"),
                "academic_period_id": period.get("id"),
                "scheme_id": scheme.get("id"),
                "status": {"$nin": ["cancelled", "void"]},
            },
            {"_id": 0, "id": 1},
        )
        if existing:
            skipped += 1
            continue
        items = [
            _bill_item(
                component_id=rule.get("component_id", ""),
                component_name=rule.get("component_name", ""),
                category=rule.get("category", "tuition"),
                amount=money(rule.get("amount")),
                quantity=int(rule.get("quantity") or 1),
                scholarship_eligible=bool(rule.get("scholarship_eligible", True)),
                discount_eligible=bool(rule.get("discount_eligible", True)),
                source_rule_id=rule.get("id", ""),
            )
            for rule in rules
        ]
        items = await _apply_automatic_scholarship(items, student)
        bill = _bill_document(
            student=student,
            period=period,
            title=f"{scheme.get('name', 'Pembiayaan Mahasiswa')} — {period.get('name', period.get('id', ''))}",
            items=items,
            due_date=payload.due_date or now_iso(),
            scheme=scheme,
            notes="Dibuat oleh generator skema pembiayaan",
            installment_count=payload.installment_count,
            source="scheme_generator",
        )
        await db.tuition_bills.insert_one(bill)
        created += 1
        created_bills.append(bill)
    return {
        "ok": True,
        "message": f"{created} tagihan dibuat, {skipped} dilewati karena sudah ada",
        "created": created,
        "skipped": skipped,
        "bills": created_bills,
    }


@router.post("/generate-type")
async def generate_bills_from_component(
    payload: GenerateComponentBillsInput,
    request: Request,
    _: Dict[str, Any] = Depends(require_campus_admin),
):
    """Generate one bill type, such as UKT or GEDUNG, for students in bulk."""
    db = get_db(request)
    component = await db.finance_components.find_one(
        {"id": payload.component_id, "is_active": True},
        {"_id": 0},
    )
    if not component:
        raise HTTPException(status_code=404, detail="Jenis tagihan aktif tidak ditemukan")

    amount = money(payload.amount if payload.amount is not None else component.get("default_amount"))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Nominal tagihan wajib diisi atau diatur pada jenis tagihan")

    period = await get_active_period(db)
    if payload.academic_period_id:
        period = await db.academic_periods.find_one(
            {"$or": [{"id": payload.academic_period_id}, {"code": payload.academic_period_id}]},
            {"_id": 0},
        ) or {**period, "id": payload.academic_period_id}

    query: Dict[str, Any] = {
        "role": "student",
        "status": {"$nin": ["deleted", "inactive", "lulus", "do"]},
    }
    if payload.student_ids:
        query["id"] = {"$in": payload.student_ids}
    elif payload.prodi_id:
        query["prodi_id"] = payload.prodi_id
    students = await db.users.find(query, {"_id": 0}).to_list(5000)

    created = 0
    skipped = 0
    created_bills: List[Dict[str, Any]] = []
    bill_title = payload.title or f"{component.get('name', 'Tagihan')} — {period.get('name', period.get('id', ''))}"
    for student in students:
        existing = await db.tuition_bills.find_one(
            {
                "student_id": student.get("id"),
                "academic_period_id": period.get("id"),
                "bill_type_id": component.get("id"),
                "status": {"$nin": ["cancelled", "void"]},
            },
            {"_id": 0, "id": 1},
        )
        if existing:
            skipped += 1
            continue

        item = _bill_item(
            component_id=component.get("id", ""),
            component_name=component.get("name", "Tagihan"),
            category=component.get("category", "tuition"),
            amount=amount,
            scholarship_eligible=bool(component.get("scholarship_eligible", True)),
            discount_eligible=bool(component.get("discount_eligible", True)),
        )
        items = await _apply_automatic_scholarship([item], student)
        bill = _bill_document(
            student=student,
            period=period,
            title=bill_title,
            items=items,
            due_date=payload.due_date or now_iso(),
            category=component.get("category", "tuition"),
            notes="Dibuat oleh generator jenis tagihan",
            installment_count=payload.installment_count,
            source="component_generator",
        )
        bill.update({
            "bill_type_id": component.get("id", ""),
            "bill_type_code": component.get("code", ""),
            "bill_type_name": component.get("name", ""),
        })
        await db.tuition_bills.insert_one(bill)
        created += 1
        created_bills.append(bill)

    scope = "mahasiswa terpilih" if payload.student_ids else (
        f"mahasiswa aktif pada prodi {payload.prodi_id}" if payload.prodi_id else "semua mahasiswa aktif"
    )
    return {
        "ok": True,
        "message": f"{created} tagihan {component.get('name', 'jenis')} dibuat untuk {scope}, {skipped} dilewati karena sudah ada",
        "created": created,
        "skipped": skipped,
        "bills": created_bills,
    }


@router.post("/bills/{bill_id}/adjustments")
async def add_bill_adjustment(
    bill_id: str,
    payload: BillAdjustmentInput,
    request: Request,
    user: Dict[str, Any] = Depends(require_campus_admin),
):
    db = get_db(request)
    bill = await db.tuition_bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Tagihan tidak ditemukan")
    if bill.get("paid_amount", 0) > 0:
        raise HTTPException(status_code=400, detail="Potongan tidak dapat ditambahkan setelah pembayaran terverifikasi")
    items = list(bill.get("items") or [])
    eligibility_key = "scholarship_eligible" if payload.adjustment_type in {"scholarship", "waiver"} else "discount_eligible"
    targets = [
        item for item in items
        if (not payload.component_id or item.get("component_id") == payload.component_id)
        and item.get(eligibility_key, False)
    ]
    if not targets:
        raise HTTPException(status_code=400, detail="Tidak ada komponen tagihan yang memenuhi syarat untuk potongan ini")
    remaining_adjustment = money(payload.amount)
    adjustment_key = "scholarship_amount" if payload.adjustment_type in {"scholarship", "waiver"} else "discount_amount"
    for item in items:
        if item not in targets or remaining_adjustment <= 0:
            continue
        adjustable = max(_item_net(item), 0)
        applied = min(adjustable, remaining_adjustment)
        item[adjustment_key] = round(money(item.get(adjustment_key)) + applied, 2)
        remaining_adjustment = round(remaining_adjustment - applied, 2)
    if remaining_adjustment > 0:
        raise HTTPException(status_code=400, detail="Nominal potongan melebihi sisa tagihan yang dapat disesuaikan")
    adjustment = {
        "id": new_id("adjustment"),
        "type": payload.adjustment_type,
        "amount": money(payload.amount),
        "reason": clean(payload.reason),
        "component_id": clean(payload.component_id),
        "created_by": user.get("id", ""),
        "created_at": now_iso(),
    }
    bill["items"] = items
    bill["adjustments"] = [*(bill.get("adjustments") or []), adjustment]
    await db.tuition_bills.update_one({"id": bill_id}, {"$set": {"items": items, "adjustments": bill["adjustments"]}})
    refreshed = await _refresh_bill(db, bill)
    return {"ok": True, "bill": refreshed, "adjustment": adjustment}


@router.post("/pay")
async def submit_tuition_payment(
    payload: PayBillInput,
    request: Request,
    user: Dict[str, Any] = Depends(get_current_user_from_request),
):
    """Ajukan pembayaran. Nilai baru masuk setelah diverifikasi bendahara."""
    db = get_db(request)
    bill = await _find_bill_for_user(db, payload.bill_id, user)
    if bill.get("status") in {"paid", "cancelled", "void"}:
        raise HTTPException(status_code=400, detail="Tagihan ini tidak dapat dibayar")
    method = clean(payload.payment_method).upper()
    if method not in PAYMENT_METHODS:
        raise HTTPException(status_code=400, detail="Metode pembayaran tidak didukung")
    remaining = max(money(bill.get("amount")) - money(bill.get("paid_amount")), 0)
    pending = await _pending_amount(db, bill["id"])
    payable = max(remaining - pending, 0)
    if money(payload.amount) > payable + 0.01:
        raise HTTPException(status_code=400, detail="Nominal melebihi sisa tagihan setelah pengajuan pembayaran lain")
    payment = {
        "id": new_id("payment"),
        "bill_id": bill["id"],
        "student_id": bill.get("student_id", ""),
        "student_name": bill.get("student_name", ""),
        "nim": bill.get("nim", ""),
        "amount": money(payload.amount),
        "payment_method": method,
        "reference_number": clean(payload.reference_number),
        "proof_url": clean(payload.proof_url),
        "notes": clean(payload.notes),
        "status": "pending",
        "submitted_at": now_iso(),
        "verified_at": "",
        "verified_by": "",
        "verification_notes": "",
        "allocations": [],
    }
    await db.tuition_payments.insert_one(payment)
    updated_bill = await _refresh_bill(db, bill)
    return {
        "ok": True,
        "message": "Pengajuan pembayaran diterima dan menunggu verifikasi bendahara",
        "status": payment["status"],
        "bill": updated_bill,
        "payment": payment,
    }


@router.post("/payments/{payment_id}/verify")
async def verify_payment(
    payment_id: str,
    payload: VerifyPaymentInput,
    request: Request,
    user: Dict[str, Any] = Depends(require_campus_admin),
):
    db = get_db(request)
    payment = await db.tuition_payments.find_one({"id": payment_id}, {"_id": 0})
    if not payment:
        raise HTTPException(status_code=404, detail="Pembayaran tidak ditemukan")
    if payment.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Pembayaran ini sudah diverifikasi")
    bill = await db.tuition_bills.find_one({"id": payment.get("bill_id")}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Tagihan pembayaran tidak ditemukan")
    verification = {
        "verified_at": now_iso(),
        "verified_by": user.get("id", ""),
        "verification_notes": clean(payload.notes),
    }
    if payload.action == "reject":
        await db.tuition_payments.update_one({"id": payment_id}, {"$set": {"status": "rejected", **verification}})
        refreshed = await _refresh_bill(db, bill)
        return {"ok": True, "message": "Pengajuan pembayaran ditolak", "bill": refreshed}

    items = _refresh_item_statuses(list(bill.get("items") or []))
    remaining_payment = money(payment.get("amount"))
    allocations = []
    for item in items:
        available = round(max(money(item.get("net_amount")) - money(item.get("paid_amount")), 0), 2)
        if not available or remaining_payment <= 0:
            continue
        allocated = min(available, remaining_payment)
        item["paid_amount"] = round(money(item.get("paid_amount")) + allocated, 2)
        remaining_payment = round(remaining_payment - allocated, 2)
        allocations.append({"item_id": item.get("id"), "component_id": item.get("component_id"), "amount": allocated})
    if remaining_payment > 0.01:
        raise HTTPException(status_code=400, detail="Nominal pembayaran melebihi sisa alokasi tagihan")
    bill["items"] = items
    await db.tuition_bills.update_one({"id": bill["id"]}, {"$set": {"items": items}})
    await db.tuition_payments.update_one(
        {"id": payment_id},
        {"$set": {"status": "verified", "allocations": allocations, **verification}},
    )
    refreshed = await _refresh_bill(db, bill)
    return {"ok": True, "message": "Pembayaran berhasil diverifikasi", "bill": refreshed, "allocations": allocations}


@router.get("/my-clearance")
async def my_financial_clearance(
    request: Request,
    stage: str = "krs",
    academic_period_id: str = "",
    user: Dict[str, Any] = Depends(get_current_user_from_request),
):
    db = get_db(request)
    period = await get_active_period(db)
    clearance = await get_financial_clearance(db, user, academic_period_id or period.get("id", ""), stage)
    return {"ok": True, "clearance": clearance}


@router.get("/clearance/{student_id}")
async def student_financial_clearance(
    student_id: str,
    request: Request,
    stage: str = "krs",
    academic_period_id: str = "",
    _: Dict[str, Any] = Depends(require_campus_admin),
):
    db = get_db(request)
    student = await db.users.find_one({"id": student_id, "role": "student"}, {"_id": 0})
    if not student:
        raise HTTPException(status_code=404, detail="Mahasiswa tidak ditemukan")
    period = await get_active_period(db)
    clearance = await get_financial_clearance(db, student, academic_period_id or period.get("id", ""), stage)
    return {"ok": True, "clearance": clearance}


@router.get("/payment-accounts")
async def list_payment_accounts(
    request: Request,
    _: Dict[str, Any] = Depends(get_current_user_from_request),
):
    db = get_db(request)
    accounts = await db.payment_accounts.find({"is_active": True}, {"_id": 0}).sort("name", 1).to_list(100)
    return {"ok": True, "items": accounts}


@router.post("/payment-accounts")
async def create_payment_account(
    payload: PaymentAccountInput,
    request: Request,
    _: Dict[str, Any] = Depends(require_campus_admin),
):
    db = get_db(request)
    method = clean(payload.payment_method).upper()
    if method not in PAYMENT_METHODS:
        raise HTTPException(status_code=400, detail="Metode pembayaran tidak didukung")
    account = {"id": new_id("account"), **payload.model_dump(), "payment_method": method, "created_at": now_iso(), "updated_at": now_iso()}
    await db.payment_accounts.insert_one(account)
    return {"ok": True, "account": account}


@router.get("/dashboard")
async def finance_dashboard(
    request: Request,
    academic_period_id: str = "",
    _: Dict[str, Any] = Depends(require_campus_admin),
):
    db = get_db(request)
    query: Dict[str, Any] = {}
    if academic_period_id:
        query["academic_period_id"] = academic_period_id
    bills = await db.tuition_bills.find(query, {"_id": 0}).to_list(5000)
    active_bills = [bill for bill in bills if clean(bill.get("status")) not in {"cancelled", "void"}]
    pending_payments = await db.tuition_payments.find({"status": "pending"}, {"_id": 0}).to_list(5000)
    total_billed = round(sum(money(bill.get("amount")) for bill in active_bills), 2)
    total_paid = round(sum(money(bill.get("paid_amount")) for bill in active_bills), 2)
    pmb_carryover_bills = [bill for bill in active_bills if clean(bill.get("source")) == "pmb_carryover"]
    return {
        "ok": True,
        "summary": {
            "bill_count": len(active_bills),
            "paid_bill_count": sum(bill.get("status") == "paid" for bill in active_bills),
            "total_billed": total_billed,
            "total_paid": total_paid,
            "total_outstanding": round(max(total_billed - total_paid, 0), 2),
            "pending_payment_count": len(pending_payments),
            "pending_payment_amount": round(sum(money(payment.get("amount")) for payment in pending_payments), 2),
            "pmb_carryover_bill_count": len(pmb_carryover_bills),
            "pmb_carryover_outstanding": round(sum(money(bill.get("remaining_amount")) for bill in pmb_carryover_bills), 2),
        },
        "pending_payments": pending_payments,
    }
