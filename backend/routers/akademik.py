"""Router FastAPI untuk Manajemen Core Akademik & Dosen PA."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from uuid import uuid4
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Header
from pydantic import BaseModel, Field

from postgres_database import PostgresDatabase
from routers.user_access import normalize_base_role, user_is_admin_or_access_role


router = APIRouter(prefix="/api/v1/akademik", tags=["SIAKAD Akademik"])


class AcademicPeriodInput(BaseModel):
    code: str = Field(..., description="Kode periode misal: 20251")
    name: str = Field(..., description="Nama periode misal: Tahun Akademik 2025/2026 Ganjil")
    year: str = Field(..., description="Tahun akademik misal: 2025/2026")
    semester: str = Field(..., description="Ganjil atau Genap")
    is_active: bool = Field(False, description="Apakah periode ini aktif?")
    krs_start_at: Optional[str] = Field(None, description="Tanggal mulai KRS ISO string")
    krs_end_at: Optional[str] = Field(None, description="Tanggal selesai KRS ISO string")


class AssignPAInput(BaseModel):
    student_id: str = Field(..., description="ID Mahasiswa")
    pa_dosen_id: str = Field(..., description="ID Dosen Pembimbing Akademik")


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
    user["role"] = normalize_base_role(user.get("role"))
    request.state.current_user = user
    return user


async def require_campus_admin(request: Request) -> Dict[str, Any]:
    user = await get_current_user_from_request(request)
    if not user_is_admin_or_access_role(user, "academic_operator"):
        raise HTTPException(status_code=403, detail="Hanya admin kampus atau operator akademik yang diizinkan")
    return user


async def require_lecturer_or_admin(request: Request) -> Dict[str, Any]:
    user = await get_current_user_from_request(request)
    if user.get("role") not in {"admin", "lecturer"}:
        raise HTTPException(status_code=403, detail="Hanya dosen atau admin yang diizinkan")
    return user


async def _active_period_identifiers(db: PostgresDatabase) -> List[str]:
    """Return every active-period alias used by KRS and semester setup."""
    values = set()
    active_periods = await db.academic_periods.find(
        {"is_active": True},
        {"_id": 0, "id": 1, "code": 1},
    ).to_list(50)
    for period in active_periods:
        values.update(
            str(period.get(field) or "").strip()
            for field in ("id", "code")
        )
    active_tas = await db.tahun_ajaran.find(
        {"is_active": True},
        {"_id": 0, "id": 1},
    ).to_list(50)
    values.update(str(item.get("id") or "").strip() for item in active_tas)
    return sorted(values - {""})


def _student_identifiers(students: List[Dict[str, Any]]) -> List[str]:
    return sorted({
        str(student.get(field) or "").strip()
        for student in students
        for field in ("id", "nim", "username")
    } - {""})


async def _pa_students_for_user(
    db: PostgresDatabase,
    user: Dict[str, Any],
) -> List[Dict[str, Any]]:
    if user.get("role") == "admin":
        query: Dict[str, Any] = {"role": "student"}
    else:
        lecturer_id = user["id"]
        query = {
            "role": "student",
            "$or": [
                {"dosen_wali_id": lecturer_id},
                {"pa_dosen_id": lecturer_id},
            ],
        }
    return await db.users.find(query, {"_id": 0}).to_list(1000)


@router.get("/periods")
async def list_academic_periods(
    request: Request,
    user: Dict[str, Any] = Depends(get_current_user_from_request),
):
    """Melihat daftar tahun/periode akademik."""
    db: PostgresDatabase = get_db(request)
    periods = await db.academic_periods.find({}, {"_id": 0}).sort("code", -1).to_list(100)
    return {"ok": True, "periods": periods}


@router.post("/periods")
async def create_or_update_academic_period(
    payload: AcademicPeriodInput,
    request: Request,
    user: Dict[str, Any] = Depends(require_campus_admin),
):
    """Membuat atau mengaktifkan periode akademik baru."""
    db: PostgresDatabase = get_db(request)
    now_str = datetime.utcnow().isoformat()

    if payload.is_active:
        # Deactivate all other periods if this one is active
        await db.academic_periods.update_many({"is_active": True}, {"$set": {"is_active": False}})

    existing = await db.academic_periods.find_one({"code": payload.code}, {"_id": 0})
    if existing:
        period_id = existing["id"]
        update_data = {
            "name": payload.name,
            "year": payload.year,
            "semester": payload.semester,
            "is_active": payload.is_active,
            "krs_start_at": payload.krs_start_at or now_str,
            "krs_end_at": payload.krs_end_at or now_str,
            "updated_at": now_str,
        }
        await db.academic_periods.update_one({"id": period_id}, {"$set": update_data})
    else:
        period_id = f"period_{uuid4().hex[:12]}"
        period_doc = {
            "id": period_id,
            "code": payload.code,
            "name": payload.name,
            "year": payload.year,
            "semester": payload.semester,
            "is_active": payload.is_active,
            "krs_start_at": payload.krs_start_at or now_str,
            "krs_end_at": payload.krs_end_at or now_str,
            "status": "active" if payload.is_active else "draft",
            "created_at": now_str,
            "updated_at": now_str,
        }
        await db.academic_periods.insert_one(period_doc)

    result = await db.academic_periods.find_one({"id": period_id}, {"_id": 0})
    return {"ok": True, "period": result}


@router.get("/students/pa/pending-count")
async def pending_pa_submission_count(
    request: Request,
    user: Dict[str, Any] = Depends(require_lecturer_or_admin),
):
    """Jumlah pengajuan KRS aktif yang masih menunggu tindakan Dosen PA."""
    db: PostgresDatabase = get_db(request)
    students = await _pa_students_for_user(db, user)
    student_ids = _student_identifiers(students)
    period_ids = await _active_period_identifiers(db)
    if not student_ids or not period_ids:
        return {"ok": True, "pending_count": 0}
    pending_count = await db.krs.count_documents({
        "status": "submitted",
        "student_id": {"$in": student_ids},
        "academic_period_id": {"$in": period_ids},
    })
    return {"ok": True, "pending_count": pending_count}


@router.get("/students/pa")
async def list_pa_students(
    request: Request,
    submitted_only: bool = False,
    user: Dict[str, Any] = Depends(require_lecturer_or_admin),
):
    """Daftar mahasiswa bimbingan Dosen PA beserta status KRS periode aktif.

    Mencocokkan lewat field ``dosen_wali_id`` maupun ``pa_dosen_id`` (keduanya
    dipakai oleh alur Assign Dosen Wali) dan melengkapi tiap mahasiswa dengan
    dokumen KRS periode akademik aktif agar dosen wali bisa langsung ACC.
    """
    db: PostgresDatabase = get_db(request)
    students = await _pa_students_for_user(db, user)

    # Profil mahasiswa
    profiles = await db.student_profiles.find({}, {"_id": 0}).to_list(2000)
    profile_map = {p.get("student_id"): p for p in profiles if p.get("student_id")}

    # KRS periode aktif: pakai academic_periods aktif + tahun_ajaran aktif (dua sumber,
    # karena alur KRS (krs_khs.py) membaca academic_periods sedangkan wizard semester menulis tahun_ajaran)
    period_ids = await _active_period_identifiers(db)

    student_ids = _student_identifiers(students)
    krs_list = []
    if period_ids and student_ids:
        krs_list = await db.krs.find(
            {"academic_period_id": {"$in": list(period_ids)}, "student_id": {"$in": student_ids}},
            {"_id": 0},
        ).to_list(2000)

    for s in students:
        sid = s.get("id")
        s["profile"] = profile_map.get(sid, {})
        # Prefer KRS berstatus "submitted" (butuh ACC), lalu KRS periode aktif lainnya
        candidates = [k for k in krs_list if k.get("student_id") in (sid, s.get("nim"), s.get("username"))]
        krs_doc = next((k for k in candidates if k.get("status") == "submitted"), None)
        if krs_doc is None and candidates:
            krs_doc = sorted(candidates, key=lambda k: k.get("created_at") or "")[-1]
        s["krs"] = krs_doc or {
            "status": "draft",
            "total_sks": 0,
            "items": [],
        }

    if submitted_only:
        students = [student for student in students if student.get("krs", {}).get("status") == "submitted"]

    return {
        "ok": True,
        "students": students,
        "pending_count": len([student for student in students if student.get("krs", {}).get("status") == "submitted"]),
    }


@router.post("/students/assign-pa")
async def assign_student_pa(
    payload: AssignPAInput,
    request: Request,
    user: Dict[str, Any] = Depends(require_campus_admin),
):
    """Menugaskan Dosen Pembimbing Akademik (PA) ke Mahasiswa."""
    db: PostgresDatabase = get_db(request)
    now_str = datetime.utcnow().isoformat()

    student = await db.users.find_one({"id": payload.student_id, "role": "student"}, {"_id": 0})
    if not student:
        raise HTTPException(status_code=404, detail="Mahasiswa tidak ditemukan")

    lecturer = await db.users.find_one({"id": payload.pa_dosen_id, "role": "lecturer"}, {"_id": 0})
    if not lecturer:
        raise HTTPException(status_code=404, detail="Dosen PA tidak ditemukan")

    # Update users document
    await db.users.update_one({"id": payload.student_id}, {"$set": {"pa_dosen_id": payload.pa_dosen_id}})

    # Upsert student profile
    existing_profile = await db.student_profiles.find_one({"student_id": payload.student_id}, {"_id": 0})
    if existing_profile:
        await db.student_profiles.update_one(
            {"student_id": payload.student_id},
            {"$set": {"pa_dosen_id": payload.pa_dosen_id, "updated_at": now_str}},
        )
    else:
        profile_doc = {
            "id": f"sp_{uuid4().hex[:12]}",
            "student_id": payload.student_id,
            "nim": student.get("nim", ""),
            "pa_dosen_id": payload.pa_dosen_id,
            "academic_status": "Aktif",
            "created_at": now_str,
            "updated_at": now_str,
        }
        await db.student_profiles.insert_one(profile_doc)

    return {"ok": True, "message": f"Dosen PA {lecturer.get('name')} berhasil ditugaskan untuk {student.get('name')}"}
