"""Router FastAPI untuk Keuangan & Tagihan UKT."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from uuid import uuid4
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Header
from pydantic import BaseModel, Field

from postgres_database import PostgresDatabase


router = APIRouter(prefix="/api/v1/keuangan", tags=["SIAKAD Keuangan"])


class CreateBillInput(BaseModel):
    student_id: str = Field(..., description="ID Mahasiswa")
    academic_period_id: Optional[str] = Field(None, description="ID Periode Akademik")
    title: str = Field(..., description="Nama Tagihan misal: UKT Semester Ganjil 2025/2026")
    amount: float = Field(..., description="Jumlah nominal tagihan")
    due_date: Optional[str] = Field(None, description="Tenggat waktu pembayaran ISO string")


class PayBillInput(BaseModel):
    bill_id: str = Field(..., description="ID Tagihan")
    payment_method: str = Field("QRIS", description="Metode Pembayaran: QRIS, VA_BCA, VA_MANDIRI, MANUAL")
    amount: float = Field(..., description="Nominal yang dibayarkan")


def get_db(request: Request) -> PostgresDatabase:
    return request.app.state.db


async def get_current_user_from_request(request: Request) -> Dict[str, Any]:
    auth = request.headers.get("authorization") or ""
    if not auth or not auth.startswith("Bearer "):
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
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Hanya admin kampus yang diizinkan")
    return user


async def get_active_period(db: PostgresDatabase) -> Dict[str, Any]:
    period = await db.academic_periods.find_one({"is_active": True}, {"_id": 0})
    if not period:
        period = {"id": "period_default", "code": "20251", "name": "Tahun Akademik 2025/2026 Ganjil"}
    return period


@router.get("/my-bills")
async def list_my_bills(
    request: Request,
    user: Dict[str, Any] = Depends(get_current_user_from_request),
):
    """Daftar tagihan UKT & Biaya Pendidikan Mahasiswa."""
    db: PostgresDatabase = get_db(request)

    if user.get("role") == "student":
        bills = await db.tuition_bills.find({"student_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    else:
        # Admin or Lecturer can view all bills
        bills = await db.tuition_bills.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)

    return {"ok": True, "bills": bills}


@router.post("/bills")
async def create_tuition_bill(
    payload: CreateBillInput,
    request: Request,
    user: Dict[str, Any] = Depends(require_campus_admin),
):
    """Admin membuat tagihan UKT / Biaya Pendidikan baru."""
    db: PostgresDatabase = get_db(request)

    student = await db.users.find_one({"id": payload.student_id, "role": "student"}, {"_id": 0})
    if not student:
        raise HTTPException(status_code=404, detail="Mahasiswa tidak ditemukan")

    period = await get_active_period(db)
    period_id = payload.academic_period_id or period["id"]
    now_str = datetime.utcnow().isoformat()

    bill_id = f"bill_{uuid4().hex[:12]}"
    bill_doc = {
        "id": bill_id,
        "student_id": payload.student_id,
        "student_name": student.get("name", ""),
        "nim": student.get("nim", ""),
        "academic_period_id": period_id,
        "title": payload.title,
        "amount": payload.amount,
        "paid_amount": 0.0,
        "status": "unpaid",
        "due_date": payload.due_date or now_str,
        "created_at": now_str,
        "updated_at": now_str,
    }

    await db.tuition_bills.insert_one(bill_doc)
    return {"ok": True, "message": "Tagihan berhasil dibuat", "bill": bill_doc}


@router.post("/pay")
async def pay_tuition_bill(
    payload: PayBillInput,
    request: Request,
    user: Dict[str, Any] = Depends(get_current_user_from_request),
):
    """Simulasi / Proses Pembayaran Tagihan UKT."""
    db: PostgresDatabase = get_db(request)

    bill = await db.tuition_bills.find_one({"id": payload.bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Tagihan tidak ditemukan")

    if user.get("role") == "student" and bill["student_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Anda hanya dapat membayar tagihan atas nama sendiri")

    if bill["status"] == "paid":
        raise HTTPException(status_code=400, detail="Tagihan ini sudah lunas")

    now_str = datetime.utcnow().isoformat()
    new_paid = bill.get("paid_amount", 0.0) + payload.amount
    new_status = "paid" if new_paid >= bill["amount"] else "partial"

    # Record payment transaction log
    payment_id = f"pay_{uuid4().hex[:12]}"
    payment_doc = {
        "id": payment_id,
        "bill_id": payload.bill_id,
        "student_id": bill["student_id"],
        "amount": payload.amount,
        "payment_method": payload.payment_method,
        "status": "success",
        "paid_at": now_str,
    }
    await db.tuition_payments.insert_one(payment_doc)

    # Update bill status
    await db.tuition_bills.update_one(
        {"id": payload.bill_id},
        {"$set": {"paid_amount": new_paid, "status": new_status, "updated_at": now_str}},
    )

    updated_bill = await db.tuition_bills.find_one({"id": payload.bill_id}, {"_id": 0})
    return {
        "ok": True,
        "message": "Pembayaran berhasil diproses!",
        "status": new_status,
        "bill": updated_bill,
        "payment": payment_doc,
    }
