"""Router FastAPI untuk Manajemen Kurikulum, Matriks MK & Dosen Pengampu SIAKAD."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from uuid import uuid4
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Header
from pydantic import BaseModel, Field

from postgres_database import PostgresDatabase
from routers.user_access import user_is_admin_or_access_role


router = APIRouter(prefix="/api/v1/kurikulum", tags=["Kurikulum & Dosen Pengampu SIAKAD"])


# ─────────────────────────── helpers ────────────────────────────

def get_db(request: Request) -> PostgresDatabase:
    return request.app.state.db


async def get_current_user(request: Request) -> Dict[str, Any]:
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


async def get_current_user_with_roles(request: Request) -> Dict[str, Any]:
    user = await get_current_user(request)
    jabatan = str(user.get("jabatan_akademik") or user.get("jabatan") or user.get("tugas_tambahan") or "").lower()
    derived_roles = user.get("access_roles")
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
    if not user_is_admin_or_access_role(user, "academic_operator"):
        raise HTTPException(status_code=403, detail="Hanya admin kampus atau operator akademik yang diizinkan")
    return user


async def require_admin_or_kaprodi(request: Request) -> Dict[str, Any]:
    user = await get_current_user_with_roles(request)
    if not user_is_admin_or_access_role(user, "academic_operator") and not user.get("is_kaprodi"):
        raise HTTPException(status_code=403, detail="Hanya Admin Kampus, Operator Akademik, atau Kaprodi yang diizinkan")
    return user


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid4())


# ═══════════════════════════════════════════════════════════════
#  MODELS
# ═══════════════════════════════════════════════════════════════

class KurikulumInput(BaseModel):
    kode: str = Field(..., description="Kode kurikulum, contoh: KUR-2024-TI")
    nama: str = Field(..., description="Nama kurikulum, contoh: Kurikulum MBKM 2024")
    prodi_id: Optional[str] = Field(None, description="ID Program Studi")
    tahun_mulai: str = Field(..., description="Tahun awal berlaku, contoh: 2024")
    total_sks_lulus: int = Field(144, description="Syarat SKS minimal untuk lulus")
    deskripsi: Optional[str] = None
    status: str = Field("active", description="active | inactive | draft")


class CourseKurikulumInput(BaseModel):
    kurikulum_id: str
    prodi_id: Optional[str] = None
    kode: str
    nama: str
    sks_teori: int = Field(2, ge=0)
    sks_praktikum: int = Field(0, ge=0)
    semester_paket: int = Field(1, ge=1, le=8)
    sifat: str = Field("wajib", description="wajib | pilihan")
    dosen_utama_id: Optional[str] = None
    dosen_utama_nama: Optional[str] = None
    dosen_anggota_ids: List[str] = Field(default_factory=list)
    dosen_anggota_namas: List[str] = Field(default_factory=list)


class AssignDosenMKInput(BaseModel):
    course_id: str
    dosen_utama_id: Optional[str] = None
    dosen_utama_nama: Optional[str] = None
    dosen_anggota_ids: List[str] = Field(default_factory=list)
    dosen_anggota_namas: List[str] = Field(default_factory=list)


# ═══════════════════════════════════════════════════════════════
#  KURIKULUM MASTER ENDPOINTS
# ═══════════════════════════════════════════════════════════════

@router.get("")
async def list_kurikulum(
    request: Request,
    prodi_id: Optional[str] = None,
    db: PostgresDatabase = Depends(get_db),
    user: Dict = Depends(get_current_user_with_roles),
):
    """Daftar semua Kurikulum master dengan pembatasan Kaprodi."""
    query = {}
    if user.get("role") != "admin" and user.get("is_kaprodi"):
        target_prodi = user.get("kaprodi_prodi_id") or user.get("prodi_id")
        if target_prodi:
            query["prodi_id"] = target_prodi
    elif prodi_id:
        query["prodi_id"] = prodi_id
    items = await db.kurikulum.find(query, {"_id": 0}).to_list(None)
    return items


@router.post("")
async def create_kurikulum(
    body: KurikulumInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin_or_kaprodi),
):
    """Buat Master Kurikulum Baru."""
    if await db.kurikulum.find_one({"kode": body.kode}, {"_id": 0}):
        raise HTTPException(status_code=409, detail=f"Kode kurikulum '{body.kode}' sudah ada")
    
    prodi_nama = ""
    if body.prodi_id:
        prodi = await db.programs.find_one({"id": body.prodi_id}, {"_id": 0, "nama": 1})
        if prodi:
            prodi_nama = prodi.get("nama", "")

    doc = {
        "id": new_id(),
        **body.dict(),
        "prodi_nama": prodi_nama,
        "created_at": now_iso(),
    }
    await db.kurikulum.insert_one(doc)
    return doc


@router.put("/{kurikulum_id}")
async def update_kurikulum(
    kurikulum_id: str,
    body: KurikulumInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin_or_kaprodi),
):
    """Update Kurikulum Master."""
    ex = await db.kurikulum.find_one({"id": kurikulum_id}, {"_id": 0})
    if not ex:
        raise HTTPException(status_code=404, detail="Kurikulum tidak ditemukan")
    
    prodi_nama = ex.get("prodi_nama", "")
    if body.prodi_id:
        prodi = await db.programs.find_one({"id": body.prodi_id}, {"_id": 0, "nama": 1})
        if prodi:
            prodi_nama = prodi.get("nama", "")

    updates = {
        **body.dict(),
        "prodi_nama": prodi_nama,
        "updated_at": now_iso(),
    }
    await db.kurikulum.update_one({"id": kurikulum_id}, {"$set": updates})
    return {**ex, **updates}


@router.delete("/{kurikulum_id}")
async def delete_kurikulum(
    kurikulum_id: str,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin_or_kaprodi),
):
    """Nonaktifkan Kurikulum Master."""
    await db.kurikulum.update_one({"id": kurikulum_id}, {"$set": {"status": "inactive", "updated_at": now_iso()}})
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════
#  MATA KULIAH KURIKULUM & SKS BREAKDOWN
# ═══════════════════════════════════════════════════════════════

@router.get("/{kurikulum_id}/courses")
async def get_kurikulum_courses(
    kurikulum_id: str,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(get_current_user),
):
    """Ambil semua MK dalam suatu Kurikulum."""
    courses = await db.courses.find({"kurikulum_id": kurikulum_id}, {"_id": 0}).to_list(None)
    return courses


@router.post("/courses")
async def create_course_kurikulum(
    body: CourseKurikulumInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin_or_kaprodi),
):
    """Tambah Mata Kuliah baru ke Kurikulum dengan Rincian SKS & Dosen Pengampu."""
    kur = await db.kurikulum.find_one({"id": body.kurikulum_id}, {"_id": 0})
    if not kur:
        raise HTTPException(status_code=404, detail="Kurikulum tidak ditemukan")

    total_sks = body.sks_teori + body.sks_praktikum
    doc = {
        "id": new_id(),
        "kurikulum_id": body.kurikulum_id,
        "kurikulum_kode": kur.get("kode", ""),
        "prodi_id": body.prodi_id or kur.get("prodi_id"),
        "code": body.kode,
        "kode": body.kode,
        "name": body.nama,
        "nama": body.nama,
        "sks_teori": body.sks_teori,
        "sks_praktikum": body.sks_praktikum,
        "sks": total_sks,
        "total_sks": total_sks,
        "semester_paket": body.semester_paket,
        "semester": body.semester_paket,
        "sifat": body.sifat,
        "dosen_utama_id": body.dosen_utama_id,
        "dosen_utama_nama": body.dosen_utama_nama,
        "dosen_anggota_ids": body.dosen_anggota_ids,
        "dosen_anggota_namas": body.dosen_anggota_namas,
        "created_at": now_iso(),
    }

    # Simpan di `courses`
    await db.courses.insert_one(doc)
    return doc


@router.put("/courses/{course_id}")
async def update_course_kurikulum(
    course_id: str,
    body: CourseKurikulumInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin_or_kaprodi),
):
    """Update detail MK dan Beban SKS dalam Kurikulum."""
    ex = await db.courses.find_one({"id": course_id}, {"_id": 0})
    if not ex:
        raise HTTPException(status_code=404, detail="Mata Kuliah tidak ditemukan")

    total_sks = body.sks_teori + body.sks_praktikum
    updates = {
        "code": body.kode,
        "kode": body.kode,
        "name": body.nama,
        "nama": body.nama,
        "sks_teori": body.sks_teori,
        "sks_praktikum": body.sks_praktikum,
        "sks": total_sks,
        "total_sks": total_sks,
        "semester_paket": body.semester_paket,
        "semester": body.semester_paket,
        "sifat": body.sifat,
        "dosen_utama_id": body.dosen_utama_id,
        "dosen_utama_nama": body.dosen_utama_nama,
        "dosen_anggota_ids": body.dosen_anggota_ids,
        "dosen_anggota_namas": body.dosen_anggota_namas,
        "updated_at": now_iso(),
    }
    await db.courses.update_one({"id": course_id}, {"$set": updates})
    return {**ex, **updates}


@router.delete("/courses/{course_id}")
async def delete_course_kurikulum(
    course_id: str,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin_or_kaprodi),
):
    """Hapus MK dari Kurikulum."""
    await db.courses.delete_one({"id": course_id})
    return {"ok": True}


@router.post("/assign-dosen")
async def assign_dosen_mk(
    body: AssignDosenMKInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin_or_kaprodi),
):
    """Penugasan Dosen Pengampu Utama & Anggota (Team Teaching) ke Mata Kuliah."""
    ex = await db.courses.find_one({"id": body.course_id}, {"_id": 0})
    if not ex:
        raise HTTPException(status_code=404, detail="Mata Kuliah tidak ditemukan")

    updates = {
        "dosen_utama_id": body.dosen_utama_id,
        "dosen_utama_nama": body.dosen_utama_nama,
        "dosen_anggota_ids": body.dosen_anggota_ids,
        "dosen_anggota_namas": body.dosen_anggota_namas,
        "updated_at": now_iso(),
    }
    await db.courses.update_one({"id": body.course_id}, {"$set": updates})
    return {"ok": True, "message": "Penugasan Dosen Pengampu berhasil disimpan"}
