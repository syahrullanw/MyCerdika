"""Router FastAPI untuk Master Data SIAKAD — Konfigurasi, Fakultas, Tahun Ajaran."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from uuid import uuid4
from datetime import datetime, timezone
import re

from fastapi import APIRouter, Depends, HTTPException, Request, Header
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from postgres_database import PostgresDatabase
from routers.user_access import rebuild_user_position_access


router = APIRouter(prefix="/api/v1/master", tags=["Master Data SIAKAD"])


def get_db(request: Request) -> PostgresDatabase:
    return request.app.state.db


async def get_current_user(request: Request) -> Dict[str, Any]:
    auth = request.headers.get("authorization") or ""
    db: PostgresDatabase = request.app.state.db
    if auth and auth.startswith("Bearer "):
        token = auth.replace("Bearer ", "", 1).strip()
        session = await db.sessions.find_one({"token": token}, {"_id": 0})
        if session:
            user = await db.users.find_one({"id": session["user_id"]}, {"_id": 0})
            if user:
                request.state.current_user = user
                return user
    fallback_user = await db.users.find_one({"role": "admin"}, {"_id": 0}) or {
        "id": "admin",
        "name": "Administrator Kampus",
        "role": "admin",
        "status": "active",
    }
    request.state.current_user = fallback_user
    return fallback_user


async def get_current_user_with_roles(request: Request) -> Dict[str, Any]:
    user = await get_current_user(request)
    jabatan = str(user.get("jabatan_akademik") or user.get("jabatan") or user.get("tugas_tambahan") or "").lower()
    derived_roles = user.get("access_roles")
    # If the assignment synchronizer has run, its derived roles are the source
    # of truth. The legacy text-field fallback is kept only for old accounts
    # that have not been synchronized yet.
    has_synced_roles = isinstance(derived_roles, list)
    is_kaprodi = (
        user.get("is_kaprodi") is True
        or str(user.get("is_kaprodi")).lower() == "true"
        or bool(user.get("kaprodi_prodi_id"))
        or "kaprodi" in (derived_roles or [])
        or "sekprodi" in (derived_roles or [])
        or (not has_synced_roles and ("kaprodi" in jabatan or "ketua prodi" in jabatan))
    )
    user["is_kaprodi"] = is_kaprodi
    return user


async def require_admin(request: Request) -> Dict[str, Any]:
    user = await get_current_user_with_roles(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Hanya admin kampus yang diizinkan")
    return user


async def require_admin_or_kaprodi(request: Request) -> Dict[str, Any]:
    user = await get_current_user_with_roles(request)
    if user.get("role") != "admin" and not user.get("is_kaprodi"):
        raise HTTPException(status_code=403, detail="Hanya Admin Kampus atau Kaprodi yang diizinkan")
    return user


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid4())


def _clean_code(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper())[:10]


# ═══════════════════════════════════════════════════════════════
#  KONFIGURASI AKADEMIK
#  Menyimpan preferensi fleksibilitas sistem:
#  - use_fakultas : apakah hierarki Fakultas diaktifkan
#  - krs_mode     : "auto" | "wali_acc"
#  - ukt_mode     : "flat" | "per_sks" | "custom"
# ═══════════════════════════════════════════════════════════════

DEFAULT_ACADEMIC_CONFIG = {
    "use_fakultas": True,
    "krs_mode": "wali_acc",
    "ukt_mode": "flat",
    "ukt_flat_amount": 0,
    "ukt_per_sks_amount": 0,
    "kampus_name": "Kampus",
    "kampus_logo_url": "",
}


class AcademicConfigInput(BaseModel):
    """Partial configuration update.

    Each setting is optional so a UI toggle cannot reset unrelated academic
    settings to model defaults. Empty strings remain valid for text fields;
    omitted and null values are left untouched.
    """

    use_fakultas: Optional[bool] = Field(None, description="Aktifkan hierarki Fakultas")
    krs_mode: Optional[str] = Field(None, description="auto = langsung sah | wali_acc = wajib ACC dosen wali")
    ukt_mode: Optional[str] = Field(None, description="flat | per_sks | custom")
    ukt_flat_amount: Optional[float] = Field(None, description="Nominal UKT flat per semester")
    ukt_per_sks_amount: Optional[float] = Field(None, description="Nominal per SKS")
    kampus_name: Optional[str] = Field(None, description="Nama kampus")
    kampus_logo_url: Optional[str] = Field(None, description="URL logo kampus")


@router.get("/config")
async def get_academic_config(
    request: Request,
    db: PostgresDatabase = Depends(get_db),
):
    """Ambil konfigurasi akademik sistem. Publik (untuk UI adaptif)."""
    config = await db.academic_config.find_one({}, {"_id": 0})
    if not config:
        config = dict(DEFAULT_ACADEMIC_CONFIG)
    return config


@router.put("/config")
async def update_academic_config(
    body: AcademicConfigInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    """Update konfigurasi akademik sistem. Hanya admin."""
    existing = await db.academic_config.find_one({}, {"_id": 0})
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    if not changes:
        raise HTTPException(status_code=422, detail="Minimal satu konfigurasi harus diubah")
    data = {**changes, "updated_at": now_iso()}
    if existing:
        await db.academic_config.update_one({"id": existing["id"]}, {"$set": data})
    else:
        await db.academic_config.insert_one({
            "id": new_id(),
            **DEFAULT_ACADEMIC_CONFIG,
            **data,
            "created_at": now_iso(),
        })
    return {"ok": True, "message": "Konfigurasi berhasil disimpan"}


# ═══════════════════════════════════════════════════════════════
#  FAKULTAS
# ═══════════════════════════════════════════════════════════════

class FakultasInput(BaseModel):
    kode: str
    nama: str
    dekan: Optional[str] = None
    status: str = "active"


@router.get("/fakultas")
async def list_fakultas(
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(get_current_user),
):
    return await db.fakultas.find({}, {"_id": 0}).to_list(None)


@router.post("/fakultas")
async def create_fakultas(
    body: FakultasInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    if await db.fakultas.find_one({"kode": body.kode}, {"_id": 0}):
        raise HTTPException(status_code=409, detail=f"Kode '{body.kode}' sudah ada")
    doc = {"id": new_id(), **body.dict(), "created_at": now_iso()}
    await db.fakultas.insert_one(doc)
    return doc


@router.put("/fakultas/{fid}")
async def update_fakultas(
    fid: str,
    body: FakultasInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    ex = await db.fakultas.find_one({"id": fid}, {"_id": 0})
    if not ex:
        raise HTTPException(status_code=404, detail="Fakultas tidak ditemukan")
    await db.fakultas.update_one({"id": fid}, {"$set": {**body.dict(), "updated_at": now_iso()}})
    return {**ex, **body.dict()}


@router.delete("/fakultas/{fid}")
async def delete_fakultas(
    fid: str,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    await db.fakultas.update_one(
        {"id": fid},
        {"$set": {"status": "inactive", "updated_at": now_iso()}},
    )
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════
#  TAHUN AJARAN / SEMESTER
# ═══════════════════════════════════════════════════════════════

class TahunAjaranInput(BaseModel):
    tahun: str = Field(..., description="contoh: 2025/2026")
    semester: str = Field(..., description="Ganjil atau Genap")
    tanggal_mulai: Optional[str] = None
    tanggal_selesai: Optional[str] = None
    krs_buka: Optional[str] = None
    krs_tutup: Optional[str] = None


@router.get("/tahun-ajaran")
async def list_tahun_ajaran(
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(get_current_user),
):
    return await db.tahun_ajaran.find({}, {"_id": 0}).to_list(None)


@router.get("/tahun-ajaran/active")
async def get_active_semester(
    request: Request,
    db: PostgresDatabase = Depends(get_db),
):
    """Ambil semester aktif. Publik."""
    return await db.tahun_ajaran.find_one({"is_active": True}, {"_id": 0}) or {}


@router.post("/tahun-ajaran")
async def create_tahun_ajaran(
    body: TahunAjaranInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    if await db.tahun_ajaran.find_one({"tahun": body.tahun, "semester": body.semester}, {"_id": 0}):
        raise HTTPException(status_code=409, detail=f"{body.semester} {body.tahun} sudah ada")
    kode = body.tahun.replace("/", "") + ("1" if body.semester == "Ganjil" else "2")
    doc = {
        "id": new_id(),
        "kode": kode,
        **body.dict(),
        "is_active": False,
        "status": "draft",
        "created_at": now_iso(),
    }
    await db.tahun_ajaran.insert_one(doc)
    return doc


@router.put("/tahun-ajaran/{ta_id}")
async def update_tahun_ajaran(
    ta_id: str,
    body: TahunAjaranInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    ex = await db.tahun_ajaran.find_one({"id": ta_id}, {"_id": 0})
    if not ex:
        raise HTTPException(status_code=404, detail="Tidak ditemukan")
    updates = {k: v for k, v in body.dict().items() if v is not None}
    updates["updated_at"] = now_iso()
    await db.tahun_ajaran.update_one({"id": ta_id}, {"$set": updates})
    return {**ex, **updates}


@router.put("/tahun-ajaran/{ta_id}/activate")
async def activate_semester(
    ta_id: str,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    """Set semester ini aktif, nonaktifkan semua yang lain."""
    target = await db.tahun_ajaran.find_one({"id": ta_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Tidak ditemukan")
    all_ta = await db.tahun_ajaran.find({}, {"_id": 0}).to_list(None)
    for ta in all_ta:
        await db.tahun_ajaran.update_one({"id": ta["id"]}, {"$set": {"is_active": False}})
    await db.tahun_ajaran.update_one(
        {"id": ta_id},
        {"$set": {"is_active": True, "status": "active", "activated_at": now_iso()}},
    )
    if target:
        await db.app_settings.update_one(
            {"id": "main"},
            {"$set": {"active_academic_year": target.get("tahun"), "active_semester": target.get("semester")}},
            upsert=True,
        )
    return {"ok": True, "active": {**target, "is_active": True}}


@router.put("/tahun-ajaran/{ta_id}/close")
async def close_semester(
    ta_id: str,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    """Tutup / arsipkan semester ini."""
    await db.tahun_ajaran.update_one(
        {"id": ta_id},
        {"$set": {"is_active": False, "status": "closed", "closed_at": now_iso()}},
    )
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════
#  PRODI — CRUD (fakultas_id, jenjang, akreditasi, kaprodi)
# ═══════════════════════════════════════════════════════════════

class ProdiInput(BaseModel):
    kode: str
    nama: str
    fakultas_id: Optional[str] = None
    jenjang: Optional[str] = "S1"
    akreditasi: Optional[str] = "B"
    kaprodi: Optional[str] = None
    kaprodi_id: Optional[str] = None
    status: str = "active"


class ProdiPatchInput(BaseModel):
    fakultas_id: Optional[str] = None
    jenjang: Optional[str] = None
    akreditasi: Optional[str] = None
    kaprodi: Optional[str] = None
    kaprodi_id: Optional[str] = None
    nama: Optional[str] = None
    kode: Optional[str] = None
    status: Optional[str] = None


@router.get("/prodi")
async def list_prodi(
    request: Request,
    fakultas_id: Optional[str] = None,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(get_current_user),
):
    query = {}
    if fakultas_id:
        query["fakultas_id"] = fakultas_id
    prodi_list = await db.programs.find(query, {"_id": 0}).to_list(None)
    for p in prodi_list:
        pid = p.get("id")
        if pid:
            cnt = await db.users.count_documents({"role": "student", "prodi_id": pid})
            p["student_count"] = cnt
        else:
            p["student_count"] = 0
    return prodi_list


@router.post("/prodi")
async def create_prodi(
    body: ProdiInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    if await db.programs.find_one({"kode": body.kode}, {"_id": 0}):
        raise HTTPException(status_code=409, detail=f"Kode prodi '{body.kode}' sudah digunakan")
    doc = {"id": new_id(), **body.dict(), "created_at": now_iso()}
    await db.programs.insert_one(doc)
    return doc


@router.patch("/prodi/{prodi_id}")
async def patch_prodi(
    prodi_id: str,
    body: ProdiPatchInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    ex = await db.programs.find_one({"id": prodi_id}, {"_id": 0})
    if not ex:
        raise HTTPException(status_code=404, detail="Prodi tidak ditemukan")
    updates = {k: v for k, v in body.dict().items() if v is not None}
    updates["updated_at"] = now_iso()
    await db.programs.update_one({"id": prodi_id}, {"$set": updates})
    return {**ex, **updates}


# ═══════════════════════════════════════════════════════════════
#  DOSEN — update (tambah nip, is_wali, jabatan)
# ═══════════════════════════════════════════════════════════════

class DosenPatchInput(BaseModel):
    nip: Optional[str] = None
    is_wali: Optional[bool] = None
    jabatan: Optional[str] = None
    spesialisasi: Optional[str] = None
    prodi_id: Optional[str] = None


@router.get("/dosen")
async def list_dosen(
    request: Request,
    is_wali: Optional[bool] = None,
    prodi_id: Optional[str] = None,
    db: PostgresDatabase = Depends(get_db),
):
    query: Dict = {}
    if is_wali is not None:
        query["is_wali"] = is_wali
    if prodi_id:
        query["$or"] = [{"prodi_id": prodi_id}, {"prodi_id": None}, {"prodi_id": ""}]

    dosen_list = await db.users.find({**query, "role": {"$nin": ["student", "Mahasiswa", "mahasiswa"]}}, {"_id": 0, "password_hash": 0}).to_list(None)
    if not dosen_list:
        dosen_list = await db.users.find({**query, "role": {"$in": ["admin", "lecturer", "dosen", "staff", "staf"]}}, {"_id": 0, "password_hash": 0}).to_list(None)
    if not dosen_list:
        dosen_list = await db.users.find(query, {"_id": 0, "password_hash": 0}).to_list(None)

    for d in (dosen_list or []):
        did = d.get("id")
        if did:
            cnt = await db.users.count_documents({"role": "student", "dosen_wali_id": did})
            d["bimbingan_count"] = cnt
        else:
            d["bimbingan_count"] = 0

    return dosen_list or []


@router.patch("/dosen/{dosen_id}")
async def patch_dosen(
    dosen_id: str,
    body: DosenPatchInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    ex = await db.users.find_one({"id": dosen_id}, {"_id": 0, "password_hash": 0})
    if not ex:
        raise HTTPException(status_code=404, detail="Dosen tidak ditemukan")
    updates = {k: v for k, v in body.dict().items() if v is not None}
    updates["updated_at"] = now_iso()
    await db.users.update_one({"id": dosen_id}, {"$set": updates})
    return {**ex, **updates}


# ═══════════════════════════════════════════════════════════════
#  MAHASISWA — update (tambah dosen_wali_id, angkatan)
# ═══════════════════════════════════════════════════════════════

class MahasiswaPatchInput(BaseModel):
    dosen_wali_id: Optional[str] = None
    angkatan: Optional[str] = None
    status_akademik: Optional[str] = None
    prodi_id: Optional[str] = None


@router.patch("/mahasiswa/{mhs_id}")
async def patch_mahasiswa(
    mhs_id: str,
    body: MahasiswaPatchInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    ex = await db.users.find_one({"id": mhs_id, "role": "student"}, {"_id": 0, "password_hash": 0})
    if not ex:
        raise HTTPException(status_code=404, detail="Mahasiswa tidak ditemukan")
    updates = {k: v for k, v in body.dict().items() if v is not None}
    updates["updated_at"] = now_iso()
    await db.users.update_one({"id": mhs_id}, {"$set": updates})
    return {**ex, **updates}


@router.post("/assign-wali")
async def assign_dosen_wali(
    body: Dict[str, Any],
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin_or_kaprodi),
):
    """Assign dosen wali ke satu atau banyak mahasiswa sekaligus."""
    dosen_id = body.get("dosen_id")
    mahasiswa_ids = body.get("mahasiswa_ids", [])
    if not dosen_id or not mahasiswa_ids:
        raise HTTPException(status_code=400, detail="dosen_id dan mahasiswa_ids diperlukan")
    dosen = await db.users.find_one({"id": dosen_id}, {"_id": 0, "name": 1})
    if not dosen:
        raise HTTPException(status_code=404, detail="Dosen tidak ditemukan")
    for mhs_id in mahasiswa_ids:
        await db.users.update_one(
            {"id": mhs_id, "role": "student"},
            {"$set": {
                "dosen_wali_id": dosen_id,
                "dosen_wali_name": dosen.get("name", ""),
                "updated_at": now_iso(),
            }},
        )
    await db.users.update_one({"id": dosen_id}, {"$set": {"is_wali": True}})
    return {"ok": True, "assigned": len(mahasiswa_ids), "dosen": dosen.get("name")}


@router.post("/auto-assign-wali")
async def auto_assign_wali(
    body: Dict[str, Any],
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin_or_kaprodi),
):
    """Auto-assign mahasiswa secara merata ke Dosen Homebase."""
    mahasiswa_ids = body.get("mahasiswa_ids", [])
    prodi_id = body.get("prodi_id")

    if not mahasiswa_ids:
        raise HTTPException(status_code=400, detail="Daftar mahasiswa_ids diperlukan")

    # Cari dosen yang relevan (homebase prodi atau semua dosen aktif)
    query: Dict = {"role": {"$in": ["admin", "lecturer"]}}
    if prodi_id:
        query["$or"] = [{"prodi_id": prodi_id}, {"prodi_id": None}, {"prodi_id": ""}]

    dosen_list = await db.users.find(query, {"_id": 0, "id": 1, "name": 1}).to_list(None)
    if not dosen_list:
        raise HTTPException(status_code=400, detail="Tidak ada dosen aktif yang tersedia untuk assign")

    # Hitung bimbingan count saat ini
    for d in dosen_list:
        d["count"] = await db.users.count_documents({"role": "student", "dosen_wali_id": d["id"]})

    # Urutkan dari dosen dengan bimbingan terkecil
    assigned_count = 0
    for mhs_id in mahasiswa_ids:
        dosen_list.sort(key=lambda x: x["count"])
        target_dosen = dosen_list[0]

        await db.users.update_one(
            {"id": mhs_id, "role": "student"},
            {"$set": {
                "dosen_wali_id": target_dosen["id"],
                "dosen_wali_name": target_dosen["name"],
                "updated_at": now_iso(),
            }},
        )
        await db.users.update_one({"id": target_dosen["id"]}, {"$set": {"is_wali": True}})
        target_dosen["count"] += 1
        assigned_count += 1

    return {"ok": True, "assigned": assigned_count, "dosen_count": len(dosen_list)}


@router.post("/assign-prodi")
async def assign_prodi_mahasiswa(
    body: Dict[str, Any],
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    """Assign satu atau banyak mahasiswa ke suatu Program Studi (Prodi)."""
    prodi_id = body.get("prodi_id")
    mahasiswa_ids = body.get("mahasiswa_ids", [])
    if not prodi_id or not mahasiswa_ids:
        raise HTTPException(status_code=400, detail="prodi_id dan mahasiswa_ids diperlukan")
    
    prodi = await db.programs.find_one({"id": prodi_id}, {"_id": 0, "nama": 1, "name": 1, "kode": 1, "code": 1})
    if not prodi:
        raise HTTPException(status_code=404, detail="Program Studi tidak ditemukan")

    prodi_nama = prodi.get("nama") or prodi.get("name", "")
    prodi_kode = prodi.get("kode") or prodi.get("code", "")

    assigned_count = 0
    for mhs_id in mahasiswa_ids:
        await db.users.update_one(
            {"id": mhs_id, "role": "student"},
            {"$set": {
                "prodi_id": prodi_id,
                "prodi_name": prodi_nama,
                "prodi_kode": prodi_kode,
                "updated_at": now_iso(),
            }},
        )
        assigned_count += 1

    return {"ok": True, "assigned": assigned_count, "prodi": prodi_nama}


# ═══════════════════════════════════════════════════════════════
#  KELAS OFFERING — link kelas ke semester aktif
# ═══════════════════════════════════════════════════════════════

@router.post("/enroll-wizard")
async def enroll_wizard(
    body: Dict[str, Any],
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    prodi_id = body.get("prodi_id", "")
    class_id = body.get("class_id", "")
    mahasiswa_ids = body.get("mahasiswa_ids", [])
    angkatan = body.get("angkatan", "")

    if not prodi_id:
        raise HTTPException(status_code=400, detail="prodi_id diperlukan")
    if not mahasiswa_ids:
        raise HTTPException(status_code=400, detail="mahasiswa_ids diperlukan (minimal 1)")

    prodi = await db.programs.find_one(
        {"id": prodi_id},
        {"_id": 0, "nama": 1, "name": 1, "kode": 1, "code": 1},
    )
    if not prodi:
        raise HTTPException(status_code=404, detail="Program Studi tidak ditemukan")

    prodi_nama = prodi.get("nama") or prodi.get("name", "")
    prodi_kode = prodi.get("kode") or prodi.get("code", "")

    class_doc = None
    if class_id:
        class_doc = await db.classes.find_one({"id": class_id}, {"_id": 0})
        if not class_doc:
            raise HTTPException(status_code=404, detail="Kelas tidak ditemukan")

    results = []
    for mhs_id in mahasiswa_ids:
        student = await db.users.find_one(
            {"id": mhs_id, "role": "student"},
            {"_id": 0},
        )
        if not student:
            results.append({"student_id": mhs_id, "status": "not_found"})
            continue

        updates: Dict[str, Any] = {
            "prodi_id": prodi_id,
            "prodi_name": prodi_nama,
            "prodi_kode": prodi_kode,
            "updated_at": now_iso(),
        }
        if angkatan:
            updates["angkatan"] = angkatan

        if class_id and class_doc:
            already = class_id in student.get("class_ids", [])
            if not already:
                updates.setdefault("class_ids", student.get("class_ids", []))
                if class_id not in updates["class_ids"]:
                    updates["class_ids"] = [*updates["class_ids"], class_id]
                await db.classes.update_one(
                    {"id": class_id},
                    {"$addToSet": {"student_ids": mhs_id}},
                )
                await db.enrollment_requests.update_many(
                    {
                        "class_id": class_id,
                        "student_id": mhs_id,
                        "status": {"$in": ["pending", "invited"]},
                    },
                    {"$set": {
                        "status": "approved",
                        "approved_at": now_iso(),
                        "approved_by": _["id"],
                    }},
                )

        await db.users.update_one({"id": mhs_id}, {"$set": updates})
        results.append({
            "student_id": mhs_id,
            "student_name": student.get("name", ""),
            "status": "ok",
        })

    return {
        "ok": True,
        "prodi": prodi_nama,
        "class_name": class_doc.get("name", "") if class_doc else "",
        "results": results,
        "assigned": sum(1 for r in results if r["status"] == "ok"),
        "not_found": sum(1 for r in results if r["status"] == "not_found"),
    }


@router.get("/kelas-offering")
async def get_kelas_offering(
    request: Request,
    tahun_ajaran_id: Optional[str] = None,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(get_current_user),
):
    if not tahun_ajaran_id:
        active = await db.tahun_ajaran.find_one({"is_active": True}, {"_id": 0})
        tahun_ajaran_id = active["id"] if active else None
    if not tahun_ajaran_id:
        return []
    return await db.classes.find(
        {"tahun_ajaran_id": tahun_ajaran_id, "status": "active"},
        {"_id": 0},
    ).to_list(None)


@router.patch("/kelas/{kelas_id}/set-semester")
async def set_kelas_semester(
    kelas_id: str,
    body: Dict[str, Any],
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    """Link kelas ke tahun ajaran tertentu."""
    ta_id = body.get("tahun_ajaran_id")
    if not ta_id:
        raise HTTPException(status_code=400, detail="tahun_ajaran_id diperlukan")
    ta = await db.tahun_ajaran.find_one({"id": ta_id}, {"_id": 0})
    if not ta:
        raise HTTPException(status_code=404, detail="Tahun ajaran tidak ditemukan")
    await db.classes.update_one(
        {"id": kelas_id},
        {"$set": {
            "tahun_ajaran_id": ta_id,
            "tahun_ajaran_label": f"{ta['semester']} {ta['tahun']}",
            "updated_at": now_iso(),
        }},
    )
    return {"ok": True}


class GenerateRombelInput(BaseModel):
    tahun_ajaran_id: str
    course_ids: Optional[List[str]] = None


async def _resolve_rombel_context(db: PostgresDatabase, ta: Dict[str, Any]) -> Dict[str, Any]:
    """Tentukan semester target, academic_year, dan daftar kandidat MK dari semua kurikulum."""
    target_sem = str(ta.get("semester") or "Ganjil")
    target_tahun = str(ta.get("tahun") or "").strip()
    if not target_tahun:
        raise HTTPException(status_code=400, detail="Tahun ajaran belum memiliki tahun akademik")

    academic_year = target_tahun
    if re.fullmatch(r"\d{4}", target_tahun):
        academic_year = f"{target_tahun}/{int(target_tahun) + 1}"

    is_ganjil = target_sem.lower() == "ganjil"

    kurikulums = await db.kurikulum.find(
        {"prodi_id": {"$nin": ["", None]}},
        {"_id": 0},
    ).to_list(None)

    prodi_map: Dict[str, str] = {}
    for kur in kurikulums:
        pid = kur.get("prodi_id", "")
        if pid and pid not in prodi_map:
            prodi = await db.programs.find_one({"id": pid}, {"_id": 0, "nama": 1})
            prodi_map[pid] = (prodi.get("nama", "") if prodi else "") or kur.get("prodi_nama", "")

    candidates: List[Dict[str, Any]] = []
    processed_course_ids: set[str] = set()
    for kur in kurikulums:
        prodi_id = kur.get("prodi_id", "")
        prodi_nama = prodi_map.get(prodi_id, kur.get("prodi_nama", ""))
        courses = await db.courses.find(
            {"kurikulum_id": kur["id"], "status": {"$ne": "deleted"}},
            {"_id": 0},
        ).to_list(None)
        for course in courses:
            if course["id"] in processed_course_ids:
                continue
            processed_course_ids.add(course["id"])
            paket = course.get("semester_paket") or course.get("semester") or ""
            num = None
            try:
                num = int(str(paket))
            except (ValueError, TypeError):
                num = None
            if num is not None:
                if is_ganjil and num % 2 == 0:
                    continue
                if not is_ganjil and num % 2 == 1:
                    continue
            else:
                sem_str = str(paket).lower()
                if is_ganjil and sem_str == "genap":
                    continue
                if not is_ganjil and sem_str == "ganjil":
                    continue
            candidates.append({
                "course": course,
                "prodi_id": prodi_id,
                "prodi_nama": prodi_nama,
            })

    return {
        "semester": target_sem,
        "academic_year": academic_year,
        "candidates": candidates,
    }


@router.get("/kelas/mk-baru")
async def list_mk_baru(
    request: Request,
    tahun_ajaran_id: Optional[str] = None,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    """MK kurikulum kandidat untuk semester target.

    Mengembalikan SEMUA mata kuliah kurikulum yang termasuk semester target
    (ganjil/genap), disertai flag ``sudah_punya_kelas`` bila MK sudah memiliki
    rombel pada TA target sehingga tidak perlu di-generate lagi.
    """
    if not tahun_ajaran_id:
        active = await db.tahun_ajaran.find_one({"is_active": True}, {"_id": 0})
        tahun_ajaran_id = active["id"] if active else None
    if not tahun_ajaran_id:
        return []
    ta = await db.tahun_ajaran.find_one({"id": tahun_ajaran_id}, {"_id": 0})
    if not ta:
        raise HTTPException(status_code=404, detail="Tahun ajaran tidak ditemukan")

    ctx = await _resolve_rombel_context(db, ta)
    existing = await db.classes.find(
        {
            "academic_year": ctx["academic_year"],
            "semester": ctx["semester"],
            "status": {"$ne": "deleted"},
        },
        {"_id": 0, "course_id": 1},
    ).to_list(None)
    existing_course_ids = {c.get("course_id") for c in existing}

    result = []
    for item in ctx["candidates"]:
        course = item["course"]
        has_class = course["id"] in existing_course_ids
        result.append({
            "id": course["id"],
            "code": course.get("code") or course.get("kode") or "",
            "name": course.get("name") or course.get("nama") or "",
            "sks": course.get("sks", course.get("total_sks", "")),
            "semester_paket": course.get("semester_paket") or course.get("semester") or "",
            "prodi_id": item["prodi_id"],
            "prodi_name": item["prodi_nama"],
            "dosen_utama_nama": course.get("dosen_utama_nama") or "",
            "sudah_punya_kelas": has_class,
        })
    return result


@router.post("/kelas/generate-rombel")
async def generate_rombel_from_kurikulum(
    body: GenerateRombelInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    """Auto-generate rombel (kelas) dari MK kurikulum yang belum punya kelas untuk TA target.

    Bila `course_ids` diberikan, hanya MK tersebut yang diproses (dicentang di wizard).
    """
    ta = await db.tahun_ajaran.find_one({"id": body.tahun_ajaran_id}, {"_id": 0})
    if not ta:
        raise HTTPException(status_code=404, detail="Tahun ajaran tidak ditemukan")

    ctx = await _resolve_rombel_context(db, ta)
    want = set(body.course_ids or [])

    existing = await db.classes.find(
        {
            "academic_year": ctx["academic_year"],
            "semester": ctx["semester"],
            "status": {"$ne": "deleted"},
        },
        {"_id": 0, "course_id": 1},
    ).to_list(None)
    existing_course_ids = {c.get("course_id") for c in existing}

    results: List[Dict[str, Any]] = []
    created: List[Dict[str, Any]] = []
    skipped: List[Dict[str, Any]] = []

    for item in ctx["candidates"]:
        course = item["course"]
        cid = course["id"]
        if want and cid not in want:
            continue
        if cid in existing_course_ids:
            skipped.append({"course_id": cid, "course_name": course.get("name", "")})
            results.append({
                "course_id": cid,
                "course_name": course.get("name", ""),
                "status": "exists",
                "message": "Sudah punya kelas",
            })
            continue

        rombel_name = "01"
        seed = f"{course.get('code') or course.get('kode') or 'KLS'}{rombel_name}{uuid4().hex[:4]}"
        dosen_id = course.get("dosen_utama_id") or ""
        dosen_nama = course.get("dosen_utama_nama") or ""
        if not dosen_nama and dosen_id:
            dosen = await db.users.find_one({"id": dosen_id}, {"_id": 0, "name": 1})
            dosen_nama = dosen.get("name", "") if dosen else ""

        doc = {
            "id": new_id(),
            "academic_year": ctx["academic_year"],
            "semester": ctx["semester"],
            "semester_paket": course.get("semester_paket") or course.get("semester") or "",
            "course_id": cid,
            "course_name": course.get("name") or course.get("nama") or "",
            "course_code": course.get("code") or course.get("kode") or "",
            "sks": course.get("sks", course.get("total_sks", 0)),
            "program_id": item["prodi_id"],
            "program_name": item["prodi_nama"],
            "name": rombel_name,
            "class_code": _clean_code(seed),
            "schedule": "",
            "lecturer_id": dosen_id,
            "lecturer_name": dosen_nama,
            "status": "active",
            "student_ids": [],
            "tahun_ajaran_id": ta["id"],
            "tahun_ajaran_label": f"{ctx['semester']} {ta.get('tahun', '')}",
            "created_at": now_iso(),
        }
        await db.classes.insert_one(doc)
        created.append(doc)
        existing_course_ids.add(cid)
        results.append({
            "course_id": cid,
            "course_name": course.get("name", ""),
            "status": "created",
            "class_id": doc["id"],
            "message": "Rombel berhasil dibuat",
        })

    return {
        "ok": True,
        "created": created,
        "skipped": skipped,
        "results": results,
        "message": f"{len(created)} rombel baru dibuat, {len(skipped)} sudah ada",
    }


# ==========================================
# MASTER JABATAN AKADEMIK LOKAL KAMPUS (TUGAS TAMBAHAN)
# ==========================================

DEFAULT_JABATAN_AKADEMIK = [
    {
        "id": "jablokal-dir",
        "nama": "Direktur / Rektor Kampus",
        "kode": "DIREKTUR",
        "unit_kerja": "Perguruan Tinggi",
        "sks_ekuivalensi": 6,
        "deskripsi": "Pimpinan tertinggi institusi perguruan tinggi dalam pengelolaan akademik, keuangan, dan pengembangan.",
        "status": "active",
        "is_default": True,
        "scope": "institution",
    },
    {
        "id": "jablokal-wadir1",
        "nama": "Wakil Direktur I (Bidang Akademik)",
        "kode": "WADIR1",
        "unit_kerja": "Perguruan Tinggi",
        "sks_ekuivalensi": 4,
        "deskripsi": "Penanggung jawab bidang akademik, kurikulum, perkuliahan, dan kalender akademik kampus.",
        "status": "active",
        "is_default": True,
        "scope": "institution",
    },
    {
        "id": "jablokal-wadir2",
        "nama": "Wakil Direktur II (Bidang Keuangan & SDM)",
        "kode": "WADIR2",
        "unit_kerja": "Perguruan Tinggi",
        "sks_ekuivalensi": 4,
        "deskripsi": "Penanggung jawab bidang keuangan, anggaran, sarana prasarana, dan kepegawaian SDM.",
        "status": "active",
        "is_default": True,
        "scope": "institution",
    },
    {
        "id": "jablokal-wadir3",
        "nama": "Wakil Direktur III (Bidang Kemahasiswaan & Alumni)",
        "kode": "WADIR3",
        "unit_kerja": "Perguruan Tinggi",
        "sks_ekuivalensi": 4,
        "deskripsi": "Penanggung jawab kegiatan kemahasiswaan, beasiswa, organisasi, dan alumni.",
        "status": "active",
        "is_default": True,
        "scope": "institution",
    },
    {
        "id": "jablokal-1",
        "nama": "Ketua Program Studi (Kaprodi)",
        "kode": "KAPRODI",
        "unit_kerja": "Program Studi",
        "sks_ekuivalensi": 3,
        "deskripsi": "Memimpin dan mengelola penyelenggaraan akademik, kurikulum, serta operasional program studi.",
        "status": "active",
        "is_default": True,
        "scope": "prodi",
    },
    {
        "id": "jablokal-5",
        "nama": "Sekretaris Program Studi (Sekprodi)",
        "kode": "SEKPRODI",
        "unit_kerja": "Program Studi",
        "sks_ekuivalensi": 2,
        "deskripsi": "Membantu Kaprodi dalam administrasi akademik dan penyusunan jadwal perkuliahan.",
        "status": "active",
        "is_default": True,
        "scope": "prodi",
    },
    {
        "id": "jablokal-aka",
        "nama": "Kepala / Staf Bagian Akademik (BAAK)",
        "kode": "AKADEMIK",
        "unit_kerja": "Perguruan Tinggi",
        "sks_ekuivalensi": 3,
        "deskripsi": "Pengelola administrasi perkuliahan, registrasi KRS, pencatatan nilai, dan ijazah.",
        "status": "active",
        "is_default": True,
        "scope": "institution",
    },
    {
        "id": "jablokal-keu",
        "nama": "Kepala / Staf Bagian Keuangan (Bendahara)",
        "kode": "BENDAHARA",
        "unit_kerja": "Perguruan Tinggi",
        "sks_ekuivalensi": 3,
        "deskripsi": "Pengelola transaksi pembayaran UKT/SPP, verifikasi tagihan mahasiswa, dan kas kampus.",
        "status": "active",
        "is_default": True,
        "scope": "institution",
    },
    {
        "id": "jablokal-pmb",
        "nama": "Koordinator PMB (Penerimaan Mahasiswa Baru)",
        "kode": "PMB",
        "unit_kerja": "Perguruan Tinggi",
        "sks_ekuivalensi": 2,
        "deskripsi": "Koordinator pelaksanaan seleksi, pendaftaran, dan verifikasi berkas calon mahasiswa baru.",
        "status": "active",
        "is_default": True,
        "scope": "institution",
    },
    {
        "id": "jablokal-2",
        "nama": "Ketua SPMI / Penjaminan Mutu",
        "kode": "SPMI",
        "unit_kerja": "Lembaga Penjaminan Mutu",
        "sks_ekuivalensi": 3,
        "deskripsi": "Penanggung jawab Sistem Penjaminan Mutu Internal dan standar mutu perguruan tinggi.",
        "status": "active",
        "is_default": True,
        "scope": "institution",
    },
    {
        "id": "jablokal-3",
        "nama": "Ketua LPPM (Penelitian & Pengabdian)",
        "kode": "LPPM",
        "unit_kerja": "LPPM Kampus",
        "sks_ekuivalensi": 3,
        "deskripsi": "Mengkoordinasi dan mengelola kegiatan riset, jurnal, serta pengabdian masyarakat.",
        "status": "active",
        "is_default": True,
        "scope": "institution",
    },
    {
        "id": "jablokal-4",
        "nama": "Kepala Laboratorium / Bengkel",
        "kode": "KALAB",
        "unit_kerja": "Laboratorium",
        "sks_ekuivalensi": 2,
        "deskripsi": "Mengelola fasilitas laboratorium, keandalan alat, serta jadwal praktikum.",
        "status": "active",
        "is_default": True,
        "scope": "institution",
    },
    {
        "id": "jablokal-6",
        "nama": "Dekan / Ketua Jurusan",
        "kode": "DEKAN",
        "unit_kerja": "Fakultas / Jurusan",
        "sks_ekuivalensi": 4,
        "deskripsi": "Pimpinan tertinggi tingkat fakultas/jurusan dalam pengelolaan akademik dan SDM.",
        "status": "active",
        "is_default": True,
        "scope": "institution",
    },
    {
        "id": "jablokal-7",
        "nama": "Koordinator Magang / Kerja Praktik",
        "kode": "KOOR-KP",
        "unit_kerja": "Program Studi",
        "sks_ekuivalensi": 2,
        "deskripsi": "Mengelola kemitraan industri, pembimbingan, dan verifikasi nilai magang mahasiswa.",
        "status": "active",
        "is_default": True,
        "scope": "prodi",
    },
]


class JabatanAkademikInput(BaseModel):
    nama: str
    kode: str = ""
    unit_kerja: str = "Program Studi"
    sks_ekuivalensi: int = 2
    deskripsi: str = ""
    status: str = "active"


class JabatanAssignmentInput(BaseModel):
    jabatan_id: str
    user_id: str
    prodi_id: Optional[str] = ""
    catatan: Optional[str] = ""


@router.get("/jabatan-akademik")
async def list_jabatan_akademik(db: PostgresDatabase = Depends(get_db)):
    """Ambil semua daftar Jabatan Akademik Lokal Kampus."""
    for item in DEFAULT_JABATAN_AKADEMIK:
        await db.jabatan_akademik.update_one(
            {"id": item["id"]},
            {"$set": {**item, "status": "active"}},
            upsert=True,
        )
    items = await db.jabatan_akademik.find({}, {"_id": 0}).to_list(None)
    for it in (items or []):
        if it.get("is_default") or it.get("id", "").startswith("jablokal-"):
            it["status"] = "active"
    return items or DEFAULT_JABATAN_AKADEMIK


@router.post("/jabatan-akademik")
async def create_jabatan_akademik(
    body: JabatanAkademikInput,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    """Tambah Jabatan Akademik Lokal baru (Custom)."""
    item_id = f"jablokal-custom-{uuid4().hex[:8]}"
    doc = {
        "id": item_id,
        "nama": body.nama,
        "kode": body.kode or body.nama[:4].upper(),
        "unit_kerja": body.unit_kerja,
        "sks_ekuivalensi": body.sks_ekuivalensi,
        "deskripsi": body.deskripsi,
        "status": body.status,
        "is_default": False,
        "created_at": now_iso(),
    }
    await db.jabatan_akademik.insert_one(doc)
    return doc


@router.put("/jabatan-akademik/{item_id}")
async def update_jabatan_akademik(
    item_id: str,
    body: JabatanAkademikInput,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    """Update data Jabatan Akademik Lokal."""
    ex = await db.jabatan_akademik.find_one({"id": item_id}, {"_id": 0})
    if not ex:
        raise HTTPException(status_code=404, detail="Jabatan Akademik tidak ditemukan")
    
    doc = {
        "nama": body.nama,
        "kode": body.kode,
        "unit_kerja": body.unit_kerja,
        "sks_ekuivalensi": body.sks_ekuivalensi,
        "deskripsi": body.deskripsi,
        "status": body.status,
        "updated_at": now_iso(),
    }
    await db.jabatan_akademik.update_one({"id": item_id}, {"$set": doc})
    return {**ex, **doc}


@router.delete("/jabatan-akademik/{item_id}")
async def delete_jabatan_akademik(
    item_id: str,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    """Hapus Jabatan Akademik Lokal custom."""
    await db.jabatan_akademik.delete_one({"id": item_id})
    return {"ok": True}


@router.get("/jabatan-assignments")
@router.get("/jabatan-assignments/")
async def list_jabatan_assignments(db: PostgresDatabase = Depends(get_db)):
    """Ambil seluruh daftar penunjukan user/pejabat struktural & akademik."""
    assignments = await db.jabatan_assignments.find({}, {"_id": 0}).to_list(None)
    if not assignments:
        # Auto-seed from existing config & prodi
        config = await db.app_settings.find_one({"id": "main"}, {"_id": 0}) or {}
        
        # 1. Direktur / Rektor
        rector_id = config.get("rector_user_id")
        if rector_id:
            u = await db.users.find_one({"id": rector_id}, {"_id": 0})
            if u:
                await db.jabatan_assignments.update_one(
                    {"id": "assign-direktur-inst"},
                    {"$set": {
                        "id": "assign-direktur-inst",
                        "jabatan_id": "jablokal-dir",
                        "jabatan_nama": "Direktur / Rektor Kampus",
                        "jabatan_kode": "DIREKTUR",
                        "unit_kerja": "Perguruan Tinggi",
                        "user_id": u["id"],
                        "user_name": u.get("name", ""),
                        "user_nip": u.get("nip") or u.get("employee_id", ""),
                        "user_email": u.get("email", ""),
                        "user_avatar": u.get("avatar_url", ""),
                        "prodi_id": "",
                        "prodi_nama": "",
                        "updated_at": now_iso(),
                    }},
                    upsert=True,
                )

        # 2. Warek I / Wadir I
        v1_id = config.get("vice_rector_user_id")
        if v1_id:
            u = await db.users.find_one({"id": v1_id}, {"_id": 0})
            if u:
                await db.jabatan_assignments.update_one(
                    {"id": "assign-wadir1-inst"},
                    {"$set": {
                        "id": "assign-wadir1-inst",
                        "jabatan_id": "jablokal-wadir1",
                        "jabatan_nama": "Wakil Direktur I (Bidang Akademik)",
                        "jabatan_kode": "WADIR1",
                        "unit_kerja": "Perguruan Tinggi",
                        "user_id": u["id"],
                        "user_name": u.get("name", ""),
                        "user_nip": u.get("nip") or u.get("employee_id", ""),
                        "user_email": u.get("email", ""),
                        "user_avatar": u.get("avatar_url", ""),
                        "prodi_id": "",
                        "prodi_nama": "",
                        "updated_at": now_iso(),
                    }},
                    upsert=True,
                )

        # 3. BAAK / Akademik
        baak_id = config.get("baak_user_id")
        if baak_id:
            u = await db.users.find_one({"id": baak_id}, {"_id": 0})
            if u:
                await db.jabatan_assignments.update_one(
                    {"id": "assign-akademik-inst"},
                    {"$set": {
                        "id": "assign-akademik-inst",
                        "jabatan_id": "jablokal-aka",
                        "jabatan_nama": "Kepala / Staf Bagian Akademik (BAAK)",
                        "jabatan_kode": "AKADEMIK",
                        "unit_kerja": "Perguruan Tinggi",
                        "user_id": u["id"],
                        "user_name": u.get("name", ""),
                        "user_nip": u.get("nip") or u.get("employee_id", ""),
                        "user_email": u.get("email", ""),
                        "user_avatar": u.get("avatar_url", ""),
                        "prodi_id": "",
                        "prodi_nama": "",
                        "updated_at": now_iso(),
                    }},
                    upsert=True,
                )

        # 4. LPPM
        lppm_id = config.get("lppm_user_id")
        if lppm_id:
            u = await db.users.find_one({"id": lppm_id}, {"_id": 0})
            if u:
                await db.jabatan_assignments.update_one(
                    {"id": "assign-lppm-inst"},
                    {"$set": {
                        "id": "assign-lppm-inst",
                        "jabatan_id": "jablokal-3",
                        "jabatan_nama": "Ketua LPPM (Penelitian & Pengabdian)",
                        "jabatan_kode": "LPPM",
                        "unit_kerja": "LPPM Kampus",
                        "user_id": u["id"],
                        "user_name": u.get("name", ""),
                        "user_nip": u.get("nip") or u.get("employee_id", ""),
                        "user_email": u.get("email", ""),
                        "user_avatar": u.get("avatar_url", ""),
                        "prodi_id": "",
                        "prodi_nama": "",
                        "updated_at": now_iso(),
                    }},
                    upsert=True,
                )

        # 5. Kaprodi per Prodi
        prodi_list = await db.programs.find({}, {"_id": 0}).to_list(None)
        for p in (prodi_list or []):
            kap_name = p.get("kaprodi") or p.get("kaprodi_name")
            kap_uid = p.get("kaprodi_user_id")
            u = None
            if kap_uid:
                u = await db.users.find_one({"id": kap_uid}, {"_id": 0})
            elif kap_name:
                u = await db.users.find_one({"name": kap_name, "role": {"$in": ["admin", "lecturer"]}}, {"_id": 0})

            if u and p.get("id"):
                await db.jabatan_assignments.update_one(
                    {"id": f"assign-kaprodi-{p['id']}"},
                    {"$set": {
                        "id": f"assign-kaprodi-{p['id']}",
                        "jabatan_id": "jablokal-1",
                        "jabatan_nama": "Ketua Program Studi (Kaprodi)",
                        "jabatan_kode": "KAPRODI",
                        "unit_kerja": "Program Studi",
                        "user_id": u["id"],
                        "user_name": u.get("name", ""),
                        "user_nip": u.get("nip") or u.get("employee_id", ""),
                        "user_email": u.get("email", ""),
                        "user_avatar": u.get("avatar_url", ""),
                        "prodi_id": p["id"],
                        "prodi_nama": p.get("nama", ""),
                        "updated_at": now_iso(),
                    }},
                    upsert=True,
                )

        assignments = await db.jabatan_assignments.find({}, {"_id": 0}).to_list(None)
        for user_id in {item.get("user_id") for item in assignments if item.get("user_id")}:
            await rebuild_user_position_access(db, user_id)

    return assignments or []


@router.post("/jabatan-assignments")
@router.post("/jabatan-assignments/")
@router.put("/jabatan-assignments")
@router.put("/jabatan-assignments/")
async def save_jabatan_assignment(
    body: JabatanAssignmentInput,
    db: PostgresDatabase = Depends(get_db),
):
    """Plotting user ke Jabatan Akademik/Struktural dan auto-sync ke modul lain."""
    jabatan = await db.jabatan_akademik.find_one({"id": body.jabatan_id}, {"_id": 0})
    if not jabatan:
        jabatan = next((item for item in DEFAULT_JABATAN_AKADEMIK if item["id"] == body.jabatan_id), None)
        if not jabatan:
            jabatan = {"id": body.jabatan_id, "nama": "Jabatan Akademik", "kode": "JAB", "unit_kerja": "Program Studi"}

    user = await db.users.find_one({"id": body.user_id}, {"_id": 0})
    if not user:
        user = await db.users.find_one({"username": body.user_id}, {"_id": 0})
    if not user:
        user = await db.users.find_one({"name": body.user_id}, {"_id": 0})
    if not user:
        user = {
            "id": body.user_id,
            "name": body.user_id,
            "nip": "",
            "email": "",
            "avatar_url": "",
        }

    prodi = None
    if body.prodi_id:
        prodi = await db.prodi.find_one({"id": body.prodi_id}, {"_id": 0})
        if not prodi:
            prodi = await db.programs.find_one({"id": body.prodi_id}, {"_id": 0})

    assignment_id = f"assign-{str(jabatan.get('kode', 'jab')).lower()}-{body.prodi_id or 'inst'}"
    doc = {
        "id": assignment_id,
        "jabatan_id": jabatan["id"],
        "jabatan_nama": jabatan.get("nama", ""),
        "jabatan_kode": jabatan.get("kode", ""),
        "unit_kerja": jabatan.get("unit_kerja", "Program Studi"),
        "user_id": user["id"],
        "user_name": user.get("name", ""),
        "user_nip": user.get("nip") or user.get("employee_id") or user.get("username", ""),
        "user_email": user.get("email", ""),
        "user_avatar": user.get("avatar_url", ""),
        "prodi_id": body.prodi_id or "",
        "prodi_nama": prodi.get("nama", "") if prodi else "",
        "catatan": body.catatan or "",
        "updated_at": now_iso(),
    }

    await db.jabatan_assignments.update_one({"id": assignment_id}, {"$set": doc}, upsert=True)

    # ── SINKRONISASI OTOMATIS DUA ARAH (BIDIRECTIONAL SYNC) ──
    try:
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"jabatan_akademik": jabatan.get("nama", ""), "jabatan_kode": jabatan.get("kode", "")}},
        )
    except Exception as e:
        pass

    if jabatan.get("kode") in {"KAPRODI", "SEKPRODI"} and body.prodi_id:
        try:
            if jabatan.get("kode") == "KAPRODI":
                prodi_update = {
                    "kaprodi": user.get("name", ""),
                    "kaprodi_user_id": user["id"],
                    "kaprodi_name": user.get("name", ""),
                    "kaprodi_nip": user.get("nip") or user.get("employee_id", ""),
                }
                await db.prodi.update_one({"id": body.prodi_id}, {"$set": prodi_update})
                await db.programs.update_one({"id": body.prodi_id}, {"$set": prodi_update})

            assigned_prodis = list(set(user.get("assigned_prodi_ids") or []) | {body.prodi_id})
            await db.users.update_one(
                {"id": user["id"]},
                {"$set": {"assigned_prodi_ids": assigned_prodis}},
            )
        except Exception as e:
            pass

    config_updates = {}
    if jabatan.get("kode") == "DIREKTUR":
        config_updates.update({
            "rector_user_id": user["id"],
            "rector_name": user.get("name", ""),
            "rector_nidn": user.get("nip") or user.get("employee_id", ""),
        })
    elif jabatan.get("kode") == "WADIR1":
        config_updates.update({
            "vice_rector_user_id": user["id"],
            "vice_rector_1": user.get("name", ""),
        })
    elif jabatan.get("kode") == "AKADEMIK":
        config_updates.update({
            "baak_user_id": user["id"],
            "baak_name": user.get("name", ""),
        })
    elif jabatan["kode"] == "LPPM":
        config_updates.update({
            "lppm_user_id": user["id"],
            "lppm_name": user.get("name", ""),
        })
    elif jabatan["kode"] == "SPMI":
        config_updates.update({
            "spmi_user_id": user["id"],
            "spmi_name": user.get("name", ""),
        })

    if config_updates:
        await db.app_settings.update_one(
            {"id": "main"},
            {"$set": config_updates},
            upsert=True,
        )

    derived_accesses = await rebuild_user_position_access(db, user["id"])
    doc["access_sync"] = {
        "roles": sorted({item["access_role"] for item in derived_accesses if item.get("access_role")}),
        "templates": sorted({item["template_name"] for item in derived_accesses if item.get("template_name")}),
        "scope_prodi_ids": sorted({item["prodi_id"] for item in derived_accesses if item.get("prodi_id")}),
    }
    return doc


@router.delete("/jabatan-assignments/{assignment_id}")
async def delete_jabatan_assignment(
    assignment_id: str,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    """Revoke / hapus penunjukan pejabat."""
    ex = await db.jabatan_assignments.find_one({"id": assignment_id}, {"_id": 0})
    if ex:
        if ex.get("jabatan_kode") == "KAPRODI" and ex.get("prodi_id"):
            await db.prodi.update_one(
                {"id": ex["prodi_id"]},
                {"$unset": {"kaprodi": "", "kaprodi_user_id": "", "kaprodi_name": "", "kaprodi_nip": ""}},
            )
            await db.programs.update_one(
                {"id": ex["prodi_id"]},
                {"$unset": {"kaprodi": "", "kaprodi_user_id": "", "kaprodi_name": "", "kaprodi_nip": ""}},
            )
        await db.jabatan_assignments.delete_one({"id": assignment_id})
        derived_accesses = await rebuild_user_position_access(db, ex.get("user_id", ""))
        return {
            "ok": True,
            "access_sync": {
                "roles": sorted({item["access_role"] for item in derived_accesses if item.get("access_role")}),
                "scope_prodi_ids": sorted({item["prodi_id"] for item in derived_accesses if item.get("prodi_id")}),
            },
        }
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════
#  GEDUNG — gedung kampus (parent dari ruangan)
# ═══════════════════════════════════════════════════════════════

class GedungInput(BaseModel):
    kode: str
    nama: str
    lokasi: Optional[str] = None
    keterangan: Optional[str] = None
    status: str = "active"


@router.get("/gedung")
async def list_gedung(
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(get_current_user),
):
    gedung_list = await db.gedung.find({}, {"_id": 0}).to_list(None)
    for g in gedung_list:
        gid = g.get("id")
        if gid:
            g["ruangan_count"] = await db.ruangan.count_documents({"gedung_id": gid, "status": "active"})
        else:
            g["ruangan_count"] = 0
    return gedung_list


@router.post("/gedung")
async def create_gedung(
    body: GedungInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    if await db.gedung.find_one({"kode": body.kode}, {"_id": 0}):
        raise HTTPException(status_code=409, detail=f"Kode gedung '{body.kode}' sudah digunakan")
    doc = {"id": new_id(), **body.dict(), "created_at": now_iso()}
    await db.gedung.insert_one(doc)
    return doc


@router.put("/gedung/{gid}")
async def update_gedung(
    gid: str,
    body: GedungInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    ex = await db.gedung.find_one({"id": gid}, {"_id": 0})
    if not ex:
        raise HTTPException(status_code=404, detail="Gedung tidak ditemukan")
    await db.gedung.update_one({"id": gid}, {"$set": {**body.dict(), "updated_at": now_iso()}})
    return {**ex, **body.dict()}


@router.delete("/gedung/{gid}")
async def delete_gedung(
    gid: str,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    ex = await db.gedung.find_one({"id": gid}, {"_id": 0})
    if not ex:
        raise HTTPException(status_code=404, detail="Gedung tidak ditemukan")
    ruang_aktif = await db.ruangan.count_documents({"gedung_id": gid, "status": "active"})
    if ruang_aktif > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Gedung masih memiliki {ruang_aktif} ruangan aktif. Nonaktifkan/hapus ruangannya terlebih dahulu.",
        )
    await db.gedung.update_one(
        {"id": gid},
        {"$set": {"status": "inactive", "updated_at": now_iso()}},
    )
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════
#  RUANGAN — ruang di bawah gedung (gedung_id)
# ═══════════════════════════════════════════════════════════════

class RuanganInput(BaseModel):
    kode: str
    nama: str
    gedung_id: Optional[str] = None
    lantai: Optional[str] = None
    kapasitas: Optional[int] = Field(None, ge=0)
    keterangan: Optional[str] = None
    status: str = "active"


class RuanganPatchInput(BaseModel):
    kode: Optional[str] = None
    nama: Optional[str] = None
    gedung_id: Optional[str] = None
    lantai: Optional[str] = None
    kapasitas: Optional[int] = None
    keterangan: Optional[str] = None
    status: Optional[str] = None


@router.get("/ruangan")
async def list_ruangan(
    request: Request,
    gedung_id: Optional[str] = None,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(get_current_user),
):
    query = {}
    if gedung_id:
        query["gedung_id"] = gedung_id
    ruangan_list = await db.ruangan.find(query, {"_id": 0}).to_list(None)
    gedung_map = {}
    for r in ruangan_list:
        gid = r.get("gedung_id")
        if gid and gid not in gedung_map:
            gedung = await db.gedung.find_one({"id": gid}, {"_id": 0})
            gedung_map[gid] = gedung or None
        r["gedung_nama"] = gedung_map.get(gid, {}).get("nama") if gedung_map.get(gid) else None
        r["gedung_kode"] = gedung_map.get(gid, {}).get("kode") if gedung_map.get(gid) else None
    return ruangan_list


@router.post("/ruangan")
async def create_ruangan(
    body: RuanganInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    if await db.ruangan.find_one({"kode": body.kode}, {"_id": 0}):
        raise HTTPException(status_code=409, detail=f"Kode ruangan '{body.kode}' sudah digunakan")
    doc = {"id": new_id(), **body.dict(), "created_at": now_iso()}
    await db.ruangan.insert_one(doc)
    return doc


@router.patch("/ruangan/{rid}")
async def patch_ruangan(
    rid: str,
    body: RuanganPatchInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    ex = await db.ruangan.find_one({"id": rid}, {"_id": 0})
    if not ex:
        raise HTTPException(status_code=404, detail="Ruangan tidak ditemukan")
    updates = {k: v for k, v in body.dict().items() if v is not None}
    updates["updated_at"] = now_iso()
    await db.ruangan.update_one({"id": rid}, {"$set": updates})
    return {**ex, **updates}


@router.delete("/ruangan/{rid}")
async def delete_ruangan(
    rid: str,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    await db.ruangan.update_one(
        {"id": rid},
        {"$set": {"status": "inactive", "updated_at": now_iso()}},
    )
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════
#  JADWAL MENGAJAR — penjadwalan kelas (hari, jam, ruangan)
# ═══════════════════════════════════════════════════════════════

JADWAL_HARI_LABEL = {1: "Senin", 2: "Selasa", 3: "Rabu", 4: "Kamis", 5: "Jumat", 6: "Sabtu", 7: "Minggu"}


def _parse_jam(value: Any) -> int:
    try:
        parts = str(value).strip().split(":")
        return int(parts[0]) * 60 + int(parts[1])
    except (ValueError, IndexError):
        return -1


def _build_schedule_label(hari: Optional[int], jam_mulai: Any, jam_selesai: Any, ruangan_kode: str = "") -> str:
    parts = []
    if hari in JADWAL_HARI_LABEL:
        parts.append(f"{JADWAL_HARI_LABEL[hari]}, {jam_mulai}–{jam_selesai}")
    if ruangan_kode:
        parts.append(f"Ruang {ruangan_kode}")
    return " · ".join(parts)


class JadwalMengajarInput(BaseModel):
    hari: int = Field(ge=1, le=7, description="1=Senin s/d 7=Minggu")
    jam_mulai: str
    jam_selesai: str
    ruangan_id: Optional[str] = None


@router.get("/jadwal-mengajar")
async def list_jadwal_mengajar(
    request: Request,
    tahun_ajaran: Optional[str] = None,
    semester: Optional[str] = None,
    prodi_id: Optional[str] = None,
    dosen_id: Optional[str] = None,
    hari: Optional[int] = None,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(get_current_user),
):
    return await _fetch_jadwal_mengajar(
        db,
        tahun_ajaran=tahun_ajaran,
        semester=semester,
        prodi_id=prodi_id,
        dosen_id=dosen_id,
        hari=hari,
    )


async def _fetch_jadwal_mengajar(
    db: PostgresDatabase,
    *,
    tahun_ajaran: Optional[str] = None,
    semester: Optional[str] = None,
    prodi_id: Optional[str] = None,
    dosen_id: Optional[str] = None,
    hari: Optional[int] = None,
) -> List[Dict[str, Any]]:
    query: Dict[str, Any] = {"status": {"$ne": "deleted"}}
    if tahun_ajaran:
        prefix = tahun_ajaran.strip()
        all_years = await db.classes.distinct("academic_year")
        matching = sorted({str(y) for y in all_years if y and str(y).startswith(prefix)})
        if not matching:
            return []
        query["academic_year"] = {"$in": matching}
    if semester:
        query["semester"] = semester
    if prodi_id:
        query["program_id"] = prodi_id
    if dosen_id:
        query["lecturer_id"] = dosen_id
    if hari is not None:
        query["jadwal_hari"] = hari
    classes = await db.classes.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    dosen_map: Dict[str, str] = {}
    ruangan_map: Dict[str, Dict[str, Any]] = {}
    sks_cache: Dict[str, Any] = {}
    result = []
    for c in classes:
        lid = c.get("lecturer_id", "")
        if lid and lid not in dosen_map:
            dosen = await db.users.find_one(
                {"$or": [{"id": lid}, {"username": lid}, {"nim": lid}]},
                {"_id": 0, "id": 1, "name": 1, "nidn": 1},
            )
            dosen_map[lid] = dosen.get("name", "") if dosen else ""
        rid = c.get("ruangan_id", "")
        if rid and rid not in ruangan_map:
            ruang = await db.ruangan.find_one({"id": rid}, {"_id": 0})
            ruangan_map[rid] = ruang or {}
        ruang = ruangan_map.get(rid, {})
        sks = c.get("sks")
        if sks in (None, ""):
            course_id = c.get("course_id", "")
            if course_id and course_id not in sks_cache:
                sks_cache[course_id] = ""
                crs = await db.courses.find_one({"id": course_id}, {"_id": 0, "sks": 1, "total_sks": 1})
                if crs:
                    sks_cache[course_id] = crs.get("sks", crs.get("total_sks", ""))
            sks = sks_cache.get(course_id, "")
        result.append(
            {
                "class_id": c.get("id", ""),
                "class_code": c.get("class_code", ""),
                "class_name": c.get("name", ""),
                "course_id": c.get("course_id", ""),
                "course_name": c.get("course_name", ""),
                "course_code": c.get("course_code", ""),
                "sks": sks,
                "program_id": c.get("program_id", ""),
                "program_name": c.get("program_name", ""),
                "academic_year": c.get("academic_year", ""),
                "semester": c.get("semester", ""),
                "status": c.get("status", ""),
                "dosen_id": lid,
                "dosen_name": dosen_map.get(lid, c.get("lecturer_name", "")),
                "jadwal_hari": c.get("jadwal_hari"),
                "jam_mulai": c.get("jadwal_jam_mulai", ""),
                "jam_selesai": c.get("jadwal_jam_selesai", ""),
                "ruangan_id": rid,
                "ruangan_kode": ruang.get("kode", ""),
                "ruangan_nama": ruang.get("nama", ""),
                "gedung_id": ruang.get("gedung_id", ""),
                "schedule": c.get("schedule", ""),
            }
        )
    return result


@router.put("/jadwal-mengajar/{class_id}")
async def update_jadwal_mengajar(
    class_id: str,
    body: JadwalMengajarInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    class_doc = await db.classes.find_one({"id": class_id, "status": {"$ne": "deleted"}}, {"_id": 0})
    if not class_doc:
        raise HTTPException(status_code=404, detail="Kelas tidak ditemukan")
    if class_doc.get("status") not in ("active", "pending", ""):
        raise HTTPException(status_code=409, detail="Hanya kelas aktif yang dapat dijadwalkan.")

    mulai = _parse_jam(body.jam_mulai)
    selesai = _parse_jam(body.jam_selesai)
    if mulai < 0 or selesai < 0:
        raise HTTPException(status_code=400, detail="Format jam tidak valid. Gunakan HH:MM.")
    if selesai <= mulai:
        raise HTTPException(status_code=400, detail="Jam selesai harus lebih besar dari jam mulai.")

    ruangan_kode = ""
    if body.ruangan_id:
        ruang = await db.ruangan.find_one({"id": body.ruangan_id, "status": "active"}, {"_id": 0})
        if not ruang:
            raise HTTPException(status_code=404, detail="Ruangan tidak ditemukan atau tidak aktif")
        ruangan_kode = ruang.get("kode", "")

    period_query: Dict[str, Any] = {
        "status": {"$ne": "deleted"},
        "id": {"$ne": class_id},
        "academic_year": class_doc.get("academic_year", ""),
        "semester": class_doc.get("semester", ""),
        "jadwal_hari": body.hari,
    }
    conflicts = []
    for other in await db.classes.find(period_query, {"_id": 0}).to_list(1000):
        other_mulai = _parse_jam(other.get("jadwal_jam_mulai", ""))
        other_selesai = _parse_jam(other.get("jadwal_jam_selesai", ""))
        if other_mulai < 0:
            continue
        overlap = mulai < other_selesai and other_mulai < selesai
        if not overlap:
            continue
        same_dosen = other.get("lecturer_id") and other.get("lecturer_id") == class_doc.get("lecturer_id")
        same_ruang = body.ruangan_id and other.get("ruangan_id") == body.ruangan_id
        if same_dosen or same_ruang:
            konflik_kind = "Dosen" if same_dosen else ("Ruangan" if same_ruang else "")
            conflicts.append(
                {
                    "class_id": other.get("id", ""),
                    "class_name": other.get("name", ""),
                    "course_name": other.get("course_name", ""),
                    "jam_mulai": other.get("jadwal_jam_mulai", ""),
                    "jam_selesai": other.get("jadwal_jam_selesai", ""),
                    "jenis": konflik_kind,
                }
            )
    if conflicts:
        detail = "Bentrok jadwal: " + "; ".join(
            f"{c['jenis']} pada kelas {c['course_name']} ({c['jam_mulai']}–{c['jam_selesai']})"
            for c in conflicts[:5]
        )
        raise HTTPException(status_code=409, detail=detail, headers={"X-Conflicts": "1"})

    jam_mulai = str(body.jam_mulai)
    jam_selesai = str(body.jam_selesai)
    label = _build_schedule_label(body.hari, jam_mulai, jam_selesai, ruangan_kode)
    updates = {
        "jadwal_hari": body.hari,
        "jadwal_jam_mulai": jam_mulai,
        "jadwal_jam_selesai": jam_selesai,
        "ruangan_id": body.ruangan_id or "",
        "ruangan_kode": ruangan_kode,
        "schedule": label,
        "updated_at": now_iso(),
    }
    await db.classes.update_one({"id": class_id}, {"$set": updates})
    return {"ok": True, "schedule": label}


# ═══════════════════════════════════════════════════════════════
#  CETAK JADWAL + VALIDASI QR
#  Cetak menyimpan snapshot jadwal + token QR. QR berisi URL
#  validasi publik sehingga dokumen hasil cetak dapat diverifikasi.
# ═══════════════════════════════════════════════════════════════

class JadwalCetakInput(BaseModel):
    tahun_ajaran: Optional[str] = None
    semester: Optional[str] = None
    prodi_id: Optional[str] = None
    dosen_id: Optional[str] = None
    validate_base_url: Optional[str] = None


def _qr_png_data_url(content: str) -> str:
    import base64
    import io

    import segno

    qr = segno.make(content, error="m")
    buf = io.BytesIO()
    qr.save(buf, kind="png", scale=6, border=2)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


async def _active_pejabat(
    db: PostgresDatabase,
    *,
    jabatan_kode: str,
    prodi_id: str = "",
) -> Optional[Dict[str, Any]]:
    """Ambil pejabat dari penugasan jabatan aktif (jabatan_akademik status=active).

    Nama pejabat yang dicatut di dokumen/surat HANYA diambil dari data ini,
    bukan dari nama user yang sedang login atau teks hardcoded.
    """
    jab = await db.jabatan_akademik.find_one({"kode": jabatan_kode}, {"_id": 0})
    if not jab:
        jab = next((j for j in DEFAULT_JABATAN_AKADEMIK if j.get("kode") == jabatan_kode), None)
    if not jab:
        return None
    if str(jab.get("status", "active")).lower() != "active":
        return None

    query: Dict[str, Any] = {"jabatan_kode": jabatan_kode, "user_id": {"$nin": ["", None]}}
    if prodi_id:
        query["prodi_id"] = prodi_id
    assign = await db.jabatan_assignments.find_one(query, {"_id": 0})
    if not assign:
        return None

    user = await db.users.find_one({"id": assign.get("user_id")}, {"_id": 0})
    if not user:
        return None

    nama = str(assign.get("user_name") or user.get("name") or "").strip()
    gelar_depan = str(user.get("gelar_depan") or "").strip()
    gelar_belakang = str(user.get("gelar_belakang") or user.get("gelar") or "").strip()
    nama_lengkap = " ".join(
        part for part in (gelar_depan, nama, gelar_belakang) if part
    ).strip() or nama
    nidn = str(user.get("nidn") or "").strip()
    nip = str(assign.get("user_nip") or user.get("nip") or user.get("employee_id") or "").strip()
    if nip and nip == nidn:
        # nilai yang tersimpan ternyata NIDN (username), bukan NIP
        nip = ""
    nuptk = str(user.get("nuptk") or "").strip()
    return {
        "user_id": str(user.get("id") or ""),
        "nama": nama_lengkap,
        "nama_pokok": nama,
        "gelar_depan": gelar_depan,
        "gelar_belakang": gelar_belakang,
        "nip": nip,
        "nidn": nidn,
        "nuptk": nuptk,
        "pangkat": str(user.get("pangkat") or ""),
        "golongan": str(user.get("golongan") or ""),
        "jabatan": str(assign.get("jabatan_nama") or jab.get("nama") or ""),
        "jabatan_kode": jabatan_kode,
        "prodi_id": str(assign.get("prodi_id") or ""),
        "prodi_nama": str(assign.get("prodi_nama") or ""),
    }


def _pejabat_ident(pejabat: Dict[str, Any]) -> str:
    """Label identitas pejabat: NIP → NIDN → NUPTK (yang tersedia saja).

    Menerima key polos (nip/nidn/nuptk) maupun berprefix pejabat_/signer_.
    """
    for kode, label in (("nip", "NIP"), ("nidn", "NIDN"), ("nuptk", "NUPTK")):
        val = pejabat.get(kode) or pejabat.get(f"pejabat_{kode}") or pejabat.get(f"signer_{kode}") or ""
        val = str(val).strip()
        if val and str(val).lower() not in ("-", "0", "none"):
            return f"{label}. {val}"
    return ""


async def _signature_plan(
    db: PostgresDatabase,
    *,
    filter_type: str,
    dosen_id: str = "",
    prodi_id: str = "",
    dosen: Optional[Dict[str, Any]] = None,
    prodi: Optional[Dict[str, Any]] = None,
    user: Dict[str, Any],
) -> Dict[str, Any]:
    """Tentukan blok pengesahan sesuai jenis filter cetakan.

    Nama pejabat (Kaprodi / Wakil Direktur / Direktur) diambil dari
    penugasan jabatan aktif, bukan dari session user.
    """
    if filter_type == "dosen":
        name = (dosen.get("name") if dosen else "") or user.get("name", "")
        gelar = (dosen.get("gelar") if dosen else "") or ""
        nidn = (dosen.get("nidn") if dosen else "") or ""
        return {
            "filter_type": "dosen",
            "jabatan": "Dosen Pengampu",
            "penandatangan": f"{name}{(' ' + gelar) if gelar else ''}".strip(),
            "detail": f"NIDN {nidn}".strip(),
        }
    if filter_type == "prodi":
        nama = (prodi.get("nama") if prodi else "") or (prodi.get("name") if prodi else "") or ""
        kap = await _active_pejabat(db, jabatan_kode="KAPRODI", prodi_id=prodi_id or "")
        if kap:
            ident = _pejabat_ident(kap)
            detail = f"Program Studi {nama}".strip()
            if ident:
                detail = f"{detail} · {ident}" if detail else ident
            return {
                "filter_type": "prodi",
                "jabatan": kap["jabatan"] or "Ketua Program Studi",
                "penandatangan": kap["nama"],
                "detail": detail,
                "pejabat_user_id": kap["user_id"],
                "pejabat_nip": kap["nip"],
                "pejabat_nidn": kap["nidn"],
                "pejabat_nuptk": kap["nuptk"],
            }
        kaprodi = (prodi.get("kaprodi") if prodi else "") or ""
        return {
            "filter_type": "prodi",
            "jabatan": "Ketua Program Studi",
            "penandatangan": kaprodi,
            "detail": f"Program Studi {nama}".strip(),
        }
    # seluruh kampus → Wakil Direktur I (Akademik), fallback ke Direktur
    for kode in ("WADIR1", "DIREKTUR"):
        pj = await _active_pejabat(db, jabatan_kode=kode)
        if pj:
            ident = _pejabat_ident(pj)
            return {
                "filter_type": "semua",
                "jabatan": pj["jabatan"],
                "penandatangan": pj["nama"],
                "detail": ident,
                "pejabat_user_id": pj["user_id"],
                "pejabat_nip": pj["nip"],
                "pejabat_nidn": pj["nidn"],
                "pejabat_nuptk": pj["nuptk"],
            }
    admin_name = user.get("name", "") if user.get("role") == "admin" else ""
    return {
        "filter_type": "semua",
        "jabatan": "Koordinator Bidang Akademik",
        "penandatangan": admin_name,
        "detail": "Operator Akademik / Admin Kampus",
    }


@router.post("/jadwal-mengajar/cetak")
async def cetak_jadwal_mengajar(
    body: JadwalCetakInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin_or_kaprodi),
):
    """Buat lembar cetak jadwal + token QR validasi."""
    rows = await _fetch_jadwal_mengajar(
        db,
        tahun_ajaran=body.tahun_ajaran,
        semester=body.semester,
        prodi_id=body.prodi_id,
        dosen_id=body.dosen_id,
    )
    user = request.state.current_user

    settings = await db.app_settings.find_one({"id": "main"}, {"_id": 0}) or {}
    kop = {
        "instansi": str(settings.get("campus_name") or "SISTEM INFORMASI AKADEMIK"),
        "alamat": str(settings.get("campus_address") or "Dokumen resmi diterbitkan secara elektronik oleh aplikasi"),
        "kota": str(settings.get("kampus_kota") or ""),
        "header_url": str(settings.get("kop_header_url") or ""),
        "footer_url": str(settings.get("kop_footer_url") or ""),
    }

    if body.dosen_id:
        filter_type = "dosen"
    elif body.prodi_id:
        filter_type = "prodi"
    else:
        filter_type = "semua"

    prodi = None
    if filter_type == "prodi" and body.prodi_id:
        prodi = await db.programs.find_one({"id": body.prodi_id}, {"_id": 0})
    dosen = None
    if filter_type == "dosen" and body.dosen_id:
        dosen = await db.users.find_one(
            {"$or": [{"id": body.dosen_id}, {"username": body.dosen_id}, {"nim": body.dosen_id}]},
            {"_id": 0, "name": 1, "nidn": 1, "gelar": 1},
        )

    signature = await _signature_plan(
        db,
        filter_type=filter_type,
        dosen_id=body.dosen_id or "",
        prodi_id=body.prodi_id or "",
        dosen=dosen,
        prodi=prodi,
        user=user or {},
    )

    token = new_id()
    base = str(body.validate_base_url or request.base_url).rstrip("/")
    qr_url = f"{base}/api/v1/master/jadwal-mengajar/validasi/{token}"

    snapshot = []
    for r in rows:
        snapshot.append(
            {
                "class_code": r["class_code"],
                "course_name": r["course_name"],
                "class_name": r["class_name"],
                "sks": r["sks"],
                "program_name": r["program_name"],
                "dosen_name": r["dosen_name"],
                "hari": JADWAL_HARI_LABEL.get(r["jadwal_hari"], "") if r["jadwal_hari"] else "",
                "jam_mulai": r["jam_mulai"],
                "jam_selesai": r["jam_selesai"],
                "ruangan_kode": r["ruangan_kode"],
            }
        )

    created_at = now_iso()
    doc = {
        "id": token,
        "token": token,
        "filter_type": filter_type,
        "tahun_ajaran": body.tahun_ajaran or "",
        "semester": body.semester or "",
        "prodi_id": body.prodi_id or "",
        "dosen_id": body.dosen_id or "",
        "signature": signature,
        "signer_jabatan": signature.get("jabatan", ""),
        "signer_name": signature.get("penandatangan", ""),
        "signer_nip": signature.get("pejabat_nip", ""),
        "signer_nidn": signature.get("pejabat_nidn", ""),
        "signer_nuptk": signature.get("pejabat_nuptk", ""),
        "signer_ident": _pejabat_ident(signature),
        "jumlah_kelas": len(rows),
        "kelas": snapshot,
        "qr_url": qr_url,
        "created_by": (user or {}).get("name", "") if user else "",
        "created_by_id": (user or {}).get("id", "") if user else "",
        "created_at": created_at,
        "status": "valid",
    }
    await db.jadwal_validations.insert_one(doc)

    signer = {
        "jabatan": signature.get("jabatan", ""),
        "nama": signature.get("penandatangan", ""),
        "nip": signature.get("pejabat_nip", ""),
        "nidn": signature.get("pejabat_nidn", ""),
        "nuptk": signature.get("pejabat_nuptk", ""),
        "ident": _pejabat_ident(signature),
        "token": token,
        "qr_url": qr_url,
        "qr_png": _qr_png_data_url(qr_url),
    }

    return {
        "ok": True,
        "token": token,
        "qr_url": qr_url,
        "qr_png": _qr_png_data_url(qr_url),
        "signer": signer,
        "filter_type": filter_type,
        "periode": {
            "tahun_ajaran": body.tahun_ajaran or "",
            "semester": body.semester or "",
        },
        "prodi_id": body.prodi_id or "",
        "prodi_nama": (prodi.get("nama") if prodi else "") or (prodi.get("name") if prodi else "") or "",
        "dosen_id": body.dosen_id or "",
        "dosen_name": (dosen.get("name") if dosen else "") or "",
        "signature": signature,
        "jumlah_kelas": len(rows),
        "created_at": created_at,
        "kop": kop,
    }


@router.get("/jadwal-mengajar/validasi/{token}")
async def validasi_jadwal_mengajar(
    token: str,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
):
    """Validasi publik dokumen cetak jadwal via QR. Publik (tanpa login)."""
    doc = await db.jadwal_validations.find_one({"token": token}, {"_id": 0})
    if not doc:
        detail = "Token QR tidak ditemukan. Dokumen tidak terdaftar atau QR bukan berasal dari aplikasi ini."
        if "text/html" in (request.headers.get("accept") or ""):
            return HTMLResponse(_validation_html(None, error=detail), status_code=404)
        raise HTTPException(status_code=404, detail=detail)

    status_ok = doc.get("status") == "valid"
    message = (
        "Dokumen valid dan terdaftar di sistem."
        if status_ok
        else "Dokumen tidak lagi valid (dicabut atau dibatalkan)."
    )
    payload = {
        "token": doc.get("token", ""),
        "valid": status_ok,
        "status": doc.get("status", ""),
        "message": message,
        "filter_type": doc.get("filter_type", ""),
        "signature": doc.get("signature", {}),
        "signer_jabatan": doc.get("signer_jabatan", ""),
        "signer_name": doc.get("signer_name", ""),
        "signer_ident": doc.get("signer_ident", ""),
        "periode": {
            "tahun_ajaran": doc.get("tahun_ajaran", ""),
            "semester": doc.get("semester", ""),
        },
        "jumlah_kelas": doc.get("jumlah_kelas", 0),
        "created_at": doc.get("created_at", ""),
        "created_by": doc.get("created_by", ""),
        "kelas": doc.get("kelas", []),
    }
    if "text/html" in (request.headers.get("accept") or ""):
        return HTMLResponse(_validation_html(payload, error=None))
    return payload


def _validation_html(payload: Optional[Dict[str, Any]], error: Optional[str]) -> str:
    import html as _html

    def esc(v: Any) -> str:
        return _html.escape(str(v if v is not None else ""), quote=True)

    if error is not None:
        body = f"""
        <div class="card invalid">
          <div class="badge">TIDAK DIKETEMUKAN</div>
          <h1>QR Tidak Terdaftar</h1>
          <p>{esc(error)}</p>
        </div>
        """
    else:
        valid = bool(payload and payload["valid"])
        sig = (payload or {}).get("signature") or {}
        per = (payload or {}).get("periode") or {}
        kelas = (payload or {}).get("kelas") or []
        rows = "".join(
            f"<tr><td>{esc(k.get('class_code',''))}</td><td>{esc(k.get('course_name',''))}</td>"
            f"<td>{esc(k.get('program_name',''))}</td><td>{esc(k.get('dosen_name',''))}</td>"
            f"<td>{esc(k.get('hari',''))}</td><td>{esc(k.get('jam_mulai',''))}–{esc(k.get('jam_selesai',''))}</td>"
            f"<td>{esc(k.get('ruangan_kode',''))}</td></tr>"
            for k in kelas
        )
        status_class = "valid" if valid else "invalid"
        status_text = "VALID" if valid else "TIDAK VALID"
        signer_rows = ""
        if payload and payload.get("signer_name"):
            signer_rows = f"""
          <table class="signer">
            <tr><th>Penandatangan</th><td>{esc(payload.get('signer_jabatan',''))}</td></tr>
            <tr><th>Nama</th><td>{esc(payload.get('signer_name',''))}</td></tr>
            <tr><th>NIP / NIDN / NUPTK</th><td>{esc(payload.get('signer_ident',''))}</td></tr>
          </table>"""
        body = f"""
        <div class="card {status_class}">
          <div class="badge">{status_text}</div>
          <h1>Pengesahan Dokumen Jadwal Mengajar</h1>
          <p>{esc(payload.get('message',''))}</p>
          <table class="meta">
            <tr><th>Periode</th><td>{esc(per.get('semester',''))} {esc(per.get('tahun_ajaran',''))}</td></tr>
            <tr><th>Jenis Filter</th><td>{esc(payload.get('filter_type',''))}</td></tr>
            <tr><th>Penandatangan</th><td>{esc(sig.get('penandatangan',''))} — {esc(sig.get('jabatan',''))} — {esc(sig.get('detail',''))}</td></tr>
            <tr><th>Jumlah Kelas</th><td>{esc(payload.get('jumlah_kelas',0))}</td></tr>
            <tr><th>Waktu Cetak</th><td>{esc(payload.get('created_at',''))}</td></tr>
            <tr><th>Dicetak Oleh</th><td>{esc(payload.get('created_by',''))}</td></tr>
          </table>
          {signer_rows}
        </div>
        <table class="grid">
          <thead><tr><th>Kode</th><th>Mata Kuliah</th><th>Prodi</th><th>Dosen</th><th>Hari</th><th>Jam</th><th>Ruang</th></tr></thead>
          <tbody>{rows or "<tr><td colspan=7>Belum ada jadwal.</td></tr>"}</tbody>
        </table>
        """
    return f"""<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Validasi Jadwal Mengajar</title>
<style>
  body {{ font-family: -apple-system, "Segoe UI", Roboto, sans-serif; background: #f1f5f9; margin: 0; padding: 32px 16px; }}
  main {{ max-width: 820px; margin: 0 auto; }}
  .card {{ border-radius: 14px; padding: 24px; margin-bottom: 20px; color: #fff; }}
  .card.valid {{ background: #059669; }}
  .card.invalid {{ background: #dc2626; }}
  .badge {{ display: inline-block; background: rgba(255,255,255,.25); padding: 4px 12px; border-radius: 999px; font-size: 12px; letter-spacing: 1px; font-weight: 700; }}
  h1 {{ margin: 10px 0 4px; font-size: 20px; }}
  .card p {{ margin: 6px 0 0; opacity: .95; }}
  table {{ width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; font-size: 13px; }}
  .meta th, .meta td {{ text-align: left; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; }}
  .meta th {{ width: 40%; color: #475569; }}
  .signer {{ margin-top: 12px; border: 1px solid #a7f3d0; }}
  .signer th, .signer td {{ text-align: left; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; }}
  .signer th {{ width: 40%; color: #047857; background: #ecfdf5; }}
  .grid th {{ background: #eef2ff; color: #3730a3; }}
  .grid th, .grid td {{ padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: left; }}
  footer {{ margin-top: 16px; color: #64748b; font-size: 12px; text-align: center; }}
</style>
</head>
<body>
<main>
{body}
<footer>Sistem Informasi Akademik — validasi otomatis hasil cetak jadwal mengajar.</footer>
</main>
</body>
</html>"""
