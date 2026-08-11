"""Router FastAPI untuk KRS (Kartu Rencana Studi) & KHS (Kartu Hasil Studi)."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional
from uuid import uuid4
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Header
from pydantic import BaseModel, Field

from postgres_database import PostgresDatabase
from routers.keuangan import get_financial_clearance


router = APIRouter(prefix="/api/v1/krs", tags=["SIAKAD KRS & KHS"])


class KRSItemInput(BaseModel):
    course_id: str = Field(..., description="ID Mata Kuliah")
    class_id: Optional[str] = Field(None, description="ID Kelas Semester")
    course_code: str = Field(..., description="Kode Matkul")
    course_name: str = Field(..., description="Nama Matkul")
    sks: int = Field(..., description="Jumlah SKS")


class KRSSubmitInput(BaseModel):
    academic_period_id: Optional[str] = Field(None, description="ID Periode Akademik (Default: periode aktif)")
    items: List[KRSItemInput] = Field(..., description="Daftar mata kuliah KRS yang diambil")


class KRSApproveInput(BaseModel):
    krs_id: str = Field(..., description="ID KRS")
    action: str = Field(..., description="'approve' atau 'reject'")
    rejection_reason: Optional[str] = Field(None, description="Alasan penolakan (jika reject)")


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


async def get_active_period(db: PostgresDatabase) -> Dict[str, Any]:
    period = await db.academic_periods.find_one({"is_active": True}, {"_id": 0})
    if not period:
        # Fallback period if database not seeded
        period = {
            "id": "period_default",
            "code": "20251",
            "name": "Tahun Akademik 2025/2026 Ganjil",
            "is_active": True,
        }
    # Kontrak KRS: `academic_period_id` harus berupa kode tahun ajaran (mis. "20261"),
    # konsisten dengan data historis KRS, wizard tahun_ajaran, dan filter semester dashboard.
    code = str(period.get("code") or "").strip()
    if code:
        period = {**period, "id": code}
    return period


@router.get("/offering")
async def get_krs_offering(
    request: Request,
    user: Dict[str, Any] = Depends(get_current_user_from_request),
):
    """Ambil penawaran paket matakuliah semester sesuai prodi & angkatan mahasiswa."""
    db: PostgresDatabase = get_db(request)
    period = await get_active_period(db)
    
    # Ambil semester aktif dari tahun_ajaran if exists
    active_ta = await db.tahun_ajaran.find_one({"is_active": True}, {"_id": 0})
    semester_type = active_ta.get("semester", "Ganjil") if active_ta else "Ganjil"
    active_year_str = active_ta.get("tahun", "2025/2026") if active_ta else "2025/2026"

    # Kalkulasi semester tempuh mahasiswa dari angkatan
    angkatan_str = user.get("angkatan", "2023")
    try:
        angkatan_year = int(str(angkatan_str)[:4])
    except Exception:
        angkatan_year = 2023

    try:
        current_year = int(active_year_str.split("/")[0])
    except Exception:
        current_year = 2025

    diff_years = max(0, current_year - angkatan_year)
    calc_semester = diff_years * 2 + (1 if semester_type == "Ganjil" else 2)
    calc_semester = max(1, min(8, calc_semester))  # Default max semester 8

    # Ambil daftar MK sesuai prodi mahasiswa (atau semua jika prodi belum di-set)
    query = {}
    if user.get("prodi_id"):
        query["$or"] = [{"prodi_id": user["prodi_id"]}, {"prodi_id": None}, {"prodi_id": ""}]
    
    all_courses = await db.courses.find(query, {"_id": 0}).to_list(None)

    # Paket MK semester ini
    paket_courses = [c for c in all_courses if int(c.get("semester_paket", c.get("semester", 1)) or 1) == calc_semester]

    return {
        "ok": True,
        "active_period": period,
        "active_ta": active_ta,
        "student": {
            "id": user["id"],
            "name": user.get("name"),
            "nim": user.get("nim"),
            "angkatan": user.get("angkatan", "2023"),
            "prodi_id": user.get("prodi_id"),
            "dosen_wali_id": user.get("dosen_wali_id"),
            "dosen_wali_name": user.get("dosen_wali_name"),
            "calculated_semester": calc_semester,
        },
        "calculated_semester": calc_semester,
        "paket_courses": paket_courses,
        "all_courses": all_courses,
    }


@router.get("/my-krs")
async def get_my_krs(
    request: Request,
    user: Dict[str, Any] = Depends(get_current_user_from_request),
):
    """Melihat draft / KRS aktif mahasiswa."""
    db: PostgresDatabase = get_db(request)
    period = await get_active_period(db)

    krs_doc = await db.krs.find_one(
        {"student_id": user["id"], "academic_period_id": period["id"]},
        {"_id": 0},
    )

    if not krs_doc:
        return {
            "ok": True,
            "krs": {
                "id": "",
                "student_id": user["id"],
                "academic_period_id": period["id"],
                "period_name": period.get("name", ""),
                "status": "draft",
                "total_sks": 0,
                "items": [],
            },
        }

    return {"ok": True, "krs": krs_doc}


@router.get("/all-my-krs")
async def get_all_my_krs(
    request: Request,
    user: Dict[str, Any] = Depends(get_current_user_from_request),
):
    """Melihat seluruh riwayat & status KRS mahasiswa di semua semester."""
    db: PostgresDatabase = get_db(request)
    mhs_ids = list(filter(None, [user.get("id"), user.get("nim"), user.get("username")]))
    krs_list = await db.krs.find(
        {"student_id": {"$in": mhs_ids}},
        {"_id": 0},
    ).to_list(200)
    return {"ok": True, "krs_list": krs_list}



@router.post("/submit")
async def submit_krs(
    payload: KRSSubmitInput,
    request: Request,
    user: Dict[str, Any] = Depends(get_current_user_from_request),
):
    """Pengajuan draft KRS oleh mahasiswa."""
    if user.get("role") != "student":
        raise HTTPException(status_code=403, detail="Hanya mahasiswa yang dapat mengajukan KRS")

    db: PostgresDatabase = get_db(request)
    period = await get_active_period(db)
    period_id = payload.academic_period_id or period["id"]

    clearance = await get_financial_clearance(db, user, period_id, "krs")
    if not clearance["is_clear"]:
        raise HTTPException(
            status_code=403,
            detail=(
                f"KRS belum dapat diajukan: pelunasan {clearance['paid_percent']:.0f}% "
                f"belum memenuhi batas {clearance['required_percent']:.0f}%"
            ),
        )

    total_sks = sum(item.sks for item in payload.items)
    if total_sks > 24:
        raise HTTPException(status_code=400, detail="Batas maksimal pengisian KRS adalah 24 SKS")

    now_str = datetime.utcnow().isoformat()
    existing_krs = await db.krs.find_one({"student_id": user["id"], "academic_period_id": period_id}, {"_id": 0})

    items_data = [item.dict() for item in payload.items]

    if existing_krs:
        if existing_krs.get("status") == "approved":
            raise HTTPException(status_code=400, detail="KRS yang sudah di-ACC Dosen PA tidak dapat diubah kembali")

        krs_id = existing_krs["id"]
        update_data = {
            "items": items_data,
            "total_sks": total_sks,
            "status": "submitted",
            "submitted_at": now_str,
            "updated_at": now_str,
        }
        await db.krs.update_one({"id": krs_id}, {"$set": update_data})
    else:
        krs_id = f"krs_{uuid4().hex[:12]}"
        krs_doc = {
            "id": krs_id,
            "student_id": user["id"],
            "student_name": user.get("name", ""),
            "nim": user.get("nim", ""),
            "academic_period_id": period_id,
            "period_name": period.get("name", ""),
            "total_sks": total_sks,
            "items": items_data,
            "status": "submitted",
            "submitted_at": now_str,
            "approved_at": None,
            "approved_by": None,
            "rejection_reason": "",
            "created_at": now_str,
            "updated_at": now_str,
        }
        await db.krs.insert_one(krs_doc)

    result = await db.krs.find_one({"id": krs_id}, {"_id": 0})
    return {
        "ok": True,
        "message": "KRS berhasil diajukan ke Dosen Pembimbing Akademik",
        "krs": result,
        "financial_clearance": clearance,
    }


def _period_semester_identity(period: Optional[Dict[str, Any]]) -> Dict[str, str]:
    """Petakan periode akademik ke (academic_year, semester) untuk mencocokkan rombel."""
    if not period:
        return {"academic_year": "", "semester": "", "code": ""}
    code = str(period.get("code") or "")
    m = re.fullmatch(r"(\d{4})([123])", code)
    if m:
        year = int(m.group(1))
        semester = {"1": "Ganjil", "2": "Genap", "3": "Pendek"}.get(m.group(2), "")
        return {"academic_year": f"{year}/{year + 1}", "semester": semester, "code": code}

    name = str(period.get("name") or "")
    semester = next((s for s in ("Ganjil", "Genap", "Pendek") if s in name), "")
    years = re.findall(r"20\d{2}", name)
    if years and semester:
        return {
            "academic_year": f"{years[0]}/{int(years[0]) + 1}",
            "semester": semester,
            "code": code,
        }
    return {"academic_year": "", "semester": semester, "code": code}


async def _enroll_student_to_classes(
    db: PostgresDatabase,
    krs_doc: Dict[str, Any],
) -> Dict[str, Any]:
    """Daftarkan mahasiswa ke kelas (rombel) MK yang sudah di-ACC dosen wali.

    Kelas dicocokkan terhadap Tahun Ajaran yang sedang berjalan
    (sumber rombel yang di-generate wizard), bukan periode akademik KRS.
    """
    student_id = krs_doc.get("student_id") or krs_doc.get("nim")
    if not student_id:
        return {"enrolled": [], "skipped": []}

    active_ta = await db.tahun_ajaran.find_one({"is_active": True}, {"_id": 0})
    ta_id = active_ta.get("id") if active_ta else None

    identity: Dict[str, str] = {}
    if not ta_id:
        period_id = krs_doc.get("academic_period_id")
        if period_id:
            period = await db.academic_periods.find_one(
                {"$or": [{"id": period_id}, {"code": period_id}]},
                {"_id": 0},
            )
            identity = _period_semester_identity(period)

    enrolled: List[Dict[str, Any]] = []
    skipped: List[Dict[str, Any]] = []
    processed: set[str] = set()
    enroll_by_course: Dict[str, str] = {}

    for item in krs_doc.get("items") or []:
        course_id = item.get("course_id") or ""
        course_name = item.get("course_name") or ""
        class_id = item.get("class_id") or ""

        targets: List[Dict[str, Any]] = []
        if class_id:
            cls = await db.classes.find_one(
                {"id": class_id, "status": {"$ne": "deleted"}},
                {"_id": 0},
            )
            if cls:
                targets.append(cls)
        else:
            query: Dict[str, Any] = {"course_id": course_id, "status": {"$ne": "deleted"}}
            if ta_id:
                query["tahun_ajaran_id"] = ta_id
            elif identity.get("academic_year"):
                query["academic_year"] = identity["academic_year"]
                if identity.get("semester"):
                    query["semester"] = identity["semester"]
            targets = await db.classes.find(query, {"_id": 0}).to_list(50)

        if not targets:
            skipped.append({
                "course_id": course_id,
                "course_name": course_name,
                "reason": "Kelas rombel belum tersedia untuk MK ini di periode KRS",
            })
            continue

        for cls in targets:
            cid = cls.get("id")
            if not cid or cid in processed:
                continue
            processed.add(cid)
            await db.classes.update_one(
                {"id": cid},
                {"$addToSet": {"student_ids": student_id}},
            )
            enrolled.append({
                "class_id": cid,
                "class_code": cls.get("class_code") or cls.get("name") or "",
                "course_id": course_id,
                "course_name": cls.get("course_name") or course_name,
            })
            enroll_by_course.setdefault(course_id, cid)

    if enrolled:
        await db.users.update_one(
            {"id": student_id},
            {"$addToSet": {"class_ids": {"$each": [e["class_id"] for e in enrolled]}}},
        )

        # Persist class_id ke item KRS agar dashboard mahasiswa & dosen bisa
        # mencocokkan kelas/material/assignment dari KRS yang sudah di-ACC.
        items = krs_doc.get("items") or []
        new_items = []
        changed = False
        for it in items:
            it = dict(it)
            cid = it.get("course_id") or ""
            if not it.get("class_id") and cid in enroll_by_course:
                it["class_id"] = enroll_by_course[cid]
                changed = True
            new_items.append(it)
        if changed:
            await db.krs.update_one(
                {"id": krs_doc.get("id")},
                {"$set": {"items": new_items, "updated_at": datetime.utcnow().isoformat()}},
            )
            krs_doc["items"] = new_items

    return {"enrolled": enrolled, "skipped": skipped}


@router.post("/approve")
async def approve_or_reject_krs(
    payload: KRSApproveInput,
    request: Request,
    user: Dict[str, Any] = Depends(get_current_user_from_request),
):
    """Persetujuan / ACC / Penolakan KRS oleh Dosen PA."""
    if user.get("role") not in {"lecturer", "admin"}:
        raise HTTPException(status_code=403, detail="Hanya Dosen PA atau Admin yang dapat menyetujui KRS")

    db: PostgresDatabase = get_db(request)
    krs_doc = await db.krs.find_one({"id": payload.krs_id}, {"_id": 0})
    if not krs_doc:
        raise HTTPException(status_code=404, detail="Data KRS tidak ditemukan")

    # Verifikasi dosen wali: hanya dosen wali mahasiswa (atau admin) yang boleh ACC
    if user.get("role") == "lecturer":
        student = await db.users.find_one(
            {
                "$or": [
                    {"id": krs_doc.get("student_id")},
                    {"nim": krs_doc.get("student_id")},
                    {"nim": krs_doc.get("nim")},
                ],
                "role": "student",
            },
            {"_id": 0},
        )
        if not student:
            raise HTTPException(status_code=404, detail="Data mahasiswa tidak ditemukan")
        wali_id = student.get("dosen_wali_id") or student.get("pa_dosen_id")
        if not wali_id:
            raise HTTPException(status_code=403, detail="Mahasiswa belum memiliki dosen wali")
        if wali_id != user["id"]:
            raise HTTPException(status_code=403, detail="Anda bukan dosen wali mahasiswa ini")

    now_str = datetime.utcnow().isoformat()
    enrollment = {"enrolled": [], "skipped": []}
    if payload.action == "approve":
        update_data = {
            "status": "approved",
            "approved_at": now_str,
            "approved_by": user["id"],
            "rejection_reason": "",
            "updated_at": now_str,
        }
        message = "KRS berhasil disetujui (ACC)"
        enrollment = await _enroll_student_to_classes(db, krs_doc)
        if enrollment["enrolled"]:
            message += f" — {len(enrollment['enrolled'])} MK didaftarkan ke kelas"
        if enrollment["skipped"]:
            message += f" — {len(enrollment['skipped'])} MK belum punya kelas rombel"
    elif payload.action == "reject":
        update_data = {
            "status": "rejected",
            "rejection_reason": payload.rejection_reason or "KRS perlu direvisi",
            "updated_at": now_str,
        }
        message = "KRS ditolak dan dikembalikan ke mahasiswa untuk revisi"
    else:
        raise HTTPException(status_code=400, detail="Action harus 'approve' atau 'reject'")

    await db.krs.update_one({"id": payload.krs_id}, {"$set": update_data})
    updated_doc = await db.krs.find_one({"id": payload.krs_id}, {"_id": 0})
    return {
        "ok": True,
        "message": message,
        "krs": updated_doc,
        "enrollment": enrollment,
    }


@router.get("/khs")
async def get_my_khs(
    request: Request,
    academic_period_id: Optional[str] = None,
    user: Dict[str, Any] = Depends(get_current_user_from_request),
):
    """Melihat Kartu Hasil Studi (KHS), IPS, & IPK kumulatif untuk semester tertentu."""
    db: PostgresDatabase = get_db(request)

    target_period_id = (academic_period_id or "").strip()
    if not target_period_id or target_period_id in ("all", "active"):
        period = await get_active_period(db)
        target_period_id = period["id"]

    mhs_ids = list(filter(None, [user.get("id"), user.get("nim"), user.get("username")]))

    # Search KHS document matching student ID and target academic period ID
    khs_doc = await db.khs.find_one(
        {
            "student_id": {"$in": mhs_ids},
            "academic_period_id": target_period_id
        },
        {"_id": 0}
    )

    # Fallback: if not found by exact ID, check if academic_period_id is period code or uuid
    if not khs_doc:
        khs_doc = await db.khs.find_one(
            {
                "student_id": {"$in": mhs_ids},
                "$or": [
                    {"academic_period_id": target_period_id},
                    {"period_name": {"$regex": target_period_id, "$options": "i"}}
                ]
            },
            {"_id": 0}
        )

    # Fallback 2: build KHS dynamically from approved KRS record if KHS document does not exist yet
    if not khs_doc:
        krs_doc = await db.krs.find_one(
            {
                "student_id": {"$in": mhs_ids},
                "academic_period_id": target_period_id
            },
            {"_id": 0}
        )
        if krs_doc:
            courses = krs_doc.get("courses") or krs_doc.get("items") or []
            total_sks = sum(int(c.get("sks") or 0) for c in courses)
            total_pts = sum(int(c.get("sks") or 0) * float(c.get("grade_point") or 0.0) for c in courses if c.get("grade_letter") and c.get("grade_letter") != "-")
            ips = round(total_pts / total_sks, 2) if total_sks > 0 else 0.0
            khs_doc = {
                "student_id": user["id"],
                "academic_period_id": target_period_id,
                "period_name": krs_doc.get("period_name", target_period_id),
                "ips": ips,
                "ipk": ips,
                "total_sks_semester": total_sks,
                "total_sks_kumulatif": total_sks,
                "grades": courses,
            }

    if not khs_doc:
        khs_doc = {
            "student_id": user["id"],
            "academic_period_id": target_period_id,
            "period_name": target_period_id,
            "ips": 0.0,
            "ipk": 0.0,
            "total_sks_semester": 0,
            "total_sks_kumulatif": 0,
            "grades": [],
        }

    return {"ok": True, "khs": khs_doc}


@router.get("/transkrip")
async def get_my_transkrip(
    request: Request,
    user: Dict[str, Any] = Depends(get_current_user_from_request),
):
    """Melihat Transkrip Nilai Kumulatif Akhir Mahasiswa dari Feeder PDDIKTI."""
    db: PostgresDatabase = get_db(request)

    student_id = str(user.get("id") or "")
    nim = str(user.get("nim") or user.get("username") or "")

    trans_list = []
    if nim:
        trans_list = await db.transkrip.find({"nim": nim}, {"_id": 0}).sort("semester_ke", 1).to_list(None)

    if not trans_list and student_id:
        trans_list = await db.transkrip.find({"student_id": student_id}, {"_id": 0}).sort("semester_ke", 1).to_list(None)

    return {"ok": True, "transkrip": trans_list}
