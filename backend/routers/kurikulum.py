"""Router FastAPI untuk Manajemen Kurikulum, Matriks MK & Dosen Pengampu SIAKAD."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from uuid import uuid4
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from postgres_database import PostgresDatabase
from course_lifecycle import (
    course_identity_changes,
    course_identity_lock_detail,
    course_usage_summary,
)
from program_scope import (
    record_matches_program_scope,
    resolve_program_identifiers,
    split_program_identifiers,
)
from academic_progress import build_curriculum_progress, summarize_curriculum_progress
from routers.user_access import (
    normalize_base_role,
    user_is_admin_or_access_role,
    user_is_program_manager,
)


router = APIRouter(prefix="/api/v1/kurikulum", tags=["Kurikulum & Dosen Pengampu SIAKAD"])


class _ProgressConnectionManager:
    """In-process fan-out for progress changes, with frontend polling fallback."""

    def __init__(self) -> None:
        self.connections: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.connections.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self.connections.discard(websocket)

    async def publish(self) -> None:
        payload = {"type": "curriculum_progress_updated", "generated_at": now_iso()}
        for websocket in list(self.connections):
            try:
                await websocket.send_json(payload)
            except Exception:
                self.disconnect(websocket)


_progress_connections = _ProgressConnectionManager()


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
    user["is_kaprodi"] = user_is_program_manager(user)
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


async def _user_from_token(db: PostgresDatabase, token: str) -> Optional[Dict[str, Any]]:
    clean_token = str(token or "").strip()
    if not clean_token:
        return None
    session = await db.sessions.find_one({"token": clean_token}, {"_id": 0})
    if not session:
        return None
    user = await db.users.find_one({"id": session.get("user_id")}, {"_id": 0})
    if not user or user.get("status", "active") != "active":
        return None
    return user


def _is_ordinary_lecturer(user: Dict[str, Any]) -> bool:
    return (
        normalize_base_role(user.get("role")) == "lecturer"
        and not user_is_program_manager(user)
        and not user_is_admin_or_access_role(user, "academic_operator")
    )


async def _lecturer_homebase_scope(
    db: PostgresDatabase,
    user: Dict[str, Any],
) -> List[str]:
    return await resolve_program_identifiers(
        db,
        user.get("prodi_id"),
        user.get("program_id"),
        user.get("homebase"),
        user.get("prodi_name"),
        user.get("program_name"),
    )


def _is_scoped_program_manager(user: Dict[str, Any]) -> bool:
    return bool(
        user_is_program_manager(user)
        and not user_is_admin_or_access_role(user, "academic_operator")
    )


async def _program_manager_scope(
    db: PostgresDatabase,
    user: Dict[str, Any],
) -> List[str]:
    raw_scope: List[str] = []
    assignments_collection = getattr(db, "jabatan_assignments", None)
    if assignments_collection is not None:
        assignments = await assignments_collection.find(
            {
                "user_id": user.get("id", ""),
                "jabatan_kode": {"$in": ["KAPRODI", "SEKPRODI"]},
                "status": {"$nin": ["inactive", "revoked"]},
            },
            {"_id": 0, "prodi_id": 1},
        ).to_list(100)
        raw_scope = split_program_identifiers(
            [assignment.get("prodi_id") for assignment in assignments]
        )
    if not raw_scope:
        raw_scope = split_program_identifiers(
            user.get("access_scope_prodi_ids"),
            user.get("kaprodi_prodi_id"),
        )
    if not raw_scope:
        raw_scope = split_program_identifiers(user.get("prodi_id"))
    return await resolve_program_identifiers(db, raw_scope)


async def _require_program_manager_scope(
    db: PostgresDatabase,
    user: Dict[str, Any],
    record: Dict[str, Any],
    *,
    detail: str = "Data berada di luar prodi yang Anda pimpin",
) -> None:
    if not _is_scoped_program_manager(user):
        return
    scope_values = await _program_manager_scope(db, user)
    if not record_matches_program_scope(
        record,
        scope_values,
        fields=("prodi_id", "prodi_kode", "prodi_nama", "program_id", "program_name"),
    ):
        raise HTTPException(status_code=403, detail=detail)


async def _require_program_manager_course_scope(
    db: PostgresDatabase,
    user: Dict[str, Any],
    course: Dict[str, Any],
) -> None:
    if not _is_scoped_program_manager(user):
        return
    scope_values = await _program_manager_scope(db, user)
    if record_matches_program_scope(course, scope_values):
        return
    kurikulum_id = str(course.get("kurikulum_id") or "").strip()
    kurikulum = await db.kurikulum.find_one({"id": kurikulum_id}, {"_id": 0}) if kurikulum_id else None
    if kurikulum and record_matches_program_scope(
        kurikulum,
        scope_values,
        fields=("prodi_id", "prodi_kode", "prodi_nama"),
    ):
        return
    raise HTTPException(status_code=403, detail="Mata kuliah berada di luar prodi yang Anda pimpin")


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


class RetireCourseInput(BaseModel):
    reason: str = Field(..., min_length=3, description="Alasan MK tidak lagi digunakan")
    replacement_course_id: Optional[str] = Field(None, description="MK pengganti bila ada")
    effective_from: Optional[str] = Field(None, description="Periode mulai tidak digunakan")


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
    """Daftar kurikulum sesuai cakupan struktural atau homebase dosen."""
    query = {}
    if _is_scoped_program_manager(user):
        scope_values = await _program_manager_scope(db, user)
        if not scope_values:
            return []
    elif _is_ordinary_lecturer(user):
        scope_values = await _lecturer_homebase_scope(db, user)
        if not scope_values:
            return []
        query["$or"] = [
            {"prodi_id": {"$in": scope_values}},
            {"prodi_kode": {"$in": scope_values}},
            {"prodi_nama": {"$in": scope_values}},
        ]
    elif prodi_id:
        query["prodi_id"] = prodi_id
    items = await db.kurikulum.find(query, {"_id": 0}).to_list(None)
    if _is_scoped_program_manager(user):
        items = [
            item
            for item in items
            if record_matches_program_scope(
                item,
                scope_values,
                fields=("prodi_id", "prodi_kode", "prodi_nama"),
            )
        ]
    return items


@router.get("/progress")
async def get_curriculum_progress(
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    """Realtime-ready aggregate progress for curriculum and course lecturers."""
    programs = await db.programs.find(
        {"status": {"$ne": "deleted"}},
        {"_id": 0, "id": 1, "kode": 1, "code": 1, "nama": 1, "name": 1, "status": 1},
    ).to_list(None)
    curricula = await db.kurikulum.find(
        {"status": {"$ne": "deleted"}},
        {
            "_id": 0,
            "id": 1,
            "prodi_id": 1,
            "prodi_kode": 1,
            "prodi_nama": 1,
            "program_id": 1,
            "program_name": 1,
            "kode": 1,
            "nama": 1,
            "status": 1,
            "tahun_mulai": 1,
            "total_sks_lulus": 1,
            "created_at": 1,
            "updated_at": 1,
        },
    ).to_list(None)
    courses = await db.courses.find(
        {"status": {"$nin": ["deleted", "inactive", "retired"]}},
        {
            "_id": 0,
            "id": 1,
            "kurikulum_id": 1,
            "prodi_id": 1,
            "prodi_kode": 1,
            "prodi_nama": 1,
            "program_id": 1,
            "program_code": 1,
            "program_name": 1,
            "total_sks": 1,
            "sks": 1,
            "sks_teori": 1,
            "sks_praktikum": 1,
            "dosen_utama_id": 1,
            "dosen_utama_nama": 1,
            "dosen_anggota_ids": 1,
            "dosen_anggota_namas": 1,
            "created_at": 1,
            "updated_at": 1,
        },
    ).to_list(None)
    items = build_curriculum_progress(programs, curricula, courses)
    return {
        "generated_at": now_iso(),
        "summary": summarize_curriculum_progress(items),
        "items": items,
    }


@router.websocket("/progress/ws")
async def curriculum_progress_websocket(websocket: WebSocket):
    """Push a lightweight invalidation event after curriculum data changes."""
    db: PostgresDatabase = websocket.app.state.db
    user = await _user_from_token(db, websocket.query_params.get("token", ""))
    if not user or not user_is_admin_or_access_role(user, "academic_operator"):
        await websocket.close(code=1008)
        return

    await _progress_connections.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        _progress_connections.disconnect(websocket)
    except Exception:
        _progress_connections.disconnect(websocket)


@router.post("")
async def create_kurikulum(
    body: KurikulumInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    user: Dict = Depends(require_admin_or_kaprodi),
):
    """Buat Master Kurikulum Baru."""
    if await db.kurikulum.find_one({"kode": body.kode}, {"_id": 0}):
        raise HTTPException(status_code=409, detail=f"Kode kurikulum '{body.kode}' sudah ada")
    await _require_program_manager_scope(
        db,
        user,
        {"prodi_id": body.prodi_id},
        detail="Kaprodi hanya dapat membuat kurikulum pada prodi yang dipimpin",
    )
    
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
    await _progress_connections.publish()
    return doc


@router.put("/{kurikulum_id}")
async def update_kurikulum(
    kurikulum_id: str,
    body: KurikulumInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    user: Dict = Depends(require_admin_or_kaprodi),
):
    """Update Kurikulum Master."""
    ex = await db.kurikulum.find_one({"id": kurikulum_id}, {"_id": 0})
    if not ex:
        raise HTTPException(status_code=404, detail="Kurikulum tidak ditemukan")
    await _require_program_manager_scope(db, user, ex)
    await _require_program_manager_scope(
        db,
        user,
        {"prodi_id": body.prodi_id},
        detail="Kaprodi tidak dapat memindahkan kurikulum ke prodi lain",
    )
    
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
    await _progress_connections.publish()
    return {**ex, **updates}


@router.delete("/{kurikulum_id}")
async def delete_kurikulum(
    kurikulum_id: str,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    user: Dict = Depends(require_admin_or_kaprodi),
):
    """Nonaktifkan Kurikulum Master."""
    existing = await db.kurikulum.find_one({"id": kurikulum_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Kurikulum tidak ditemukan")
    await _require_program_manager_scope(db, user, existing)
    await db.kurikulum.update_one({"id": kurikulum_id}, {"$set": {"status": "inactive", "updated_at": now_iso()}})
    await _progress_connections.publish()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════
#  MATA KULIAH KURIKULUM & SKS BREAKDOWN
# ═══════════════════════════════════════════════════════════════

@router.get("/{kurikulum_id}/courses")
async def get_kurikulum_courses(
    kurikulum_id: str,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    user: Dict = Depends(get_current_user_with_roles),
):
    """Ambil semua MK dalam suatu Kurikulum."""
    kurikulum = await db.kurikulum.find_one({"id": kurikulum_id}, {"_id": 0})
    if not kurikulum:
        raise HTTPException(status_code=404, detail="Kurikulum tidak ditemukan")
    if _is_scoped_program_manager(user):
        await _require_program_manager_scope(db, user, kurikulum)
    elif _is_ordinary_lecturer(user):
        scope_values = await _lecturer_homebase_scope(db, user)
        if not record_matches_program_scope(
            kurikulum,
            scope_values,
            fields=("prodi_id", "prodi_kode", "prodi_nama"),
        ):
            raise HTTPException(status_code=404, detail="Kurikulum tidak ditemukan pada prodi homebase Anda")
    courses = await db.courses.find({"kurikulum_id": kurikulum_id}, {"_id": 0}).to_list(None)
    course_ids = [course.get("id") for course in courses if course.get("id")]
    linked_classes = await db.classes.find(
        {"course_id": {"$in": course_ids}, "status": {"$ne": "deleted"}},
        {"_id": 0, "course_id": 1},
    ).to_list(None) if course_ids else []
    linked_course_ids = {item.get("course_id") for item in linked_classes}
    return [
        {**course, "lifecycle_locked": course.get("id") in linked_course_ids}
        for course in courses
    ]


@router.post("/courses")
async def create_course_kurikulum(
    body: CourseKurikulumInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    user: Dict = Depends(require_admin_or_kaprodi),
):
    """Tambah Mata Kuliah baru ke Kurikulum dengan Rincian SKS & Dosen Pengampu."""
    kur = await db.kurikulum.find_one({"id": body.kurikulum_id}, {"_id": 0})
    if not kur:
        raise HTTPException(status_code=404, detail="Kurikulum tidak ditemukan")
    await _require_program_manager_scope(db, user, kur)
    if body.prodi_id:
        await _require_program_manager_scope(db, user, {"prodi_id": body.prodi_id})

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
        "status": "active",
        "created_at": now_iso(),
    }

    # Simpan di `courses`
    await db.courses.insert_one(doc)
    await _progress_connections.publish()
    return doc


@router.put("/courses/{course_id}")
async def update_course_kurikulum(
    course_id: str,
    body: CourseKurikulumInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    user: Dict = Depends(require_admin_or_kaprodi),
):
    """Update detail MK dan Beban SKS dalam Kurikulum."""
    ex = await db.courses.find_one({"id": course_id}, {"_id": 0})
    if not ex:
        raise HTTPException(status_code=404, detail="Mata Kuliah tidak ditemukan")
    await _require_program_manager_course_scope(db, user, ex)
    target_kurikulum = await db.kurikulum.find_one({"id": body.kurikulum_id}, {"_id": 0})
    if not target_kurikulum:
        raise HTTPException(status_code=404, detail="Kurikulum tidak ditemukan")
    await _require_program_manager_scope(db, user, target_kurikulum)
    if body.prodi_id:
        await _require_program_manager_scope(db, user, {"prodi_id": body.prodi_id})

    usage = await course_usage_summary(db, course_id)
    identity_changes = course_identity_changes(ex, body)
    if usage["locked"] and identity_changes:
        raise HTTPException(
            status_code=409,
            detail=course_identity_lock_detail(usage, identity_changes),
        )
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
    await _progress_connections.publish()
    return {**ex, **updates}


@router.post("/courses/{course_id}/retire")
async def retire_course_kurikulum(
    course_id: str,
    body: RetireCourseInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    user: Dict[str, Any] = Depends(require_admin_or_kaprodi),
):
    """Arsipkan MK tanpa menghapus histori akademiknya."""
    existing = await db.courses.find_one({"id": course_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Mata Kuliah tidak ditemukan")
    await _require_program_manager_course_scope(db, user, existing)
    if str(existing.get("status") or "active").lower() == "deleted":
        raise HTTPException(status_code=404, detail="Mata Kuliah sudah dihapus")

    replacement_id = str(body.replacement_course_id or "").strip()
    replacement = None
    if replacement_id:
        if replacement_id == course_id:
            raise HTTPException(status_code=400, detail="MK pengganti harus berbeda dari MK yang diarsipkan")
        replacement = await db.courses.find_one(
            {"id": replacement_id, "status": {"$nin": ["deleted", "inactive", "retired"]}},
            {"_id": 0},
        )
        if not replacement:
            raise HTTPException(status_code=404, detail="MK pengganti tidak ditemukan atau sudah tidak aktif")
        await _require_program_manager_course_scope(db, user, replacement)
        existing_program = str(existing.get("prodi_id") or existing.get("program_id") or "")
        replacement_program = str(replacement.get("prodi_id") or replacement.get("program_id") or "")
        if existing_program and replacement_program and existing_program != replacement_program:
            raise HTTPException(status_code=400, detail="MK pengganti harus berada pada prodi yang sama")

    usage = await course_usage_summary(db, course_id)
    now = now_iso()
    updates = {
        "status": "retired",
        "retired_at": now,
        "retired_by": user.get("id", ""),
        "retired_reason": body.reason.strip(),
        "retired_effective_from": body.effective_from or "",
        "replacement_course_id": replacement_id or None,
        "updated_at": now,
    }
    await db.courses.update_one({"id": course_id}, {"$set": updates})
    await _progress_connections.publish()
    return {
        "ok": True,
        "status": "retired",
        "course": {**existing, **updates},
        "usage": usage,
        "replacement_course": replacement,
        "message": "Mata kuliah diarsipkan. Histori kelas, KRS, dan nilai tetap dipertahankan.",
    }


@router.post("/courses/{course_id}/restore")
async def restore_course_kurikulum(
    course_id: str,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    user: Dict[str, Any] = Depends(require_admin_or_kaprodi),
):
    """Aktifkan kembali MK yang sebelumnya diarsipkan."""
    existing = await db.courses.find_one({"id": course_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Mata Kuliah tidak ditemukan")
    await _require_program_manager_course_scope(db, user, existing)
    if str(existing.get("status") or "active").lower() != "retired":
        raise HTTPException(status_code=409, detail="Mata Kuliah tidak berstatus diarsipkan")
    updates = {
        "status": "active",
        "restored_at": now_iso(),
        "restored_by": user.get("id", ""),
        "updated_at": now_iso(),
    }
    await db.courses.update_one(
        {"id": course_id},
        {
            "$set": updates,
            "$unset": {
                "retired_at": "",
                "retired_by": "",
                "retired_reason": "",
                "retired_effective_from": "",
            },
        },
    )
    await _progress_connections.publish()
    return {"ok": True, "status": "active", "course": {**existing, **updates}}


@router.delete("/courses/{course_id}")
async def delete_course_kurikulum(
    course_id: str,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    user: Dict = Depends(require_admin_or_kaprodi),
):
    """Kompatibilitas aman: endpoint hapus lama sekarang mengarsipkan MK."""
    existing = await db.courses.find_one({"id": course_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Mata Kuliah tidak ditemukan")
    await _require_program_manager_course_scope(db, user, existing)
    usage = await course_usage_summary(db, course_id)
    updates = {
        "status": "retired",
        "retired_at": now_iso(),
        "retired_by": user.get("id", ""),
        "retired_reason": "Diarsipkan melalui aksi kompatibilitas Hapus MK",
        "updated_at": now_iso(),
    }
    await db.courses.update_one({"id": course_id}, {"$set": updates})
    await _progress_connections.publish()
    return {
        "ok": True,
        "status": "retired",
        "usage": usage,
        "message": "Mata kuliah diarsipkan. Histori akademik tetap dipertahankan.",
    }


@router.post("/assign-dosen")
async def assign_dosen_mk(
    body: AssignDosenMKInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    user: Dict = Depends(require_admin_or_kaprodi),
):
    """Penugasan Dosen Pengampu Utama & Anggota (Team Teaching) ke Mata Kuliah."""
    ex = await db.courses.find_one({"id": body.course_id}, {"_id": 0})
    if not ex:
        raise HTTPException(status_code=404, detail="Mata Kuliah tidak ditemukan")
    await _require_program_manager_course_scope(db, user, ex)

    updates = {
        "dosen_utama_id": body.dosen_utama_id,
        "dosen_utama_nama": body.dosen_utama_nama,
        "dosen_anggota_ids": body.dosen_anggota_ids,
        "dosen_anggota_namas": body.dosen_anggota_namas,
        "updated_at": now_iso(),
    }
    await db.courses.update_one({"id": body.course_id}, {"$set": updates})
    await _progress_connections.publish()
    return {"ok": True, "message": "Penugasan Dosen Pengampu berhasil disimpan"}
