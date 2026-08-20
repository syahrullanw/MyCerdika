"""Router FastAPI untuk Manajemen Hak Akses User (Custom & Template)."""

from __future__ import annotations

import re
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

# Katalog ini mengikuti menu yang benar-benar tersedia pada SIAKAD baru. Modul
# lama yang terlalu umum (mis. ``data_master``) dipecah agar admin dapat memberi
# akses secara lebih presisi tanpa harus membuka seluruh area data master.
SYSTEM_MODULES = [
    {
        "key": "dashboard",
        "name": "Dashboard & Ringkasan",
        "category": "Utama",
        "description": "Statistik, aktivitas, dan ringkasan pekerjaan akademik.",
    },
    {
        "key": "materials",
        "name": "Materi & Diskusi Pembelajaran",
        "category": "Pembelajaran",
        "description": "Materi kuliah, file modul, dan forum diskusi kelas.",
    },
    {
        "key": "assignments",
        "name": "Tugas & Kuis",
        "category": "Pembelajaran",
        "description": "Tugas, kuis, pengumpulan, dan penilaian aktivitas kelas.",
    },
    {
        "key": "rps",
        "name": "RPS & Pertemuan",
        "category": "Pembelajaran",
        "description": "RPS 16 pertemuan, capaian pembelajaran, dan rencana sesi.",
    },
    {
        "key": "analisis_rps_prodi",
        "name": "Analisis & Approval RPS Prodi",
        "category": "Mutu Akademik Prodi",
        "description": "Analisis kelengkapan RPS seluruh mata kuliah Prodi dan persetujuan Kaprodi.",
    },
    {
        "key": "attendance",
        "name": "Presensi & Kehadiran",
        "category": "Pembelajaran",
        "description": "Presensi mahasiswa dan rekap kehadiran perkuliahan.",
    },
    {
        "key": "grading",
        "name": "Penilaian, Bobot & Predikat",
        "category": "Evaluasi",
        "description": "Input nilai, komponen bobot, serta predikat nilai.",
    },
    {
        "key": "rekap_nilai",
        "name": "Rekap Nilai, Laporan & BKD",
        "category": "Evaluasi",
        "description": "Rekap nilai, laporan akademik, BKD, dan portofolio dosen.",
    },
    {
        "key": "progres_nilai_prodi",
        "name": "Progres Nilai Prodi",
        "category": "Mutu Akademik Prodi",
        "description": "Monitoring progres input dan finalisasi nilai seluruh kelas dalam Prodi.",
    },
    {
        "key": "analisis_mahasiswa_prodi",
        "name": "Analisis Mahasiswa Prodi",
        "category": "Mutu Akademik Prodi",
        "description": "Analisis kehadiran, nilai, tugas, aktivitas, dan risiko akademik mahasiswa Prodi.",
    },
    {
        "key": "krs_khs",
        "name": "KRS, Perwalian & KHS",
        "category": "SIAKAD",
        "description": "Pengisian dan persetujuan KRS, KHS, serta transkrip mahasiswa.",
    },
    {
        "key": "keuangan",
        "name": "Keuangan, UKT & BIPOT",
        "category": "SIAKAD",
        "description": "Komponen BIPOT, skema UKT, tagihan, pembayaran, dan verifikasi.",
    },
    {
        "key": "pmb",
        "name": "PMB (Penerimaan Mahasiswa Baru)",
        "category": "SIAKAD",
        "description": "Pendaftaran, seleksi, registrasi ulang, dan konversi calon mahasiswa.",
    },
    {
        "key": "academic_setup",
        "name": "Konfigurasi & Periode Akademik",
        "category": "Data Master Akademik",
        "description": "Konfigurasi akademik, setup semester, dan tahun ajaran.",
    },
    {
        "key": "academic_calendar",
        "name": "Kalender Akademik",
        "category": "Data Master Akademik",
        "description": "Kalender kegiatan institusi, publikasi agenda, dan pengaturan tenggat akademik.",
    },
    {
        "key": "academic_structure",
        "name": "Struktur Akademik",
        "category": "Data Master Akademik",
        "description": "Data fakultas dan program studi beserta status aktifnya.",
    },
    {
        "key": "curriculum_schedule",
        "name": "Kurikulum, Mata Kuliah & Jadwal",
        "category": "Data Master Akademik",
        "description": "Kurikulum, dosen pengampu mata kuliah, dan jadwal mengajar.",
    },
    {
        "key": "facilities",
        "name": "Gedung & Ruangan",
        "category": "Data Master Akademik",
        "description": "Master gedung, ruangan, dan kapasitas sarana perkuliahan.",
    },
    {
        "key": "sk_mengajar",
        "name": "SK Mengajar Dosen",
        "category": "Data Master Akademik",
        "description": "Pembuatan, pengelolaan, finalisasi, dan cetak SK Mengajar Dosen.",
    },
    {
        "key": "sk_jabatan",
        "name": "SK Jabatan Akademik Dosen",
        "category": "Data Master Akademik",
        "description": "Penetapan dan persuratan jabatan akademik fungsional dosen.",
    },
    {
        "key": "student_records",
        "name": "Data Mahasiswa",
        "category": "Data Sivitas",
        "description": "Biodata, status studi, detail akademik, dan dokumen mahasiswa.",
    },
    {
        "key": "lecturer_records",
        "name": "Data Dosen & Jabatan Akademik",
        "category": "Data Sivitas",
        "description": "Biodata dosen, NIDN/NUPTK, dan jabatan akademik.",
    },
    {
        "key": "academic_advising",
        "name": "Penempatan & Dosen Wali",
        "category": "Data Sivitas",
        "description": "Penempatan mahasiswa ke prodi/kelas dan penugasan dosen wali.",
    },
    {
        "key": "access_control",
        "name": "Hak Akses User",
        "category": "Sistem & Integrasi",
        "description": "Role, templat, dan pengecualian hak akses per pengguna.",
    },
    {
        "key": "campus_settings",
        "name": "Pengaturan Kampus",
        "category": "Sistem & Integrasi",
        "description": "Identitas kampus, pengaturan aplikasi, dan preferensi operasional.",
    },
    {
        "key": "integration_api",
        "name": "Integrasi API",
        "category": "Sistem & Integrasi",
        "description": "Konfigurasi koneksi dan layanan API eksternal kampus.",
    },
    {
        "key": "feeder",
        "name": "PDDikti Feeder",
        "category": "Sistem & Integrasi",
        "description": "Koneksi, sinkronisasi, dan migrasi data ke PDDikti Neo Feeder.",
    },
    {
        "key": "sso",
        "name": "Login SSO",
        "category": "Sistem & Integrasi",
        "description": "Single Sign-On dan pengaturan autentikasi institusi.",
    },
    {
        "key": "cloud_storage",
        "name": "Google Drive",
        "category": "Sistem & Integrasi",
        "description": "Koneksi penyimpanan dokumen Google Drive.",
    },
    {
        "key": "whatsapp",
        "name": "WhatsApp",
        "category": "Sistem & Integrasi",
        "description": "Konfigurasi notifikasi dan pesan WhatsApp kampus.",
    },
    {
        "key": "email",
        "name": "Email",
        "category": "Sistem & Integrasi",
        "description": "Konfigurasi pengiriman email dan notifikasi sistem.",
    },
    {
        "key": "old_siakad_migration",
        "name": "Migrasi OLD-SIAKAD",
        "category": "Pemeliharaan",
        "description": "Preview dan impor inkremental data dari sistem SIAKAD lama.",
    },
    {
        "key": "database_backup",
        "name": "Backup Database",
        "category": "Pemeliharaan",
        "description": "Pembuatan, pemulihan, dan pemantauan cadangan data sistem.",
    },
    {
        "key": "data_maintenance",
        "name": "Pemeliharaan & Bersihkan Data",
        "category": "Pemeliharaan",
        "description": "Audit, pembersihan data, dan pemeliharaan operasional sistem.",
    },
]

ACTIONS = [
    {"key": "view", "label": "Lihat / Baca"},
    {"key": "create", "label": "Tambah / Buat"},
    {"key": "edit", "label": "Ubah / Edit"},
    {"key": "delete", "label": "Hapus"},
    {"key": "export", "label": "Export / Cetak"}
]

ACTION_KEYS = tuple(action["key"] for action in ACTIONS)
SYSTEM_MODULE_KEYS = {module["key"] for module in SYSTEM_MODULES}

# ``role`` identifies the user's primary persona. Operational duties such as
# finance and academic administration are intentionally kept in
# ``access_roles``/templates so a staff member never needs administrator
# privileges merely to do their day-to-day work.
BASE_ROLE_LABELS = {
    "admin": "Administrator",
    "lecturer": "Dosen",
    "student": "Mahasiswa",
    "staff": "Tendik",
}
BASE_ROLE_ALIASES = {
    "administrator": "admin",
    "dosen": "lecturer",
    "mahasiswa": "student",
    "staf": "staff",
    "tendik": "staff",
    "pegawai": "staff",
}


def normalize_base_role(role: Optional[str]) -> str:
    normalized = str(role or "").strip().lower()
    return BASE_ROLE_ALIASES.get(normalized, normalized or "staff")


def user_has_access_role(user: Dict[str, Any], access_role: str) -> bool:
    return access_role in (user.get("access_roles") or [])


def user_is_program_manager(user: Dict[str, Any]) -> bool:
    """Resolve Kaprodi/Sekprodi without reviving stale legacy position text."""
    derived_roles = user.get("access_roles")
    if isinstance(derived_roles, list):
        normalized_roles = {
            str(role or "").strip().lower() for role in derived_roles
        }
        return bool({"kaprodi", "sekprodi"}.intersection(normalized_roles))

    designation = " ".join(
        str(user.get(field) or "").strip().lower()
        for field in ("jabatan_akademik", "tugas_tambahan", "jabatan")
    )
    return bool(
        user.get("is_kaprodi") is True
        or str(user.get("is_kaprodi") or "").lower() == "true"
        or user.get("kaprodi_prodi_id")
        or "kaprodi" in designation
        or "ketua prodi" in designation
        or "ketua program studi" in designation
        or "sekprodi" in designation
        or "sekretaris prodi" in designation
    )


def user_is_admin_or_access_role(user: Dict[str, Any], *access_roles: str) -> bool:
    return normalize_base_role(user.get("role")) == "admin" or any(
        user_has_access_role(user, access_role) for access_role in access_roles
    )

# Jalur migrasi hak akses dari katalog versi sebelumnya. Nilai pada modul lama
# diterapkan pada modul turunan hanya bila modul turunan belum memiliki nilai
# eksplisit. Dengan begitu data akses tersimpan tidak mendadak hilang atau
# berubah menjadi tertutup setelah katalog diperbarui.
LEGACY_MODULE_EXPANSIONS = {
    "data_master": {
        "academic_structure",
        "curriculum_schedule",
        "facilities",
        "sk_mengajar",
        "sk_jabatan",
    },
    "user_management": {
        "student_records",
        "lecturer_records",
        "academic_advising",
    },
    "konfigurasi": {"academic_setup", "academic_calendar"},
    "system_settings": {
        "access_control",
        "campus_settings",
        "integration_api",
        "sso",
        "cloud_storage",
        "whatsapp",
        "email",
        "old_siakad_migration",
        "database_backup",
        "data_maintenance",
    },
    # Persisted matrices from before the SK modules were split.
    "academic_documents": {"sk_mengajar", "sk_jabatan"},
}


def _permission_actions(enabled: bool = False) -> Dict[str, bool]:
    return {action_key: enabled for action_key in ACTION_KEYS}


def default_permission_matrix(full_access: bool = False) -> Dict[str, Dict[str, bool]]:
    return {module["key"]: _permission_actions(full_access) for module in SYSTEM_MODULES}


def _matrix_from_grants(grants: Dict[str, set[str]]) -> Dict[str, Dict[str, bool]]:
    matrix = default_permission_matrix()
    for module_key, allowed_actions in grants.items():
        if module_key in SYSTEM_MODULE_KEYS:
            matrix[module_key] = {
                action_key: action_key in allowed_actions for action_key in ACTION_KEYS
            }
    return matrix


def role_default_permission_matrix(role: str) -> Dict[str, Dict[str, bool]]:
    """Default least-privilege matrix for each base login persona."""
    role = normalize_base_role(role)
    if role == "admin":
        return default_permission_matrix(full_access=True)

    if role == "lecturer":
        return _matrix_from_grants({
            "dashboard": {"view"},
            "materials": set(ACTION_KEYS),
            "assignments": set(ACTION_KEYS),
            "rps": {"view", "create", "edit", "export"},
            "attendance": {"view", "create", "edit", "export"},
            "grading": {"view", "create", "edit", "export"},
            "rekap_nilai": {"view", "export"},
            "krs_khs": {"view", "edit", "export"},
            "academic_calendar": {"view"},
        })

    if role == "student":
        return _matrix_from_grants({
            "dashboard": {"view"},
            "materials": {"view"},
            "assignments": {"view", "create"},
            "rps": {"view"},
            "attendance": {"view"},
            "grading": {"view", "export"},
            "krs_khs": {"view", "create", "edit", "export"},
            "keuangan": {"view", "export"},
            "academic_calendar": {"view"},
        })

    if role == "staff":
        return _matrix_from_grants({
            "dashboard": {"view"},
            "academic_calendar": {"view"},
        })

    # Unknown/legacy personas fail closed to the least-privileged staff
    # baseline instead of silently receiving student access.
    return role_default_permission_matrix("staff")

def normalize_permission_matrix(
    permissions: Optional[Dict[str, Dict[str, bool]]],
    fallback: Optional[Dict[str, Dict[str, bool]]] = None,
) -> Dict[str, Dict[str, bool]]:
    """Return a complete current matrix while safely expanding legacy keys."""
    source = permissions or {}
    fallback = fallback or default_permission_matrix()
    normalized: Dict[str, Dict[str, bool]] = {}

    for module in SYSTEM_MODULES:
        module_key = module["key"]
        selected = source.get(module_key)
        if not isinstance(selected, dict):
            for legacy_key, expanded_modules in LEGACY_MODULE_EXPANSIONS.items():
                legacy_value = source.get(legacy_key)
                if module_key in expanded_modules and isinstance(legacy_value, dict):
                    selected = legacy_value
                    break
        if not isinstance(selected, dict):
            selected = fallback.get(module_key, {})

        normalized[module_key] = {
            action_key: bool(selected.get(action_key, False))
            for action_key in ACTION_KEYS
        }

    return normalized


# ─── SEED DEFAULT TEMPLATES ─────────────────────────────────────────────────

KAPRODI_DEFAULT_MATRIX = _matrix_from_grants({
    # Templat jabatan bersifat tambahan terhadap hak akses Dosen. Hindari
    # menduplikasi seluruh workspace mengajar agar jabatan struktural tidak
    # berubah menjadi akses admin terselubung.
    "dashboard": {"export"},
    "curriculum_schedule": {"view", "create", "edit", "export"},
    "progres_nilai_prodi": {"view", "export"},
    "analisis_mahasiswa_prodi": {"view", "export"},
    "analisis_rps_prodi": {"view", "edit", "export"},
    "student_records": {"view", "export"},
    "lecturer_records": {"view", "export"},
    "academic_advising": {"view", "create", "edit", "export"},
})

FINANCE_STAFF_DEFAULT_MATRIX = _matrix_from_grants({
    "dashboard": {"view", "export"},
    "krs_khs": {"view", "export"},
    "keuangan": set(ACTION_KEYS),
    "student_records": {"view", "export"},
    "academic_structure": {"view"},
    "academic_setup": {"view"},
    "academic_calendar": {"view"},
})

ACADEMIC_OPERATOR_DEFAULT_MATRIX = _matrix_from_grants({
    "dashboard": {"view", "export"},
    "krs_khs": {"view", "create", "edit", "export"},
    # BAAK mengelola kalender institusi dengan kewenangan yang sama seperti
    # Admin Kampus, termasuk mengarsipkan/menghapus agenda.
    "academic_calendar": set(ACTION_KEYS),
    "academic_structure": {"view", "create", "edit", "export"},
    "curriculum_schedule": {"view", "create", "edit", "export"},
    "progres_nilai_prodi": {"view", "export"},
    "analisis_mahasiswa_prodi": {"view", "export"},
    "analisis_rps_prodi": {"view", "edit", "export"},
    "sk_mengajar": {"view", "create", "edit", "export"},
    "sk_jabatan": {"view", "create", "edit", "export"},
    "student_records": {"view", "create", "edit", "export"},
    "lecturer_records": {"view", "create", "edit", "export"},
    "academic_advising": {"view", "create", "edit", "export"},
})

PMB_STAFF_DEFAULT_MATRIX = _matrix_from_grants({
    "dashboard": {"view", "export"},
    "pmb": set(ACTION_KEYS),
    "student_records": {"view", "create", "edit", "export"},
    "academic_structure": {"view"},
    "academic_setup": {"view"},
    "academic_calendar": {"view"},
})

LEADERSHIP_DEFAULT_MATRIX = _matrix_from_grants({
    "dashboard": {"view", "export"},
    "rekap_nilai": {"view", "export"},
    "progres_nilai_prodi": {"view", "export"},
    "analisis_mahasiswa_prodi": {"view", "export"},
    "analisis_rps_prodi": {"view", "export"},
    "krs_khs": {"view", "export"},
    "keuangan": {"view", "export"},
    "academic_setup": {"view"},
    "academic_calendar": {"view"},
    "academic_structure": {"view"},
    "curriculum_schedule": {"view", "export"},
    "sk_mengajar": {"view", "export"},
    "sk_jabatan": {"view", "export"},
    "student_records": {"view", "export"},
    "lecturer_records": {"view", "export"},
    "feeder": {"view"},
})

DEFAULT_TEMPLATES = [
    {
        "id": "tpl_admin",
        "name": "Administrator (Full Access)",
        "description": "Akses penuh ke seluruh modul dan fungsi sistem",
        "role_target": "admin",
        "is_default": True,
        "permissions": role_default_permission_matrix("admin"),
    },
    {
        "id": "tpl_dosen",
        "name": "Dosen Pengampu",
        "description": "Akses standar dosen untuk pembelajaran, RPS, presensi, penilaian, dan perwalian KRS",
        "role_target": "lecturer",
        "is_default": True,
        "permissions": role_default_permission_matrix("lecturer"),
    },
    {
        "id": "tpl_mahasiswa",
        "name": "Mahasiswa",
        "description": "Akses akademik perkuliahan, tugas, KRS, KHS, dan pembayaran tagihan",
        "role_target": "student",
        "is_default": True,
        "permissions": role_default_permission_matrix("student"),
    },
    {
        "id": "tpl_tendik",
        "name": "Tendik (Akses Dasar)",
        "description": "Akses dasar untuk pegawai/tendik; wewenang operasional diberikan melalui tugas dan templat tambahan",
        "role_target": "staff",
        "is_default": True,
        "permissions": role_default_permission_matrix("staff"),
    },
    {
        "id": "tpl_kaprodi",
        "name": "Kaprodi (Ketua Program Studi)",
        "description": "Akses pengawasan kurikulum, analisis mahasiswa, progres nilai, serta approval RPS dalam scope Prodi",
        "role_target": "lecturer",
        "is_default": True,
        "permissions": KAPRODI_DEFAULT_MATRIX,
    },
    {
        "id": "tpl_keuangan",
        "name": "Staf Keuangan",
        "description": "Pengelolaan penuh tagihan, verifikasi pembayaran, dan laporan keuangan",
        "role_target": "staff",
        "is_default": True,
        "permissions": FINANCE_STAFF_DEFAULT_MATRIX,
    },
    {
        "id": "tpl_akademik",
        "name": "Operator Akademik (BAAK)",
        "description": "Pengelolaan periode, struktur akademik, KRS/KHS, dan data sivitas akademik",
        "role_target": "all",
        "is_default": True,
        "permissions": ACADEMIC_OPERATOR_DEFAULT_MATRIX,
    },
    {
        "id": "tpl_pmb",
        "name": "Operator PMB",
        "description": "Pengelolaan pendaftaran, seleksi, dan registrasi ulang calon mahasiswa",
        "role_target": "all",
        "is_default": True,
        "permissions": PMB_STAFF_DEFAULT_MATRIX,
    },
    {
        "id": "tpl_pimpinan",
        "name": "Pimpinan Akademik",
        "description": "Akses pemantauan dan laporan untuk pimpinan institusi",
        "role_target": "all",
        "is_default": True,
        "permissions": LEADERSHIP_DEFAULT_MATRIX,
    }
]


DEFAULT_TEMPLATE_MATRIX = {
    template["id"]: template["permissions"] for template in DEFAULT_TEMPLATES
}

BUILTIN_TEMPLATE_IDS = set(DEFAULT_TEMPLATE_MATRIX)
BUILTIN_TEMPLATE_PERMISSION_VERSION = 5
LEGACY_PERMISSION_KEYS = set(LEGACY_MODULE_EXPANSIONS)


ROLE_DEFAULT_TEMPLATE_MAP = {
    "admin": "tpl_admin",
    "lecturer": "tpl_dosen",
    "student": "tpl_mahasiswa",
    "staff": "tpl_tendik",
}


def default_template_permissions(template_id: Optional[str], role_target: str = "all") -> Dict[str, Dict[str, bool]]:
    if template_id in DEFAULT_TEMPLATE_MATRIX:
        return DEFAULT_TEMPLATE_MATRIX[template_id]
    if normalize_base_role(role_target) in {"admin", "lecturer", "student", "staff"}:
        return role_default_permission_matrix(role_target)
    return default_permission_matrix()


def normalize_template_permissions(template: Dict[str, Any]) -> Dict[str, Dict[str, bool]]:
    source = dict(template.get("permissions") or {})
    template_id = template.get("id")
    # Built-in templates from the old catalog used broad groups such as
    # ``data_master`` and ``user_management``. Expanding those groups would
    # grant unrelated modules (including system administration) to Kaprodi or
    # operational staff. A template saved through the current editor contains
    # only current module keys, so this branch is a safe legacy discriminator.
    if template_id in BUILTIN_TEMPLATE_IDS and LEGACY_PERMISSION_KEYS.intersection(source):
        source = default_template_permissions(template_id, template.get("role_target", "all"))
    # Legacy Kaprodi templates used one combined ``academic_documents`` key.
    # Keep its SK Mengajar access after the split, but never let it re-enable
    # SK Jabatan for a structural role that is not allowed to open that page.
    if template_id == "tpl_kaprodi":
        source["sk_jabatan"] = _permission_actions(False)
    if (
        template_id == "tpl_akademik"
        and int(template.get("permission_schema_version") or 0) < 5
    ):
        # Schema v5 mempertahankan fungsi operasional BAAK, tetapi mencabut
        # laporan pengajaran, konfigurasi periode, dan sarana yang khusus Admin.
        source = default_template_permissions(template_id, template.get("role_target", "all"))
    if (
        template_id == "tpl_tendik"
        and int(template.get("permission_schema_version") or 0) < 4
    ):
        # Role dasar Tendik harus tetap least-privilege. Seluruh kewenangan
        # operasional diturunkan dari jabatan aktif (BAAK, Keuangan, PMB, dst.).
        source = default_template_permissions(template_id, template.get("role_target", "staff"))
    return normalize_permission_matrix(
        source,
        default_template_permissions(template_id, template.get("role_target", "all")),
    )


def template_matches_user_role(template: Dict[str, Any], user_role: str) -> bool:
    """A template can only be assigned to its declared role or to every role."""
    target = template.get("role_target", "all")
    return target == "all" or normalize_base_role(target) == normalize_base_role(user_role)


# Tugas tambahan/struktural adalah sumber akses tambahan. Jenjang fungsional
# (Asisten Ahli, Lektor, dan seterusnya) sengaja tidak ada di daftar ini agar
# kenaikan pangkat tidak berubah menjadi eskalasi privilese sistem.
DEFAULT_POSITION_ACCESS_MAPPINGS = {
    "DIREKTUR": {"template_id": "tpl_pimpinan", "access_role": "campus_leader"},
    "DEKAN": {"template_id": "tpl_pimpinan", "access_role": "faculty_leader"},
    "WADIR1": {"template_id": "tpl_akademik", "access_role": "academic_operator"},
    "WADIR2": {"template_id": "tpl_keuangan", "access_role": "finance_officer"},
    "WADIR3": {"template_id": "tpl_pmb", "access_role": "pmb_officer"},
    "KAPRODI": {"template_id": "tpl_kaprodi", "access_role": "kaprodi"},
    "SEKPRODI": {"template_id": "tpl_kaprodi", "access_role": "sekprodi"},
    "AKADEMIK": {"template_id": "tpl_akademik", "access_role": "academic_operator"},
    "BENDAHARA": {"template_id": "tpl_keuangan", "access_role": "finance_officer"},
    "PMB": {"template_id": "tpl_pmb", "access_role": "pmb_officer"},
}


def merge_permission_matrices(
    matrices: List[Dict[str, Dict[str, bool]]],
) -> Dict[str, Dict[str, bool]]:
    """Combine base access and active duty access using additive permissions."""
    merged = default_permission_matrix()
    for matrix in matrices:
        normalized = normalize_permission_matrix(matrix)
        for module_key, actions in normalized.items():
            for action_key, allowed in actions.items():
                merged[module_key][action_key] = merged[module_key][action_key] or allowed
    return merged


def position_accesses_from_assignments(
    assignments: List[Dict[str, Any]],
    templates_by_id: Dict[str, Dict[str, Any]],
    overrides_by_jabatan_id: Optional[Dict[str, Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """Resolve active structural assignments into derived access templates."""
    overrides = overrides_by_jabatan_id or {}
    accesses: List[Dict[str, Any]] = []
    for assignment in assignments:
        if assignment.get("status") in {"inactive", "revoked"}:
            continue
        code = str(assignment.get("jabatan_kode") or "").upper().strip()
        explicit = overrides.get(assignment.get("jabatan_id", ""))
        if explicit and not explicit.get("enabled", True):
            continue
        mapping = dict(DEFAULT_POSITION_ACCESS_MAPPINGS.get(code, {}))
        if explicit:
            mapping.update({
                key: value for key, value in explicit.items()
                if key in {"template_id", "access_role"} and value
            })
        template_id = mapping.get("template_id")
        template = templates_by_id.get(template_id)
        if not template:
            continue
        accesses.append({
            "assignment_id": assignment.get("id", ""),
            "jabatan_id": assignment.get("jabatan_id", ""),
            "jabatan_kode": code,
            "jabatan_nama": assignment.get("jabatan_nama", ""),
            "template_id": template_id,
            "template_name": template.get("name", "Templat Jabatan"),
            "access_role": mapping.get("access_role", ""),
            "prodi_id": assignment.get("prodi_id", ""),
            "prodi_nama": assignment.get("prodi_nama", ""),
            "permissions": normalize_template_permissions(template),
        })
    return accesses


async def get_position_accesses(
    db: PostgresDatabase,
    user_id: str,
    templates_by_id: Optional[Dict[str, Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    if templates_by_id is None:
        templates = await db.access_templates.find({}, {"_id": 0}).to_list(None)
        templates_by_id = {template["id"]: template for template in templates}
    assignments = await db.jabatan_assignments.find(
        {"user_id": user_id},
        {"_id": 0},
    ).to_list(None)
    overrides = await db.access_position_mappings.find({}, {"_id": 0}).to_list(None)
    overrides_by_jabatan_id = {
        item.get("jabatan_id"): item for item in overrides if item.get("jabatan_id")
    }
    return position_accesses_from_assignments(
        assignments,
        templates_by_id,
        overrides_by_jabatan_id,
    )


async def rebuild_user_position_access(db: PostgresDatabase, user_id: str) -> List[Dict[str, Any]]:
    """Persist only derived role/scope metadata; permissions remain template-driven."""
    await ensure_seed_templates(db)
    templates = await db.access_templates.find({}, {"_id": 0}).to_list(None)
    accesses = await get_position_accesses(
        db,
        user_id,
        {template["id"]: template for template in templates},
    )
    roles = sorted({access["access_role"] for access in accesses if access.get("access_role")})
    prodi_ids = sorted({access["prodi_id"] for access in accesses if access.get("prodi_id")})
    program_manager_prodi_ids = sorted({
        access["prodi_id"]
        for access in accesses
        if access.get("access_role") in {"kaprodi", "sekprodi"} and access.get("prodi_id")
    })
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "access_roles": roles,
            "access_scope_prodi_ids": prodi_ids,
            "is_kaprodi": bool(program_manager_prodi_ids),
            "kaprodi_prodi_id": program_manager_prodi_ids[0] if program_manager_prodi_ids else "",
            "access_roles_updated_at": now_iso(),
        }},
    )
    return accesses


async def build_effective_user_access(
    db: PostgresDatabase,
    target_user: Dict[str, Any],
) -> Dict[str, Any]:
    """Build the effective access view without changing the account's base role.

    The manual template/custom matrix remains the user's own configuration. Every
    active structural assignment contributes an additive matrix and optional
    program-study scope. This deliberately keeps functional lecturer rank out of
    access resolution.
    """
    await ensure_seed_templates(db)
    urole = normalize_base_role(target_user.get("role", "staff"))
    templates = await db.access_templates.find({}, {"_id": 0}).to_list(None)
    template_map = {template["id"]: template for template in templates}
    setting = await db.user_permissions.find_one(
        {"user_id": target_user.get("id")},
        {"_id": 0},
    ) or {}

    mode = setting.get("mode", "template")
    template_id = setting.get("template_id") or ROLE_DEFAULT_TEMPLATE_MAP.get(urole, "tpl_tendik")
    base_template = template_map.get(template_id) or template_map.get(
        ROLE_DEFAULT_TEMPLATE_MAP.get(urole, "tpl_tendik")
    )
    base_permissions = normalize_permission_matrix(
        base_template.get("permissions") if base_template else None,
        default_template_permissions(
            base_template.get("id") if base_template else ROLE_DEFAULT_TEMPLATE_MAP.get(urole, "tpl_tendik"),
            base_template.get("role_target", urole) if base_template else urole,
        ),
    )
    custom_permissions = normalize_permission_matrix(
        setting.get("custom_permissions"),
        base_permissions,
    )
    manual_permissions = custom_permissions if mode == "custom" else base_permissions
    position_accesses = await get_position_accesses(
        db,
        target_user.get("id", ""),
        template_map,
    )
    effective_permissions = merge_permission_matrices([
        manual_permissions,
        *[access["permissions"] for access in position_accesses],
    ])
    access_roles = sorted({
        access["access_role"] for access in position_accesses if access.get("access_role")
    })
    access_scope_prodi_ids = sorted({
        access["prodi_id"] for access in position_accesses if access.get("prodi_id")
    })

    return {
        "access_mode": mode,
        "template_id": template_id,
        "template_name": base_template.get("name") if base_template else "Templat Default",
        "base_permissions": base_permissions,
        "custom_permissions": custom_permissions,
        "effective_permissions": effective_permissions,
        "position_accesses": position_accesses,
        "access_roles": access_roles,
        "access_scope_prodi_ids": access_scope_prodi_ids,
    }


async def ensure_seed_templates(db: PostgresDatabase):
    """Ensure built-ins exist and safely migrate legacy permission groups."""
    for template in DEFAULT_TEMPLATES:
        existing = await db.access_templates.find_one({"id": template["id"]}, {"_id": 0})
        if not existing:
            doc = {**template, "created_at": now_iso(), "updated_at": now_iso()}
            if template["id"] in BUILTIN_TEMPLATE_IDS:
                doc["permission_schema_version"] = BUILTIN_TEMPLATE_PERMISSION_VERSION
            await db.access_templates.insert_one(doc)
            continue

        updates: Dict[str, Any] = {}
        if template["id"] == "tpl_keuangan" and existing.get("role_target") == "admin":
            # Older installations seeded the finance template as admin-only.
            # Migrate only its target role; preserve any local permission edits.
            updates["role_target"] = "staff"

        if template["id"] in BUILTIN_TEMPLATE_IDS:
            existing_permissions = existing.get("permissions") or {}
            if LEGACY_PERMISSION_KEYS.intersection(existing_permissions):
                # Old broad module groups cannot be translated safely without
                # recreating the privilege escalation. Reset only legacy
                # built-ins; templates saved by the current editor no longer
                # contain these keys and remain fully customisable.
                updates["permissions"] = template["permissions"]
            elif (
                template["id"] == "tpl_kaprodi"
                and int(existing.get("permission_schema_version") or 0) < 3
            ):
                # Schema v3 memisahkan hak dasar Dosen dari privilese
                # struktural Kaprodi. Reset hanya templat bawaan Kaprodi agar
                # Fakultas/Prodi dan dokumen SK tidak tetap terbawa dari v2.
                updates["permissions"] = template["permissions"]
            elif (
                template["id"] == "tpl_akademik"
                and int(existing.get("permission_schema_version") or 0) < 5
            ):
                # Schema v5 menghapus laporan pengajaran, konfigurasi periode,
                # dan sarana dari templat BAAK. Templat custom tidak disentuh.
                updates["permissions"] = template["permissions"]
            elif (
                template["id"] == "tpl_tendik"
                and int(existing.get("permission_schema_version") or 0) < 4
            ):
                # Hak dasar Tendik pernah menyerap izin operasional tambahan.
                # Kembalikan ke dashboard + kalender baca; jabatan aktif tetap
                # menambahkan kewenangan melalui templat posisinya masing-masing.
                updates["permissions"] = template["permissions"]
            if existing.get("permission_schema_version") != BUILTIN_TEMPLATE_PERMISSION_VERSION:
                updates["permission_schema_version"] = BUILTIN_TEMPLATE_PERMISSION_VERSION

        if updates:
            updates["updated_at"] = now_iso()
            await db.access_templates.update_one(
                {"id": template["id"]},
                {"$set": updates},
            )


# ─── MODELS ──────────────────────────────────────────────────────────────────

class TemplateCreatePayload(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = ""
    role_target: str = "all"  # admin | lecturer | student | staff | all
    permissions: Dict[str, Dict[str, bool]]


class RolePermissionSavePayload(BaseModel):
    permissions: Dict[str, Dict[str, bool]]


class UserPermissionSavePayload(BaseModel):
    mode: str = "template"  # "template" | "custom"
    template_id: Optional[str] = None
    custom_permissions: Optional[Dict[str, Dict[str, bool]]] = None
    base_role: Optional[str] = None


class BulkAssignPayload(BaseModel):
    user_ids: List[str]
    template_id: str


class PositionMappingPayload(BaseModel):
    template_id: Optional[str] = None
    enabled: bool = True


# ─── ENDPOINTS ───────────────────────────────────────────────────────────────

@router.get("/modules")
async def get_modules(user: Dict[str, Any] = Depends(get_current_user)):
    """Mengambil daftar modul sistem dan daftar aksi."""
    return {
        "modules": SYSTEM_MODULES,
        "actions": ACTIONS
    }


@router.get("/position-mappings")
async def get_position_mappings(
    db: PostgresDatabase = Depends(get_db),
    user: Dict[str, Any] = Depends(require_admin),
):
    """Daftar pemetaan tugas tambahan/struktural ke templat hak akses."""
    await ensure_seed_templates(db)
    positions = await db.jabatan_akademik.find({}, {"_id": 0}).to_list(None)
    if not positions:
        # Keep the catalog available even when the Jabatan Akademik screen has
        # not been opened yet on a newly migrated campus.
        from routers.master_data import list_jabatan_akademik
        positions = await list_jabatan_akademik(db)
    templates = await db.access_templates.find({}, {"_id": 0}).to_list(None)
    template_map = {template["id"]: template for template in templates}
    overrides = await db.access_position_mappings.find({}, {"_id": 0}).to_list(None)
    override_map = {item.get("jabatan_id"): item for item in overrides if item.get("jabatan_id")}

    result = []
    for position in positions:
        code = str(position.get("kode") or "").upper().strip()
        override = override_map.get(position.get("id"))
        default = DEFAULT_POSITION_ACCESS_MAPPINGS.get(code, {})
        enabled = override.get("enabled", True) if override else bool(default)
        template_id = (
            override.get("template_id") if override and override.get("template_id")
            else default.get("template_id", "")
        )
        template = template_map.get(template_id)
        result.append({
            "jabatan_id": position.get("id", ""),
            "jabatan_kode": code,
            "jabatan_nama": position.get("nama", ""),
            "scope": position.get("scope", "institution"),
            "enabled": enabled,
            "template_id": template_id,
            "template_name": template.get("name", "") if template else "",
            "access_role": (
                override.get("access_role") if override and override.get("access_role")
                else default.get("access_role", "")
            ),
            "source": "custom" if override else ("default" if default else "unmapped"),
        })
    return {"data": result}


@router.put("/position-mappings/{jabatan_id}")
async def save_position_mapping(
    jabatan_id: str,
    body: PositionMappingPayload,
    db: PostgresDatabase = Depends(get_db),
    user: Dict[str, Any] = Depends(require_admin),
):
    """Atur templat yang diturunkan saat jabatan ditugaskan kepada pengguna."""
    position = await db.jabatan_akademik.find_one({"id": jabatan_id}, {"_id": 0})
    if not position:
        raise HTTPException(status_code=404, detail="Jabatan tidak ditemukan")
    template = None
    if body.enabled and body.template_id:
        template = await db.access_templates.find_one({"id": body.template_id}, {"_id": 0})
        if not template:
            raise HTTPException(status_code=404, detail="Templat hak akses tidak ditemukan")

    code = str(position.get("kode") or "").upper().strip()
    default = DEFAULT_POSITION_ACCESS_MAPPINGS.get(code, {})
    doc = {
        "id": f"position-access-{jabatan_id}",
        "jabatan_id": jabatan_id,
        "jabatan_kode": code,
        "enabled": body.enabled,
        "template_id": body.template_id or "",
        "access_role": default.get("access_role", ""),
        "updated_at": now_iso(),
        "updated_by": user.get("id", ""),
    }
    await db.access_position_mappings.update_one(
        {"jabatan_id": jabatan_id},
        {"$set": doc},
        upsert=True,
    )

    affected = await db.jabatan_assignments.find(
        {"jabatan_id": jabatan_id},
        {"_id": 0, "user_id": 1},
    ).to_list(None)
    for assignment in affected:
        if assignment.get("user_id"):
            await rebuild_user_position_access(db, assignment["user_id"])
    return {
        "message": "Pemetaan jabatan ke templat hak akses berhasil disimpan",
        "data": {
            **doc,
            "template_name": template.get("name", "") if template else "",
        },
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
        {"role": "staff", "name": "Tendik", "template_id": "tpl_tendik"},
        {"role": "admin", "name": "Administrator", "template_id": "tpl_admin"}
    ]

    result = []
    for r in roles_info:
        r_code = r["role"]
        count_query = {"role": r_code}
        if r_code == "staff":
            count_query = {"role": {"$in": ["staff", "tendik", "staf", "pegawai"]}}
        count = await db.users.count_documents(count_query)
        
        role_doc = await db.role_permissions.find_one({"role": r_code}, {"_id": 0})
        if not role_doc:
            tpl_doc = await db.access_templates.find_one({"id": r["template_id"]}, {"_id": 0})
            perms = normalize_permission_matrix(
                tpl_doc.get("permissions") if tpl_doc else None,
                default_template_permissions(r["template_id"], r_code),
            )
        else:
            perms = normalize_permission_matrix(
                role_doc.get("permissions"),
                role_default_permission_matrix(r_code),
            )

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
    role_name = normalize_base_role(role_name)
    if role_name not in BASE_ROLE_LABELS:
        raise HTTPException(status_code=400, detail="Role tidak valid")

    existing = await db.role_permissions.find_one({"role": role_name}, {"_id": 0})
    doc = {
        "role": role_name,
        "permissions": normalize_permission_matrix(
            body.permissions,
            role_default_permission_matrix(role_name),
        ),
        "updated_at": now_iso()
    }
    if existing:
        await db.role_permissions.update_one({"role": role_name}, {"$set": doc})
    else:
        doc["created_at"] = now_iso()
        await db.role_permissions.insert_one(doc)

    role_tpl_map = ROLE_DEFAULT_TEMPLATE_MAP
    tpl_id = role_tpl_map.get(role_name)
    if tpl_id:
        await db.access_templates.update_one(
            {"id": tpl_id},
            {"$set": {"permissions": doc["permissions"], "updated_at": now_iso()}}
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
        tpl["permissions"] = normalize_template_permissions(tpl)
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
        "permissions": normalize_permission_matrix(
            body.permissions,
            default_template_permissions(None, body.role_target),
        ),
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
        "permissions": normalize_permission_matrix(
            body.permissions,
            default_template_permissions(template_id, body.role_target),
        ),
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

    position_mapping = await db.access_position_mappings.find_one(
        {"template_id": template_id, "enabled": {"$ne": False}},
        {"_id": 0, "jabatan_id": 1},
    )
    if position_mapping:
        raise HTTPException(
            status_code=409,
            detail="Templat masih dipakai oleh pemetaan jabatan. Ubah atau nonaktifkan pemetaan tersebut terlebih dahulu.",
        )

    await db.access_templates.delete_one({"id": template_id})

    # Kembalikan user yang terpengaruh ke templat default role mereka
    await db.user_permissions.update_many(
        {"template_id": template_id},
        {"$set": {"mode": "template", "template_id": None, "updated_at": now_iso()}}
    )
    return {"message": "Templat berhasil dihapus"}


@router.get("/users")
async def list_user_access(
    role: Optional[str] = Query(None, description="Filter role: admin, lecturer, student, staff"),
    search: Optional[str] = Query(None, description="Cari nama, username, email, NIM, atau NIDN"),
    page: int = 1,
    limit: int = 50,
    db: PostgresDatabase = Depends(get_db),
    user: Dict[str, Any] = Depends(require_admin)
):
    """Mengambil daftar pengguna beserta status templat/custom hak akses mereka."""
    await ensure_seed_templates(db)
    
    query: Dict[str, Any] = {}
    if role and role != "all":
        normalized_role = normalize_base_role(role)
        query["role"] = (
            {"$in": ["staff", "tendik", "staf", "pegawai"]}
            if normalized_role == "staff"
            else normalized_role
        )

    if search:
        s = search.strip()
        # Escape input so the field behaves as a normal keyword search, not as
        # a user-provided regular expression. The PostgreSQL document adapter
        # translates this to a case-insensitive regex predicate.
        pattern = re.escape(s)
        query["$or"] = [
            {"name": {"$regex": pattern, "$options": "i"}},
            {"full_name": {"$regex": pattern, "$options": "i"}},
            {"username": {"$regex": pattern, "$options": "i"}},
            {"email": {"$regex": pattern, "$options": "i"}},
            {"nim": {"$regex": pattern, "$options": "i"}},
            {"nidn": {"$regex": pattern, "$options": "i"}},
        ]

    total = await db.users.count_documents(query)
    skip = (page - 1) * limit
    
    users = await db.users.find(
        query,
        {"_id": 0, "password_hash": 0},
    ).skip(skip).to_list(limit)
    
    templates = await db.access_templates.find({}, {"_id": 0}).to_list(None)
    tpl_map = {t["id"]: t for t in templates}
    
    # Ambil default template fallback per role
    role_default_map = ROLE_DEFAULT_TEMPLATE_MAP

    user_ids = [u["id"] for u in users if "id" in u]
    perm_docs = await db.user_permissions.find({"user_id": {"$in": user_ids}}, {"_id": 0}).to_list(None)
    perm_map = {p["user_id"]: p for p in perm_docs}
    position_assignments = await db.jabatan_assignments.find(
        {"user_id": {"$in": user_ids}},
        {"_id": 0},
    ).to_list(None)
    mapping_overrides = await db.access_position_mappings.find({}, {"_id": 0}).to_list(None)
    override_map = {
        item.get("jabatan_id"): item for item in mapping_overrides if item.get("jabatan_id")
    }
    position_accesses_by_user: Dict[str, List[Dict[str, Any]]] = {}
    for assignment in position_assignments:
        user_id = assignment.get("user_id")
        if not user_id:
            continue
        position_accesses_by_user.setdefault(user_id, []).extend(
            position_accesses_from_assignments([assignment], tpl_map, override_map)
        )

    result = []
    for u in users:
        uid = u.get("id")
        urole = normalize_base_role(u.get("role", "staff"))
        p_setting = perm_map.get(uid, {})

        mode = p_setting.get("mode", "template")
        template_id = p_setting.get("template_id") or role_default_map.get(urole, "tpl_tendik")
        
        tpl_info = tpl_map.get(template_id) or tpl_map.get(role_default_map.get(urole, "tpl_tendik"))
        position_accesses = position_accesses_by_user.get(uid, [])
        
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
            "has_custom": mode == "custom",
            "position_accesses": [{
                "jabatan_nama": access["jabatan_nama"],
                "template_id": access["template_id"],
                "template_name": access["template_name"],
                "access_role": access["access_role"],
                "prodi_id": access["prodi_id"],
            } for access in position_accesses],
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

    effective_access = await build_effective_user_access(db, target_user)

    return {
        "user": {
            "id": target_user.get("id"),
            "name": target_user.get("name") or target_user.get("full_name") or "User",
            "email": target_user.get("email"),
            "role": normalize_base_role(target_user.get("role", "staff")),
            "nim": target_user.get("nim"),
            "nidn": target_user.get("nidn")
        },
        **effective_access,
    }


@router.get("/me/effective")
async def get_my_effective_access(
    db: PostgresDatabase = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Return the caller's resolved permissions, roles, and structural scope."""
    effective_access = await build_effective_user_access(db, user)
    return {
        "user": {
            "id": user.get("id"),
            "name": user.get("name") or user.get("full_name") or "User",
            "role": normalize_base_role(user.get("role", "staff")),
        },
        **effective_access,
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
    if body.mode not in {"template", "custom"}:
        raise HTTPException(status_code=400, detail="Mode hak akses tidak valid")

    existing = await db.user_permissions.find_one({"user_id": user_id}, {"_id": 0})
    role_default_map = ROLE_DEFAULT_TEMPLATE_MAP
    urole = normalize_base_role(body.base_role or target_user.get("role", "staff"))
    if urole not in BASE_ROLE_LABELS:
        raise HTTPException(status_code=400, detail="Role utama tidak valid")
    if user_id == user.get("id") and urole != "admin":
        raise HTTPException(status_code=400, detail="Administrator aktif tidak dapat menurunkan role akunnya sendiri")
    selected_template_id = body.template_id or role_default_map.get(urole, "tpl_tendik")
    selected_template = await db.access_templates.find_one({"id": selected_template_id}, {"_id": 0})
    if not selected_template:
        raise HTTPException(status_code=404, detail="Templat hak akses tidak ditemukan")
    if not template_matches_user_role(selected_template, urole):
        raise HTTPException(
            status_code=422,
            detail="Templat hanya dapat diterapkan pada pengguna dengan role yang sesuai",
        )
    if urole != normalize_base_role(target_user.get("role", "staff")):
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"role": urole, "updated_at": now_iso()}},
        )
        # A role downgrade must not wait for an authentication-cache expiry.
        # Force the affected account to sign in again, while keeping the
        # administrator's own session intact.
        if user_id != user.get("id"):
            await db.sessions.delete_many({"user_id": user_id})
    base_permissions = normalize_permission_matrix(
        selected_template.get("permissions"),
        default_template_permissions(
            selected_template.get("id"),
            selected_template.get("role_target", urole),
        ),
    )
    doc = {
        "user_id": user_id,
        "mode": body.mode,
        "template_id": selected_template_id,
        "custom_permissions": normalize_permission_matrix(
            body.custom_permissions,
            base_permissions,
        ) if body.mode == "custom" else {},
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

    recipients = await db.users.find(
        {"id": {"$in": body.user_ids}},
        {"_id": 0, "id": 1, "name": 1, "role": 1},
    ).to_list(None)
    found_ids = {recipient.get("id") for recipient in recipients}
    missing_ids = [user_id for user_id in body.user_ids if user_id not in found_ids]
    if missing_ids:
        raise HTTPException(status_code=404, detail="Satu atau lebih pengguna tidak ditemukan")

    incompatible = [
        recipient.get("name") or recipient.get("id")
        for recipient in recipients
        if not template_matches_user_role(tpl, recipient.get("role", "student"))
    ]
    if incompatible:
        raise HTTPException(
            status_code=422,
            detail=(
                "Templat hanya dapat diterapkan pada role yang sesuai. "
                f"Pengguna tidak sesuai: {', '.join(incompatible[:3])}"
            ),
        )

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
