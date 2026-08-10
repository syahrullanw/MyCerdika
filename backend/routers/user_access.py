"""Router FastAPI untuk Manajemen Hak Akses User (Custom & Template)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from uuid import uuid4
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel, Field

from postgres_database import PostgresDatabase


router = APIRouter(prefix="/api/v1/user-access", tags=["Manajemen Hak Akses User"])


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid4())


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
    if user.get("status", "active") != "active":
        raise HTTPException(status_code=403, detail="Akun tidak aktif")
    request.state.current_user = user
    return user


async def require_admin(request: Request) -> Dict[str, Any]:
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Akses khusus Administrator")
    return user


# ─── MODUL SISTEM & AKSI ──────────────────────────────────────────────────────

SYSTEM_MODULES = [
    {
        "key": "dashboard",
        "name": "Dashboard & Ringkasan",
        "category": "Utama",
        "description": "Akses ke statistik dashboard dan aktivitas umum sistem"
    },
    {
        "key": "materials",
        "name": "Materi & Diskusi Pembelajaran",
        "category": "Pembelajaran",
        "description": "Kelola materi perkuliahan, modul, dan forum diskusi"
    },
    {
        "key": "assignments",
        "name": "Tugas & Kuis",
        "category": "Pembelajaran",
        "description": "Kelola tugas kuliah, pengumpulan mahasiswa, dan kuis online"
    },
    {
        "key": "rps",
        "name": "RPS (Rencana Pembelajaran)",
        "category": "Pembelajaran",
        "description": "Kelola RPS 16 Sesi perkuliahan"
    },
    {
        "key": "attendance",
        "name": "Presensi & Kehadiran",
        "category": "Pembelajaran",
        "description": "Kelola absensi mahasiswa dan rekap kehadiran"
    },
    {
        "key": "grading",
        "name": "Penilaian & Bobot Nilai",
        "category": "Evaluasi",
        "description": "Input nilai mahasiswa, bobot komponen, dan predikat"
    },
    {
        "key": "rekap_nilai",
        "name": "Rekap Nilai & Laporan BKD",
        "category": "Evaluasi",
        "description": "Cetak rekapitulasi nilai dan laporan kinerja dosen"
    },
    {
        "key": "krs_khs",
        "name": "Perwalian KRS & KHS",
        "category": "SIAKAD",
        "description": "Persetujuan KRS mahasiswa, cetak KHS, dan transkrip nilai"
    },
    {
        "key": "keuangan",
        "name": "Keuangan Kampus",
        "category": "SIAKAD",
        "description": "Kelola tagihan, pembayaran perkuliahan, dan dispensasi"
    },
    {
        "key": "data_master",
        "name": "Data Master Akademik",
        "category": "Data Master",
        "description": "Kelola Data Fakultas, Prodi, Kurikulum, Mata Kuliah, Gedung & Ruangan"
    },
    {
        "key": "user_management",
        "name": "Manajemen Pengguna",
        "category": "Data Master",
        "description": "Kelola data Dosen, Mahasiswa, dan Assign Dosen Wali"
    },
    {
        "key": "konfigurasi",
        "name": "Setup & Konfigurasi Akademik",
        "category": "Data Master",
        "description": "Setup Semester Baru, Tahun Ajaran, dan Konfigurasi Kampus"
    },
    {
        "key": "feeder",
        "name": "PDDikti Feeder",
        "category": "Sistem & Integrasi",
        "description": "Sinkronisasi data kampus dengan PDDikti Kemdikbud"
    },
    {
        "key": "system_settings",
        "name": "Pengaturan Sistem & Log",
        "category": "Sistem & Integrasi",
        "description": "Pengaturan aplikasi, SSO, backup database, dan log akses"
    }
]

ACTIONS = [
    {"key": "view", "label": "Lihat / Baca"},
    {"key": "create", "label": "Tambah / Buat"},
    {"key": "edit", "label": "Ubah / Edit"},
    {"key": "delete", "label": "Hapus"},
    {"key": "export", "label": "Export / Cetak"}
]


def default_permission_matrix(full_access: bool = False) -> Dict[str, Dict[str, bool]]:
    matrix = {}
    for mod in SYSTEM_MODULES:
        matrix[mod["key"]] = {
            "view": full_access,
            "create": full_access,
            "edit": full_access,
            "delete": full_access,
            "export": full_access,
        }
    return matrix


# ─── SEED DEFAULT TEMPLATES ─────────────────────────────────────────────────

DEFAULT_TEMPLATES = [
    {
        "id": "tpl_admin",
        "name": "Administrator (Full Access)",
        "description": "Akses penuh ke seluruh modul dan fungsi sistem",
        "role_target": "admin",
        "is_default": True,
        "permissions": default_permission_matrix(full_access=True)
    },
    {
        "id": "tpl_dosen",
        "name": "Dosen Pengampu",
        "description": "Akses standar dosen untuk pembelajaran, RPS, presensi, penilaian, dan perwalian KRS",
        "role_target": "lecturer",
        "is_default": True,
        "permissions": {
            "dashboard": {"view": True, "create": False, "edit": False, "delete": False, "export": False},
            "materials": {"view": True, "create": True, "edit": True, "delete": True, "export": True},
            "assignments": {"view": True, "create": True, "edit": True, "delete": True, "export": True},
            "rps": {"view": True, "create": True, "edit": True, "delete": False, "export": True},
            "attendance": {"view": True, "create": True, "edit": True, "delete": False, "export": True},
            "grading": {"view": True, "create": True, "edit": True, "delete": False, "export": True},
            "rekap_nilai": {"view": True, "create": False, "edit": False, "delete": False, "export": True},
            "krs_khs": {"view": True, "create": False, "edit": True, "delete": False, "export": True},
            "keuangan": {"view": False, "create": False, "edit": False, "delete": False, "export": False},
            "data_master": {"view": True, "create": False, "edit": False, "delete": False, "export": False},
            "user_management": {"view": True, "create": False, "edit": False, "delete": False, "export": False},
            "konfigurasi": {"view": False, "create": False, "edit": False, "delete": False, "export": False},
            "feeder": {"view": False, "create": False, "edit": False, "delete": False, "export": False},
            "system_settings": {"view": False, "create": False, "edit": False, "delete": False, "export": False},
        }
    },
    {
        "id": "tpl_mahasiswa",
        "name": "Mahasiswa",
        "description": "Akses akademik perkuliahan, tugas, KRS, KHS, dan pembayaran tagihan",
        "role_target": "student",
        "is_default": True,
        "permissions": {
            "dashboard": {"view": True, "create": False, "edit": False, "delete": False, "export": False},
            "materials": {"view": True, "create": False, "edit": False, "delete": False, "export": False},
            "assignments": {"view": True, "create": True, "edit": False, "delete": False, "export": False},
            "rps": {"view": True, "create": False, "edit": False, "delete": False, "export": False},
            "attendance": {"view": True, "create": False, "edit": False, "delete": False, "export": False},
            "grading": {"view": True, "create": False, "edit": False, "delete": False, "export": True},
            "rekap_nilai": {"view": False, "create": False, "edit": False, "delete": False, "export": False},
            "krs_khs": {"view": True, "create": True, "edit": True, "delete": False, "export": True},
            "keuangan": {"view": True, "create": False, "edit": False, "delete": False, "export": True},
            "data_master": {"view": False, "create": False, "edit": False, "delete": False, "export": False},
            "user_management": {"view": False, "create": False, "edit": False, "delete": False, "export": False},
            "konfigurasi": {"view": False, "create": False, "edit": False, "delete": False, "export": False},
            "feeder": {"view": False, "create": False, "edit": False, "delete": False, "export": False},
            "system_settings": {"view": False, "create": False, "edit": False, "delete": False, "export": False},
        }
    },
    {
        "id": "tpl_kaprodi",
        "name": "Kaprodi (Ketua Program Studi)",
        "description": "Akses khusus pengawasan kurikulum, dosen wali, dan rekap akademis prodi",
        "role_target": "lecturer",
        "is_default": True,
        "permissions": {
            "dashboard": {"view": True, "create": False, "edit": False, "delete": False, "export": True},
            "materials": {"view": True, "create": True, "edit": True, "delete": True, "export": True},
            "assignments": {"view": True, "create": True, "edit": True, "delete": True, "export": True},
            "rps": {"view": True, "create": True, "edit": True, "delete": True, "export": True},
            "attendance": {"view": True, "create": True, "edit": True, "delete": False, "export": True},
            "grading": {"view": True, "create": True, "edit": True, "delete": False, "export": True},
            "rekap_nilai": {"view": True, "create": False, "edit": False, "delete": False, "export": True},
            "krs_khs": {"view": True, "create": True, "edit": True, "delete": False, "export": True},
            "keuangan": {"view": True, "create": False, "edit": False, "delete": False, "export": False},
            "data_master": {"view": True, "create": True, "edit": True, "delete": False, "export": True},
            "user_management": {"view": True, "create": True, "edit": True, "delete": False, "export": True},
            "konfigurasi": {"view": True, "create": False, "edit": False, "delete": False, "export": False},
            "feeder": {"view": True, "create": False, "edit": False, "delete": False, "export": False},
            "system_settings": {"view": False, "create": False, "edit": False, "delete": False, "export": False},
        }
    },
    {
        "id": "tpl_keuangan",
        "name": "Staf Keuangan",
        "description": "Pengelolaan penuh tagihan, verifikasi pembayaran, dan laporan keuangan",
        "role_target": "admin",
        "is_default": True,
        "permissions": {
            "dashboard": {"view": True, "create": False, "edit": False, "delete": False, "export": True},
            "materials": {"view": False, "create": False, "edit": False, "delete": False, "export": False},
            "assignments": {"view": False, "create": False, "edit": False, "delete": False, "export": False},
            "rps": {"view": False, "create": False, "edit": False, "delete": False, "export": False},
            "attendance": {"view": False, "create": False, "edit": False, "delete": False, "export": False},
            "grading": {"view": False, "create": False, "edit": False, "delete": False, "export": False},
            "rekap_nilai": {"view": False, "create": False, "edit": False, "delete": False, "export": False},
            "krs_khs": {"view": True, "create": False, "edit": False, "delete": False, "export": True},
            "keuangan": {"view": True, "create": True, "edit": True, "delete": True, "export": True},
            "data_master": {"view": True, "create": False, "edit": False, "delete": False, "export": False},
            "user_management": {"view": True, "create": False, "edit": False, "delete": False, "export": True},
            "konfigurasi": {"view": False, "create": False, "edit": False, "delete": False, "export": False},
            "feeder": {"view": False, "create": False, "edit": False, "delete": False, "export": False},
            "system_settings": {"view": False, "create": False, "edit": False, "delete": False, "export": False},
        }
    }
]


async def ensure_seed_templates(db: PostgresDatabase):
    count = await db.access_templates.count_documents({})
    if count == 0:
        for tpl in DEFAULT_TEMPLATES:
            doc = {**tpl, "created_at": now_iso(), "updated_at": now_iso()}
            await db.access_templates.insert_one(doc)


# ─── MODELS ──────────────────────────────────────────────────────────────────

class TemplateCreatePayload(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = ""
    role_target: str = "all"  # admin | lecturer | student | all
    permissions: Dict[str, Dict[str, bool]]


class RolePermissionSavePayload(BaseModel):
    permissions: Dict[str, Dict[str, bool]]


class UserPermissionSavePayload(BaseModel):
    mode: str = "template"  # "template" | "custom"
    template_id: Optional[str] = None
    custom_permissions: Optional[Dict[str, Dict[str, bool]]] = None


class BulkAssignPayload(BaseModel):
    user_ids: List[str]
    template_id: str


# ─── ENDPOINTS ───────────────────────────────────────────────────────────────

@router.get("/modules")
async def get_modules(user: Dict[str, Any] = Depends(get_current_user)):
    """Mengambil daftar modul sistem dan daftar aksi."""
    return {
        "modules": SYSTEM_MODULES,
        "actions": ACTIONS
    }


@router.get("/roles")
async def get_role_permissions(
    db: PostgresDatabase = Depends(get_db),
    user: Dict[str, Any] = Depends(require_admin)
):
    """Mengambil daftar role dan matriks hak akses masing-masing role."""
    await ensure_seed_templates(db)
    
    roles_info = [
        {"role": "lecturer", "name": "Dosen Pengampu", "template_id": "tpl_dosen"},
        {"role": "student", "name": "Mahasiswa", "template_id": "tpl_mahasiswa"},
        {"role": "admin", "name": "Administrator", "template_id": "tpl_admin"}
    ]

    result = []
    for r in roles_info:
        r_code = r["role"]
        count = await db.users.count_documents({"role": r_code})
        
        role_doc = await db.role_permissions.find_one({"role": r_code}, {"_id": 0})
        if not role_doc:
            tpl_doc = await db.access_templates.find_one({"id": r["template_id"]}, {"_id": 0})
            perms = tpl_doc.get("permissions") if tpl_doc else default_permission_matrix(r_code == "admin")
        else:
            perms = role_doc.get("permissions")

        result.append({
            "role": r_code,
            "name": r["name"],
            "user_count": count,
            "permissions": perms
        })

    return result


@router.post("/roles/{role_name}")
async def save_role_permissions(
    role_name: str,
    body: RolePermissionSavePayload,
    db: PostgresDatabase = Depends(get_db),
    user: Dict[str, Any] = Depends(require_admin)
):
    """Menyimpan konfigurasi hak akses modul untuk seluruh pengguna dengan role tertentu."""
    if role_name not in {"admin", "lecturer", "student"}:
        raise HTTPException(status_code=400, detail="Role tidak valid")

    existing = await db.role_permissions.find_one({"role": role_name}, {"_id": 0})
    doc = {
        "role": role_name,
        "permissions": body.permissions,
        "updated_at": now_iso()
    }
    if existing:
        await db.role_permissions.update_one({"role": role_name}, {"$set": doc})
    else:
        doc["created_at"] = now_iso()
        await db.role_permissions.insert_one(doc)

    role_tpl_map = {
        "admin": "tpl_admin",
        "lecturer": "tpl_dosen",
        "student": "tpl_mahasiswa"
    }
    tpl_id = role_tpl_map.get(role_name)
    if tpl_id:
        await db.access_templates.update_one(
            {"id": tpl_id},
            {"$set": {"permissions": body.permissions, "updated_at": now_iso()}}
        )

    return {"message": f"Hak akses modul untuk role '{role_name}' berhasil diperbarui"}


@router.get("/templates")
async def get_templates(
    db: PostgresDatabase = Depends(get_db),
    user: Dict[str, Any] = Depends(require_admin)
):
    """Mengambil daftar templat hak akses."""
    await ensure_seed_templates(db)
    templates = await db.access_templates.find({}, {"_id": 0}).to_list(None)

    # Hitung jumlah user per templat
    user_perms = await db.user_permissions.find({"mode": "template"}, {"_id": 0}).to_list(None)
    counts: Dict[str, int] = {}
    for p in user_perms:
        tid = p.get("template_id")
        if tid:
            counts[tid] = counts.get(tid, 0) + 1

    for tpl in templates:
        tpl["user_count"] = counts.get(tpl["id"], 0)

    return templates


@router.post("/templates")
async def create_template(
    body: TemplateCreatePayload,
    db: PostgresDatabase = Depends(get_db),
    user: Dict[str, Any] = Depends(require_admin)
):
    """Membuat templat hak akses baru."""
    await ensure_seed_templates(db)
    new_tpl_id = f"tpl_{new_id()[:8]}"
    doc = {
        "id": new_tpl_id,
        "name": body.name,
        "description": body.description or "",
        "role_target": body.role_target,
        "is_default": False,
        "permissions": body.permissions,
        "created_at": now_iso(),
        "updated_at": now_iso()
    }
    await db.access_templates.insert_one(doc)
    return {"message": "Templat hak akses berhasil dibuat", "data": doc}


@router.put("/templates/{template_id}")
async def update_template(
    template_id: str,
    body: TemplateCreatePayload,
    db: PostgresDatabase = Depends(get_db),
    user: Dict[str, Any] = Depends(require_admin)
):
    """Memperbarui templat hak akses."""
    ex = await db.access_templates.find_one({"id": template_id}, {"_id": 0})
    if not ex:
        raise HTTPException(status_code=404, detail="Templat tidak ditemukan")

    updates = {
        "name": body.name,
        "description": body.description or "",
        "role_target": body.role_target,
        "permissions": body.permissions,
        "updated_at": now_iso()
    }
    await db.access_templates.update_one({"id": template_id}, {"$set": updates})
    return {"message": "Templat hak akses berhasil diperbarui"}


@router.delete("/templates/{template_id}")
async def delete_template(
    template_id: str,
    db: PostgresDatabase = Depends(get_db),
    user: Dict[str, Any] = Depends(require_admin)
):
    """Menghapus templat hak akses custom."""
    ex = await db.access_templates.find_one({"id": template_id}, {"_id": 0})
    if not ex:
        raise HTTPException(status_code=404, detail="Templat tidak ditemukan")
    if ex.get("is_default"):
        raise HTTPException(status_code=400, detail="Templat sistem bawaan (default) tidak dapat dihapus")

    await db.access_templates.delete_one({"id": template_id})

    # Kembalikan user yang terpengaruh ke templat default role mereka
    await db.user_permissions.update_many(
        {"template_id": template_id},
        {"$set": {"mode": "template", "template_id": None, "updated_at": now_iso()}}
    )
    return {"message": "Templat berhasil dihapus"}


@router.get("/users")
async def list_user_access(
    role: Optional[str] = Query(None, description="Filter role: admin, lecturer, student"),
    search: Optional[str] = Query(None, description="Cari nama, email, NIM, atau NIDN"),
    page: int = 1,
    limit: int = 50,
    db: PostgresDatabase = Depends(get_db),
    user: Dict[str, Any] = Depends(require_admin)
):
    """Mengambil daftar pengguna beserta status templat/custom hak akses mereka."""
    await ensure_seed_templates(db)
    
    query: Dict[str, Any] = {}
    if role and role != "all":
        query["role"] = role

    if search:
        s = search.strip()
        query["$or"] = [
            {"name": {"$regex": s, "$options": "i"}},
            {"email": {"$regex": s, "$options": "i"}},
            {"nim": {"$regex": s, "$options": "i"}},
            {"nidn": {"$regex": s, "$options": "i"}},
        ]

    total = await db.users.count_documents(query)
    skip = (page - 1) * limit
    
    users = await db.users.find(query, {"_id": 0, "password_hash": 0}).skip(skip).limit(limit).to_list(None)
    
    templates = await db.access_templates.find({}, {"_id": 0}).to_list(None)
    tpl_map = {t["id"]: t for t in templates}
    
    # Ambil default template fallback per role
    role_default_map = {
        "admin": "tpl_admin",
        "lecturer": "tpl_dosen",
        "student": "tpl_mahasiswa"
    }

    user_ids = [u["id"] for u in users if "id" in u]
    perm_docs = await db.user_permissions.find({"user_id": {"$in": user_ids}}, {"_id": 0}).to_list(None)
    perm_map = {p["user_id"]: p for p in perm_docs}

    result = []
    for u in users:
        uid = u.get("id")
        urole = u.get("role", "student")
        p_setting = perm_map.get(uid, {})

        mode = p_setting.get("mode", "template")
        template_id = p_setting.get("template_id") or role_default_map.get(urole, "tpl_mahasiswa")
        
        tpl_info = tpl_map.get(template_id) or tpl_map.get(role_default_map.get(urole, "tpl_mahasiswa"))
        
        result.append({
            "id": uid,
            "name": u.get("name") or u.get("full_name") or "User",
            "email": u.get("email", ""),
            "role": urole,
            "nim": u.get("nim"),
            "nidn": u.get("nidn"),
            "status": u.get("status", "active"),
            "access_mode": mode,
            "template_id": template_id,
            "template_name": tpl_info.get("name") if tpl_info else "Templat Default",
            "has_custom": mode == "custom"
        })

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "data": result
    }


@router.get("/users/{user_id}")
async def get_user_access_detail(
    user_id: str,
    db: PostgresDatabase = Depends(get_db),
    user: Dict[str, Any] = Depends(require_admin)
):
    """Mengambil detail matriks akses user (efektif, templat, dan custom overrides)."""
    await ensure_seed_templates(db)
    
    target_user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")

    urole = target_user.get("role", "student")
    role_default_map = {
        "admin": "tpl_admin",
        "lecturer": "tpl_dosen",
        "student": "tpl_mahasiswa"
    }

    templates = await db.access_templates.find({}, {"_id": 0}).to_list(None)
    tpl_map = {t["id"]: t for t in templates}

    p_setting = await db.user_permissions.find_one({"user_id": user_id}, {"_id": 0}) or {}
    
    mode = p_setting.get("mode", "template")
    template_id = p_setting.get("template_id") or role_default_map.get(urole, "tpl_mahasiswa")
    
    base_tpl = tpl_map.get(template_id) or tpl_map.get(role_default_map.get(urole, "tpl_mahasiswa"))
    base_permissions = base_tpl.get("permissions", default_permission_matrix(full_access=(urole == "admin")))

    custom_permissions = p_setting.get("custom_permissions") or base_permissions

    effective_permissions = custom_permissions if mode == "custom" else base_permissions

    return {
        "user": {
            "id": target_user.get("id"),
            "name": target_user.get("name") or target_user.get("full_name") or "User",
            "email": target_user.get("email"),
            "role": urole,
            "nim": target_user.get("nim"),
            "nidn": target_user.get("nidn")
        },
        "access_mode": mode,
        "template_id": template_id,
        "template_name": base_tpl.get("name") if base_tpl else "Templat Default",
        "base_permissions": base_permissions,
        "custom_permissions": custom_permissions,
        "effective_permissions": effective_permissions
    }


@router.post("/users/{user_id}/permissions")
async def save_user_permissions(
    user_id: str,
    body: UserPermissionSavePayload,
    db: PostgresDatabase = Depends(get_db),
    user: Dict[str, Any] = Depends(require_admin)
):
    """Menyimpan konfigurasi hak akses user (Mode Template / Custom Overrides)."""
    target_user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")

    existing = await db.user_permissions.find_one({"user_id": user_id}, {"_id": 0})
    doc = {
        "user_id": user_id,
        "mode": body.mode,
        "template_id": body.template_id,
        "custom_permissions": body.custom_permissions or {},
        "updated_at": now_iso()
    }

    if existing:
        await db.user_permissions.update_one({"user_id": user_id}, {"$set": doc})
    else:
        doc["id"] = new_id()
        doc["created_at"] = now_iso()
        await db.user_permissions.insert_one(doc)

    return {"message": "Hak akses pengguna berhasil diperbarui"}


@router.post("/bulk-assign")
async def bulk_assign_template(
    body: BulkAssignPayload,
    db: PostgresDatabase = Depends(get_db),
    user: Dict[str, Any] = Depends(require_admin)
):
    """Menetapkan templat hak akses secara massal ke banyak pengguna sekaligus."""
    if not body.user_ids:
        raise HTTPException(status_code=400, detail="Pilih minimal 1 user")

    tpl = await db.access_templates.find_one({"id": body.template_id}, {"_id": 0})
    if not tpl:
        raise HTTPException(status_code=404, detail="Templat hak akses tidak ditemukan")

    for uid in body.user_ids:
        existing = await db.user_permissions.find_one({"user_id": uid}, {"_id": 0})
        doc = {
            "user_id": uid,
            "mode": "template",
            "template_id": body.template_id,
            "updated_at": now_iso()
        }
        if existing:
            await db.user_permissions.update_one({"user_id": uid}, {"$set": doc})
        else:
            doc["id"] = new_id()
            doc["created_at"] = now_iso()
            await db.user_permissions.insert_one(doc)

    return {"message": f"Templat '{tpl['name']}' berhasil diterapkan ke {len(body.user_ids)} pengguna"}
