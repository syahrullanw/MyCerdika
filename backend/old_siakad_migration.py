"""Rekonsiliasi dan backfill OLD-SIAP ke PostgreSQL SIAKAD baru.

Script ini tidak pernah menulis ke Neo Feeder. Feeder hanya dibaca sebagai
snapshot pembanding. Mode default adalah dry-run.

Contoh:
  .venv/bin/python scripts/reconcile_old_siakad_to_new.py \
    --file "db siakad old siap 7 agustus.json" --period 20252

  .venv/bin/python scripts/reconcile_old_siakad_to_new.py \
    --file "db siakad old siap 7 agustus.json" --period 20252 --execute
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import hashlib
import json
import os
import re
import secrets
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
import bcrypt
from dotenv import load_dotenv


ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))
load_dotenv(BACKEND_DIR / ".env")

from postgres_database import PostgresDatabase, matches  # noqa: E402
from routers.feeder import (  # noqa: E402
    feeder_response_token,
    fetch_feeder_rows,
    normalize_feeder_path,
    normalize_feeder_url,
)


DEFAULT_OLD_JSON = ROOT_DIR / "db siakad old siap 7 agustus.json"
DAYA_TAMPUNG_CSV = ROOT_DIR / "dump_feeder" / "pddikti_export_all" / "csv" / "daya_tampung.csv"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def clean(value: Any) -> str:
    return str(value or "").strip()


def normalized(value: Any) -> str:
    return re.sub(r"\s+", " ", clean(value)).upper()


def name_key(value: Any) -> str:
    return re.sub(r"[^A-Z0-9]", "", normalized(value))


def meaningful(value: Any) -> bool:
    return clean(value) not in {"", "0", "0000-00-00", "0000-00-00 00:00:00"}


def as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value or default)
    except (TypeError, ValueError):
        return default


def as_int(value: Any, default: int = 0) -> int:
    try:
        return int(float(value or default))
    except (TypeError, ValueError):
        return default


def values_differ(left: Any, right: Any, tolerance: float = 0.01) -> bool:
    try:
        return abs(float(left or 0) - float(right or 0)) > tolerance
    except (TypeError, ValueError):
        return normalized(left) != normalized(right)


def period_info(code: str) -> dict[str, str]:
    year = int(code[:4])
    semester = {"1": "Ganjil", "2": "Genap", "3": "Pendek"}.get(code[4], "")
    return {
        "code": code,
        "year": f"{year}/{year + 1}",
        "semester": semester,
        "name": f"Tahun Akademik {year}/{year + 1} {semester}".strip(),
    }


def parse_old_tables(path: Path) -> dict[str, list[dict[str, Any]]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    return {
        item["name"]: item.get("data", [])
        for item in raw
        if isinstance(item, dict) and item.get("type") == "table" and item.get("name")
    }


def read_csv_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig", errors="replace", newline="") as handle:
        return list(csv.DictReader(handle))


def old_grade(row: dict[str, Any]) -> tuple[str, float, float]:
    return (
        normalized(row.get("GradeNilai")),
        round(as_float(row.get("BobotNilai")), 2),
        round(as_float(row.get("NilaiAkhir")), 2),
    )


def feeder_grade(row: dict[str, Any]) -> tuple[str, float, float]:
    return (
        normalized(row.get("nilai_huruf")),
        round(as_float(row.get("nilai_indeks")), 2),
        round(as_float(row.get("nilai_angka")), 2),
    )


def new_grade(row: dict[str, Any], score_field: str) -> tuple[str, float, float]:
    return (
        normalized(row.get("grade_letter")),
        round(as_float(row.get("grade_point")), 2),
        round(as_float(row.get(score_field)), 2),
    )


def nonempty_fields(values: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in values.items() if meaningful(value)}


@dataclass
class PlannedUpdate:
    collection: str
    query: dict[str, Any]
    values: dict[str, Any]
    upsert: bool = False
    needs_write: bool = True


VOLATILE_MIGRATION_FIELDS = {
    "created_at",
    "updated_at",
    "migration_source",
    "migration_verified_at",
    "migration_reconciled_at",
}


def stable_hash(value: Any) -> str:
    encoded = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def managed_values(values: dict[str, Any]) -> dict[str, Any]:
    """Nilai sumber yang stabil; timestamp proses tidak memicu update palsu."""
    result = {
        key: value
        for key, value in values.items()
        if key not in VOLATILE_MIGRATION_FIELDS
    }
    # Urutan baris KRS/KHS pada export SQL bukan bagian dari identitas data.
    # Normalisasi mencegah record yang sama ditandai konflik hanya karena urutan.
    for key in ("courses", "grades"):
        if isinstance(result.get(key), list):
            result[key] = sorted(
                result[key],
                key=lambda item: json.dumps(
                    item,
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                    default=str,
                ),
            )
    return result


def operation_state_id(operation: PlannedUpdate) -> str:
    identity = operation.query.get("id") or operation.query.get("code")
    if not identity:
        identity = stable_hash(operation.query)[:20]
    return f"{operation.collection}:{identity}"


def current_document_for_operation(
    operation: PlannedUpdate,
    current: dict[str, list[dict[str, Any]]],
) -> dict[str, Any] | None:
    return next(
        (
            document
            for document in current.get(operation.collection, [])
            if matches(document, operation.query)
        ),
        None,
    )


def classify_incremental_updates(
    updates: list[PlannedUpdate],
    current: dict[str, list[dict[str, Any]]],
    state_documents: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], Counter[str]]:
    """Klasifikasikan perubahan tanpa mengubah target.

    Perubahan sumber hanya aman diterapkan otomatis ketika target belum berubah
    sejak snapshot sumber terakhir. Jika keduanya berubah, record menjadi
    konflik dan harus diputuskan admin.
    """
    states = {clean(item.get("id")): item for item in state_documents}
    entries: list[dict[str, Any]] = []
    summary: Counter[str] = Counter()
    for operation in updates:
        state_id = operation_state_id(operation)
        previous = states.get(state_id)
        target = current_document_for_operation(operation, current)
        desired = managed_values(operation.values)
        target_subset = (
            managed_values({key: target.get(key) for key in desired})
            if target is not None
            else None
        )
        source_hash = stable_hash(desired)
        target_hash_before = stable_hash(target_subset) if target_subset is not None else ""
        target_hash_after = stable_hash(desired)
        # Sebuah versi migrator baru dapat menambah field yang sebelumnya belum
        # dikelola (misalnya biaya semester atau kode referensi Feeder). Field
        # tambahan aman di-backfill hanya jika semua field lama pada target masih
        # menghasilkan hash baseline yang sama. Dengan begitu perubahan lokal
        # pada field lama tetap menjadi konflik dan tidak pernah ditimpa.
        added_fields = (
            [key for key in desired if target is not None and key not in target]
            if previous
            else []
        )
        legacy_target_subset = (
            managed_values(
                {key: target.get(key) for key in desired if key in target}
            )
            if target is not None and added_fields
            else None
        )
        target_matches_previous = bool(previous) and (
            target_hash_before == clean(previous.get("target_hash"))
            or (
                legacy_target_subset is not None
                and stable_hash(legacy_target_subset)
                == clean(previous.get("target_hash"))
            )
        )

        if target is None:
            status = "ready_create" if operation.upsert else "conflict"
        elif target_subset == desired:
            status = "unchanged"
        elif previous:
            source_changed = source_hash != clean(previous.get("source_hash"))
            target_changed = not target_matches_previous
            if source_changed and not target_changed:
                status = "ready_update"
            elif source_changed and target_changed:
                status = "conflict"
            elif not source_changed and target_changed:
                status = "local_newer"
            else:
                status = "unchanged"
        else:
            # Tanpa baseline, sistem tidak boleh menebak apakah OLD atau target
            # yang lebih baru. Admin dapat menyelesaikannya melalui preview.
            status = "conflict"

        changed_fields = sorted(
            key
            for key, value in desired.items()
            if target is None or target.get(key) != value
        )
        entry = {
            "id": state_id,
            "collection": operation.collection,
            "query": operation.query,
            "values": operation.values,
            "upsert": operation.upsert,
            # ``operation.needs_write`` berasal dari perbandingan versi lama.
            # Classifier incremental dapat menemukan field tambahan yang tetap
            # perlu ditulis walaupun flag optimisasi lama bernilai False.
            "needs_write": operation.needs_write or target_subset != desired,
            "status": status,
            "action": (
                "create"
                if status == "ready_create"
                else "update"
                if status == "ready_update"
                else "review"
                if status == "conflict"
                else "preserve_local"
                if status == "local_newer"
                else "none"
            ),
            "changed_fields": changed_fields,
            "source_hash": source_hash,
            "target_hash_before": target_hash_before,
            "target_hash_after": target_hash_after,
            "current_preview": (
                {key: target.get(key) for key in changed_fields[:12]}
                if target is not None
                else {}
            ),
            "source_preview": {key: desired.get(key) for key in changed_fields[:12]},
        }
        entries.append(entry)
        summary[status] += 1
        summary[f"collection:{operation.collection}:{status}"] += 1
    return entries, summary


async def fetch_live_feeder(db: PostgresDatabase, period: str) -> dict[str, list[dict[str, Any]]]:
    config = await db.feeder_config.find_one({"id": "default"}, {"_id": 0}) or {}
    if not config.get("username") or not config.get("password"):
        raise RuntimeError("Konfigurasi Feeder belum lengkap")
    endpoint = normalize_feeder_url(config.get("feeder_url")) + normalize_feeder_path(
        config.get("feeder_path"), config.get("mode", "sandbox")
    )
    async with httpx.AsyncClient(timeout=90.0) as client:
        token_payload = (
            await client.post(
                endpoint,
                json={
                    "act": "GetToken",
                    "username": config["username"],
                    "password": config["password"],
                },
            )
        ).json()
        token = feeder_response_token(token_payload)
        if token_payload.get("error_code") != 0 or not token:
            raise RuntimeError(token_payload.get("error_desc") or "Token Feeder tidak tersedia")
        semester_filter = f"id_semester='{period}'"
        (
            classes,
            grades,
            lecturers,
            activities,
            courses,
            programs,
            curricula,
            curriculum_courses,
            student_statuses,
        ) = await asyncio.gather(
            fetch_feeder_rows(client, endpoint, token, "GetListKelasKuliah", semester_filter),
            fetch_feeder_rows(
                client, endpoint, token, "GetDetailNilaiPerkuliahanKelas", semester_filter
            ),
            fetch_feeder_rows(
                client, endpoint, token, "GetDosenPengajarKelasKuliah", semester_filter
            ),
            fetch_feeder_rows(
                client, endpoint, token, "GetAktivitasKuliahMahasiswa", semester_filter
            ),
            fetch_feeder_rows(client, endpoint, token, "GetListMataKuliah", ""),
            fetch_feeder_rows(client, endpoint, token, "GetProdi", ""),
            fetch_feeder_rows(client, endpoint, token, "GetKurikulum", ""),
            fetch_feeder_rows(client, endpoint, token, "GetMatkulKurikulum", ""),
            fetch_feeder_rows(client, endpoint, token, "GetStatusMahasiswa", ""),
        )
        # Master mahasiswa/dosen diperlukan untuk memverifikasi identifier lama.
        students = await fetch_feeder_rows(client, endpoint, token, "GetListMahasiswa", "")
        lecturers_master = await fetch_feeder_rows(client, endpoint, token, "GetListDosen", "")
        lecturer_registrations = await fetch_feeder_rows(
            client, endpoint, token, "GetListPenugasanDosen", ""
        )
    return {
        "classes": classes,
        "grades": grades,
        "lecturers": lecturers,
        "activities": activities,
        "courses": courses,
        "programs": programs,
        "curricula": curricula,
        "curriculum_courses": curriculum_courses,
        "student_statuses": student_statuses,
        "students": students,
        "lecturers_master": lecturers_master,
        "lecturer_registrations": lecturer_registrations,
    }


async def load_collection(db: PostgresDatabase, name: str) -> list[dict[str, Any]]:
    return await getattr(db, name).find({}, {"_id": 0}).to_list(None)


def build_three_way_grade_summary(
    tables: dict[str, list[dict[str, Any]]],
    new_krs_docs: list[dict[str, Any]],
    feeder_rows: list[dict[str, Any]],
    period: str,
) -> Counter[str]:
    old_classes = {
        normalized(row.get("JadwalID")): row
        for row in tables.get("jadwal", [])
        if normalized(row.get("TahunID")) == period
    }
    feeder_to_local = {
        normalized(row.get("JadwalIDDIkti")): class_id
        for class_id, row in old_classes.items()
        if meaningful(row.get("JadwalIDDIkti"))
    }
    old_rows: defaultdict[tuple[str, str], list[tuple[str, float, float]]] = defaultdict(list)
    new_rows: defaultdict[tuple[str, str], list[tuple[str, float, float]]] = defaultdict(list)
    feeder_by_key: defaultdict[tuple[str, str], list[tuple[str, float, float]]] = defaultdict(list)
    for row in tables.get("krs", []):
        if normalized(row.get("TahunID")) == period:
            old_rows[(normalized(row.get("MhswID")), normalized(row.get("JadwalID")))].append(
                old_grade(row)
            )
    for document in new_krs_docs:
        if normalized(document.get("academic_period_id")) != period:
            continue
        for course in document.get("courses") or []:
            new_rows[(normalized(document.get("student_id")), normalized(course.get("class_id")))].append(
                new_grade(course, "final_score")
            )
    for row in feeder_rows:
        local_class_id = feeder_to_local.get(normalized(row.get("id_kelas_kuliah")))
        if not local_class_id:
            local_class_id = f"FEEDER:{normalized(row.get('id_kelas_kuliah'))}"
        feeder_by_key[(normalized(row.get("nim")), local_class_id)].append(feeder_grade(row))

    result: Counter[str] = Counter()
    for key in set(old_rows) | set(new_rows) | set(feeder_by_key):
        old_values = Counter(old_rows[key])
        new_values = Counter(new_rows[key])
        feeder_values = Counter(feeder_by_key[key])
        if old_values == new_values == feeder_values:
            status = "all_equal"
        elif old_values == new_values and feeder_values and old_values != feeder_values:
            status = "old_new_equal_feeder_diff"
        elif new_values == feeder_values and old_values != new_values:
            status = "new_feeder_equal_old_diff"
        elif old_values == feeder_values and new_values != old_values:
            status = "old_feeder_equal_new_diff"
        elif not feeder_values and old_values == new_values:
            status = "old_new_equal_no_feeder"
        elif not feeder_values and old_values != new_values:
            status = "old_new_diff_no_feeder"
        elif not old_values:
            status = "feeder_only"
        elif not new_values:
            status = "new_missing"
        else:
            status = "all_different"
        result[status] += 1
    return result


def build_plan(
    tables: dict[str, list[dict[str, Any]]],
    current: dict[str, list[dict[str, Any]]],
    live: dict[str, list[dict[str, Any]]],
    period: str,
    source_name: str,
) -> tuple[list[PlannedUpdate], dict[str, Any]]:
    updates: list[PlannedUpdate] = []
    generated_at = now_iso()

    users_by_id = {normalized(row.get("id")): row for row in current["users"]}
    programs_by_id = {normalized(row.get("id")): row for row in current["programs"]}
    courses_by_id = {normalized(row.get("id")): row for row in current["courses"]}
    classes_by_id = {normalized(row.get("id")): row for row in current["classes"]}
    curricula_by_id = {normalized(row.get("id")): row for row in current["kurikulum"]}
    periods_by_code = {normalized(row.get("code")): row for row in current["academic_periods"]}
    krs_by_key = {
        (normalized(row.get("student_id")), normalized(row.get("academic_period_id"))): row
        for row in current["krs"]
    }
    khs_by_key = {
        (normalized(row.get("student_id")), normalized(row.get("academic_period_id"))): row
        for row in current["khs"]
    }

    old_faculties = {
        normalized(row.get("FakultasID")): row
        for row in tables.get("fakultas", [])
        if meaningful(row.get("FakultasID"))
    }
    old_programs = {normalized(row.get("ProdiID")): row for row in tables.get("prodi", [])}
    old_courses = {normalized(row.get("MKID")): row for row in tables.get("mk", [])}
    old_classes = {normalized(row.get("JadwalID")): row for row in tables.get("jadwal", [])}
    old_curricula = {
        normalized(row.get("KurikulumID")): row for row in tables.get("kurikulum", [])
    }
    old_staff = {normalized(row.get("Login")): row for row in tables.get("pegawai", [])}
    old_students = {normalized(row.get("MhswID")): row for row in tables.get("mhsw", [])}

    live_students = {
        normalized(row.get("nim")): row for row in live.get("students", []) if normalized(row.get("nim"))
    }
    live_lecturers = {
        normalized(row.get("nidn")): row
        for row in live.get("lecturers_master", [])
        if normalized(row.get("nidn"))
    }
    live_assignments_by_class: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    live_registration_by_nidn: defaultdict[str, set[str]] = defaultdict(set)
    for row in live.get("lecturers", []):
        live_assignments_by_class[normalized(row.get("id_kelas_kuliah"))].append(row)
        if meaningful(row.get("id_registrasi_dosen")):
            live_registration_by_nidn[normalized(row.get("nidn"))].add(
                clean(row.get("id_registrasi_dosen"))
            )

    # NIDN pada OLD-SIAP tidak selalu terisi. Untuk dosen yang benar-benar
    # mengajar di kelas aktif, relasi kelas + nama yang sama persis menjadi
    # verifikasi kedua yang aman untuk mengambil ID dosen/registrasi Feeder.
    verified_staff_from_active_class: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for class_id, source in old_classes.items():
        if normalized(source.get("TahunID")) != period:
            continue
        lecturer_id = normalized(source.get("DosenID"))
        feeder_class_id = normalized(source.get("JadwalIDDIkti"))
        lecturer = users_by_id.get(lecturer_id, {})
        local_name = name_key(lecturer.get("name") or old_staff.get(lecturer_id, {}).get("Nama"))
        if not lecturer_id or not feeder_class_id or not local_name:
            continue
        matches = [
            row
            for row in live_assignments_by_class.get(feeder_class_id, [])
            if name_key(row.get("nama_dosen")) == local_name
        ]
        if len(matches) == 1:
            verified_staff_from_active_class[lecturer_id].append(matches[0])
    live_activities = {
        normalized(row.get("nim")): row
        for row in live.get("activities", [])
        if normalized(row.get("nim"))
    }

    agama_map = {
        normalized(row.get("Agama")): {
            "id": clean(row.get("AgamaID")),
            "name": clean(row.get("Nama")),
        }
        for row in tables.get("agama", [])
    }
    status_awal_map = {
        normalized(row.get("StatusAwalID")): {
            "id": clean(row.get("StatusAwal")),
            "name": clean(row.get("Nama")),
        }
        for row in tables.get("statusawal", [])
    }
    jalur_map = {
        normalized(row.get("JalurMasukID")): clean(row.get("Nama"))
        for row in tables.get("jalurmasuk", [])
    }
    pembiayaan_map = {
        normalized(row.get("JenisPembiayaanID")): clean(row.get("Nama"))
        for row in tables.get("jenispembiayaan", [])
    }
    jenis_mk_feeder_code = {
        normalized(row.get("JenisMKID")): clean(row.get("JenisMKIDDikti"))
        for row in tables.get("jenismk", [])
    }
    kelompok_mk_feeder_code = {
        normalized(row.get("KelompokMKID")): clean(
            row.get("KelompokIDDikti") or row.get("KemlopokIDDikti")
        )
        for row in tables.get("kelompokmk", [])
    }
    mode_kuliah_feeder_code = {
        normalized(row.get("ModeKuliahID")): clean(row.get("ModeKuliahKode"))
        for row in tables.get("modekuliah", [])
    }
    tinggal_map = {
        normalized(row.get("JenisTinggalID")): clean(row.get("Nama"))
        for row in tables.get("jenistinggal", [])
    }
    transport_map = {
        normalized(row.get("JenisTransportasiID")): clean(row.get("Nama"))
        for row in tables.get("jenistransportasi", [])
    }
    source_class_ids_by_student: defaultdict[str, set[str]] = defaultdict(set)
    for row in tables.get("krs", []):
        nim = normalized(row.get("MhswID"))
        class_id = clean(row.get("JadwalID"))
        if nim and meaningful(class_id):
            source_class_ids_by_student[nim].add(class_id)
    email_owners = {
        clean(row.get("email")).lower(): normalized(row.get("id"))
        for row in current["users"]
        if meaningful(row.get("email"))
    }
    generated_user_password_hash = ""

    def initial_password_hash() -> str:
        nonlocal generated_user_password_hash
        if not generated_user_password_hash:
            generated_user_password_hash = bcrypt.hashpw(
                secrets.token_urlsafe(32).encode("utf-8"), bcrypt.gensalt()
            ).decode("utf-8")
        return generated_user_password_hash

    def safe_migration_email(raw: Any, identity: str) -> str:
        candidate = clean(raw).lower()
        if "@" not in candidate or (
            candidate in email_owners and email_owners[candidate] != normalized(identity)
        ):
            candidate = f"migration+{re.sub(r'[^a-z0-9]', '', identity.lower())}@invalid.local"
        email_owners[candidate] = normalized(identity)
        return candidate

    # Fakultas tetap diproses sebagai master terpisah. Ketika hierarki
    # fakultas dimatikan, record ini tidak dihapus; migrator hanya menjaga
    # snapshot sumber agar dapat dipakai kembali bila organisasi diaktifkan.
    for faculty_id, source in old_faculties.items():
        local_id = clean(source.get("FakultasID"))
        values = {
            "id": local_id,
            "kode": clean(source.get("KodePTI") or source.get("KodeID")) or local_id,
            "nama": clean(source.get("Nama") or source.get("NamaIns")) or local_id,
            "status": "inactive" if normalized(source.get("NA")) == "Y" else "active",
            "migration_source": source_name,
            "migration_verified_at": generated_at,
            "created_at": generated_at,
        }
        updates.append(
            PlannedUpdate("fakultas", {"id": local_id}, values, upsert=True)
        )

    # Semester lama berisi satu baris per prodi. Satu kode menjadi satu periode baru.
    old_periods: dict[str, dict[str, Any]] = {}
    for row in tables.get("tahun", []):
        code = clean(row.get("TahunID"))
        if re.fullmatch(r"\d{4}[123]", code):
            old_periods.setdefault(code, row)
    for code, row in sorted(old_periods.items()):
        info = period_info(code)
        existing = periods_by_code.get(code)
        values = {
            "code": code,
            "name": clean(row.get("Nama")) or info["name"],
            "year": info["year"],
            "semester": info["semester"],
            "is_active": code == period,
            "status": "active" if code == period else "closed",
            "krs_start_at": clean(row.get("TglKRSMulai")),
            "krs_end_at": clean(row.get("TglKRSSelesai")),
            "lecture_start_at": clean(row.get("TglKuliahMulai")),
            "lecture_end_at": clean(row.get("TglKuliahSelesai")),
            "midterm_start_at": clean(row.get("TglUTSMulai")),
            "midterm_end_at": clean(row.get("TglUTSSelesai")),
            "final_start_at": clean(row.get("TglUASMulai")),
            "final_end_at": clean(row.get("TglUASSelesai")),
            "migration_source": source_name,
            "updated_at": generated_at,
        }
        if existing:
            updates.append(PlannedUpdate("academic_periods", {"id": existing["id"]}, values))
        else:
            values.update({"id": f"period_old_{code}", "created_at": generated_at})
            updates.append(
                PlannedUpdate("academic_periods", {"code": code}, values, upsert=True)
            )

    for program_id, source in old_programs.items():
        values = nonempty_fields(
            {
                "pddikti_program_code": source.get("ProdiDiktiID"),
                "feeder_program_id": source.get("IDProdiDiktiID"),
                "pddikti_education_level_id": source.get("JenjangDiktiID"),
                "accreditation": source.get("Akreditasi"),
                "decree_number": source.get("NoSKDikti"),
                "decree_date": source.get("TglSKDikti"),
                "fakultas_id": source.get("FakultasID"),
            }
        )
        values.update({"migration_source": source_name, "migration_verified_at": generated_at})
        target = programs_by_id.get(program_id)
        if target:
            updates.append(PlannedUpdate("programs", {"id": target["id"]}, values))
        else:
            program_code = clean(source.get("ProdiID"))
            values.update(
                {
                    "id": program_code,
                    "code": program_code,
                    "kode": program_code,
                    "name": clean(source.get("Nama")) or program_code,
                    "nama": clean(source.get("Nama")) or program_code,
                    "jenjang": clean(source.get("NamaJenjang")),
                    "status": "inactive" if normalized(source.get("NA")) == "Y" else "active",
                    "created_at": generated_at,
                }
            )
            updates.append(
                PlannedUpdate("programs", {"id": program_code}, values, upsert=True)
            )

    for curriculum_id, source in old_curricula.items():
        values = nonempty_fields(
            {
                "feeder_curriculum_id": source.get("KurikulumDiktiID"),
                "period_code": source.get("TahunID"),
                "total_sks": as_float(source.get("TotalSKS")),
            }
        )
        values.update({"migration_source": source_name, "migration_verified_at": generated_at})
        target = curricula_by_id.get(curriculum_id)
        if target:
            updates.append(PlannedUpdate("kurikulum", {"id": target["id"]}, values))
        else:
            local_id = clean(source.get("KurikulumID"))
            values.update(
                {
                    "id": local_id,
                    "kode": clean(source.get("KurikulumKode") or source.get("SKKurikulum"))
                    or f"KUR-{local_id}",
                    "nama": clean(source.get("Nama")) or f"Kurikulum {local_id}",
                    "prodi_id": clean(source.get("ProdiID")),
                    "tahun_mulai": clean(source.get("TahunID"))[:4],
                    "status": "inactive" if normalized(source.get("NA")) == "Y" else "active",
                    "created_at": generated_at,
                }
            )
            updates.append(
                PlannedUpdate("kurikulum", {"id": local_id}, values, upsert=True)
            )

    for course_id, source in old_courses.items():
        if not meaningful(source.get("Nama")) or not meaningful(source.get("MKKode") or course_id):
            continue
        values = nonempty_fields(
            {
                "feeder_course_id": source.get("MKIDDiktiID"),
                "feeder_curriculum_course_id": source.get("MKKurIDDiktiID"),
                "jenis_mk_id": source.get("JenisMKID"),
                "kelompok_mk_id": source.get("KelompokMKID"),
                "pddikti_course_type_code": jenis_mk_feeder_code.get(
                    normalized(source.get("JenisMKID")), ""
                ),
                "pddikti_course_group_code": kelompok_mk_feeder_code.get(
                    normalized(source.get("KelompokMKID")), ""
                ),
            }
        )
        values.update(
            {
                "sks_teori": as_float(source.get("SKSTatapMuka")),
                "sks_praktikum": as_float(source.get("SKSPraktikum")),
                "sks_prak_lapangan": as_float(source.get("SKSPraktekLap")),
                "sks_simulasi": as_float(source.get("SKSSimulasi")),
                "migration_source": source_name,
                "migration_verified_at": generated_at,
            }
        )
        target = courses_by_id.get(course_id)
        if target:
            updates.append(PlannedUpdate("courses", {"id": target["id"]}, values))
        else:
            local_id = clean(source.get("MKID"))
            code = clean(source.get("MKKode")) or local_id
            name = clean(source.get("Nama"))
            total_sks = as_float(source.get("SKS"), 3)
            values.update(
                {
                    "id": local_id,
                    "code": code,
                    "kode": code,
                    "name": name,
                    "nama": name,
                    "program_id": clean(source.get("ProdiID")),
                    "prodi_id": clean(source.get("ProdiID")),
                    "kurikulum_id": clean(source.get("KurikulumID")),
                    "credits": total_sks,
                    "sks": total_sks,
                    "total_sks": total_sks,
                    "semester_paket": as_int(source.get("Sesi"), 1),
                    "sifat": "Wajib" if normalized(source.get("Wajib") or "Y") == "Y" else "Pilihan",
                    "status": "inactive" if normalized(source.get("NA")) == "Y" else "active",
                    "created_at": generated_at,
                }
            )
            updates.append(
                PlannedUpdate("courses", {"id": local_id}, values, upsert=True)
            )

    for nim, source in old_students.items():
        target = users_by_id.get(nim)
        is_new_user = target is None
        target = target or {}
        agama = agama_map.get(normalized(source.get("Agama")), {})
        status_awal = status_awal_map.get(normalized(source.get("StatusAwalID")), {})
        feeder_current = live_students.get(nim, {})
        identifiers = {
            "id_mahasiswa": clean(source.get("MhswIDDikti")),
            "id_registrasi_mahasiswa": clean(source.get("MhswRegIDDikti")),
            "last_verified_id_mahasiswa": clean(feeder_current.get("id_mahasiswa")),
            "last_verified_id_registrasi": clean(
                feeder_current.get("id_registrasi_mahasiswa")
            ),
        }
        registration = {
            "semester_masuk": clean(source.get("TahunID")),
            "tanggal_masuk": clean(source.get("TglSKMasuk")),
            "jenis_pendaftaran_id": status_awal.get("id", ""),
            "jenis_pendaftaran": status_awal.get("name", ""),
            "jalur_masuk_id": clean(source.get("JalurMasukID")),
            "jalur_masuk": jalur_map.get(normalized(source.get("JalurMasukID")), ""),
            "jenis_pembiayaan_id": clean(source.get("JenisPembiayaanID")),
            "jenis_pembiayaan": pembiayaan_map.get(
                normalized(source.get("JenisPembiayaanID")), ""
            ),
            "status_mahasiswa_id": clean(source.get("StatusMhswID")),
            "program_id": clean(source.get("ProdiID")),
        }
        parent_data = {
            "ayah": {
                "nama": clean(source.get("NamaAyah")),
                "nik": clean(source.get("NIKAyah")),
                "tgl_lahir": clean(source.get("TanggalLahirAyah")),
                "pendidikan_id": clean(source.get("PendidikanAyah")),
                "pekerjaan_id": clean(source.get("PekerjaanAyah")),
                "penghasilan_id": clean(source.get("PenghasilanOrtuIDAyah")),
            },
            "ibu": {
                "nama": clean(source.get("NamaIbu")),
                "nik": clean(source.get("NIKIbu")),
                "tgl_lahir": clean(source.get("TanggalLahirIbu")),
                "pendidikan_id": clean(source.get("PendidikanIbu")),
                "pekerjaan_id": clean(source.get("PekerjaanIbu")),
                "penghasilan_id": clean(source.get("PenghasilanOrtuIDIbu")),
            },
            "wali": {
                "nama": clean(source.get("NamaWali")),
                "tgl_lahir": clean(source.get("TanggalLahirWali")),
                "pendidikan_id": clean(source.get("PendidikanWaliID")),
                "pekerjaan_id": clean(source.get("PekerjaanWali")),
                "penghasilan_id": clean(source.get("PenghasilanWaliID")),
            },
        }
        values = {
            "feeder_student_id": clean(source.get("MhswIDDikti")),
            "feeder_registration_id": clean(source.get("MhswRegIDDikti")),
            "pddikti_ids": identifiers,
            "registration": registration,
            "agama": agama.get("name") or target.get("agama") or "",
            "agama_id": agama.get("id", ""),
            "kewarganegaraan": clean(source.get("WargaNegara")),
            "rt": clean(source.get("RT")),
            "rw": clean(source.get("RW")),
            "dusun": clean(source.get("Dusun")),
            "kelurahan": clean(source.get("Kelurahan")),
            "kecamatan": clean(source.get("Kecamatan")),
            "kode_wilayah": clean(source.get("WilayahID")),
            "jenis_tinggal_id": clean(source.get("JenisTinggalID")),
            "jenis_tinggal": tinggal_map.get(normalized(source.get("JenisTinggalID")), ""),
            "transportasi_id": clean(source.get("TransportasiID")),
            "transportasi": transport_map.get(normalized(source.get("TransportasiID")), ""),
            "orang_tua": parent_data,
            "academic_status_code": clean(source.get("StatusMhswID")),
            "migration_source": source_name,
            "migration_verified_at": generated_at,
        }
        target_id = target.get("id") or clean(source.get("MhswID"))
        if is_new_user:
            program_id = clean(source.get("ProdiID"))
            program = old_programs.get(normalized(program_id), {})
            status_code = normalized(source.get("StatusMhswID") or "A")
            values.update(
                {
                    "id": target_id,
                    "role": "student",
                    "username": target_id.lower(),
                    "nim": target_id,
                    "nik": clean(source.get("NIK")),
                    "nisn": clean(source.get("NISN")),
                    "name": clean(source.get("Nama")) or target_id,
                    "email": safe_migration_email(source.get("Email"), target_id),
                    "whatsapp": clean(source.get("WA") or source.get("Handphone")),
                    "gender": clean(source.get("Kelamin") or source.get("KelaminID")),
                    "tempat_lahir": clean(source.get("TempatLahir")),
                    "tanggal_lahir": clean(source.get("TanggalLahir")),
                    "alamat": clean(source.get("Alamat")),
                    "kota": clean(source.get("Kota")),
                    "provinsi": clean(source.get("Propinsi")),
                    "kode_pos": clean(source.get("KodePos")),
                    "status": "active" if status_code == "A" else "inactive",
                    "class_ids": sorted(source_class_ids_by_student.get(nim, set())),
                    "rombel_id": (
                        f"RLM-{clean(source.get('KelasID'))}"
                        if meaningful(source.get("KelasID"))
                        else ""
                    ),
                    "prodi_id": program_id,
                    "prodi_name": clean(program.get("Nama")),
                    "prodi_kode": program_id,
                    "angkatan": clean(source.get("TahunID"))[:4],
                    "dosen_wali_id": clean(source.get("PenasehatAkademik")),
                    "password_hash": initial_password_hash(),
                    "must_reset_password": True,
                    "created_at": generated_at,
                    "last_login_at": "",
                }
            )
        updates.append(
            PlannedUpdate("users", {"id": target_id}, values, upsert=is_new_user)
        )

    for staff_id, source in old_staff.items():
        target = users_by_id.get(staff_id)
        is_new_user = target is None
        target = target or {}
        agama = agama_map.get(normalized(source.get("AgamaID")), {})
        feeder_current = live_lecturers.get(normalized(source.get("NIDN")), {})
        verified_rows = verified_staff_from_active_class.get(staff_id, [])
        if not feeder_current and verified_rows:
            feeder_current = verified_rows[0]
        feeder_registration_ids = set(
            live_registration_by_nidn.get(normalized(source.get("NIDN")), set())
        )
        feeder_registration_ids.update(
            clean(row.get("id_registrasi_dosen"))
            for row in verified_rows
            if meaningful(row.get("id_registrasi_dosen"))
        )
        values = {
            "feeder_lecturer_id": clean(feeder_current.get("id_dosen")),
            "feeder_registration_ids": sorted(feeder_registration_ids),
            "agama": agama.get("name") or target.get("agama") or "",
            "agama_id": agama.get("id", ""),
            "kewarganegaraan": clean(source.get("Negara")) or "ID",
            "rt": clean(source.get("RT")),
            "rw": clean(source.get("RW")),
            "dusun": clean(source.get("Dusun")),
            "kelurahan": clean(source.get("Kelurahan")),
            "kecamatan": clean(source.get("Kecamatan")),
            "kode_wilayah": clean(source.get("WilayahID")),
            "pangkat_golongan_id": clean(source.get("GolonganID")),
            "jabatan_dikti_id": clean(source.get("JabatanDiktiID")),
            "status_dosen_id": clean(source.get("StatusDosenID")),
            "migration_source": source_name,
            "migration_verified_at": generated_at,
        }
        target_id = target.get("id") or clean(source.get("Login"))
        if is_new_user:
            level_ids = {
                item.strip() for item in clean(source.get("LevelID")).split(",") if item.strip()
            }
            values.update(
                {
                    "id": target_id,
                    "role": "admin" if "1" in level_ids else "lecturer",
                    "username": target_id,
                    "employee_id": clean(source.get("NIDN")) or target_id,
                    "nidn": clean(source.get("NIDN")),
                    "nik": clean(source.get("KTP")),
                    "name": clean(source.get("Nama")) or target_id,
                    "email": safe_migration_email(source.get("Email"), target_id),
                    "whatsapp": clean(source.get("WA") or source.get("Handphone")),
                    "status": "inactive" if normalized(source.get("NA")) == "Y" else "active",
                    "prodi_id": clean(source.get("ProdiID")),
                    "homebase": clean(source.get("Homebase") or source.get("ProdiID")),
                    "gender": clean(source.get("KelaminID")),
                    "tempat_lahir": clean(source.get("TempatLahir")),
                    "tanggal_lahir": clean(source.get("TanggalLahir")),
                    "alamat": clean(source.get("Alamat")),
                    "kota": clean(source.get("Kota")),
                    "provinsi": clean(source.get("Propinsi")),
                    "kode_pos": clean(source.get("KodePos")),
                    "jabatan_akademik": clean(source.get("Jabatan")),
                    "keilmuan": clean(source.get("Keilmuan")),
                    "status_dosen": clean(source.get("StatusDosenID")),
                    "password_hash": initial_password_hash(),
                    "must_reset_password": True,
                    "created_at": generated_at,
                    "last_login_at": "",
                }
            )
        updates.append(
            PlannedUpdate("users", {"id": target_id}, values, upsert=is_new_user)
        )

    extra_lecturers: defaultdict[str, list[str]] = defaultdict(list)
    for row in tables.get("jadwaldosen", []):
        if meaningful(row.get("JadwalID")) and meaningful(row.get("DosenID")):
            extra_lecturers[normalized(row.get("JadwalID"))].append(clean(row.get("DosenID")))

    source_students_by_class: defaultdict[str, set[str]] = defaultdict(set)
    for row in tables.get("krs", []):
        class_id = normalized(row.get("JadwalID"))
        nim = clean(row.get("MhswID"))
        if class_id and nim:
            source_students_by_class[class_id].add(nim)
    old_rombel = {
        normalized(row.get("KelasID")): row for row in tables.get("kelas", [])
    }
    old_rooms = {
        normalized(row.get("RuangID")): row for row in tables.get("ruang", [])
    }

    def normalized_time(value: Any) -> str:
        parts = clean(value).split(":")
        if len(parts) < 2:
            return ""
        try:
            return f"{int(parts[0]):02d}:{int(parts[1]):02d}"
        except ValueError:
            return ""

    for class_id, source in old_classes.items():
        target = classes_by_id.get(class_id)
        is_new_class = target is None
        target = target or {}
        feeder_class_id = clean(source.get("JadwalIDDIkti"))
        source_lecturer_ids = [clean(source.get("DosenID")), *extra_lecturers.get(class_id, [])]
        local_teachers = []
        for lecturer_id in dict.fromkeys(item for item in source_lecturer_ids if item):
            lecturer = users_by_id.get(normalized(lecturer_id), {})
            local_teachers.append(
                {
                    "lecturer_id": lecturer_id,
                    "lecturer_name": lecturer.get("name") or old_staff.get(normalized(lecturer_id), {}).get("Nama", ""),
                    "nidn": lecturer.get("nidn") or old_staff.get(normalized(lecturer_id), {}).get("NIDN", ""),
                    "source": "old_siakad",
                }
            )
        feeder_teachers = []
        for row in live_assignments_by_class.get(normalized(feeder_class_id), []):
            feeder_teachers.append(
                {
                    "feeder_assignment_id": clean(row.get("id_aktivitas_mengajar")),
                    "feeder_registration_id": clean(row.get("id_registrasi_dosen")),
                    "feeder_lecturer_id": clean(row.get("id_dosen")),
                    "nidn": clean(row.get("nidn")),
                    "lecturer_name": clean(row.get("nama_dosen")),
                    "sks": as_float(row.get("sks_substansi_total")),
                    "planned_meetings": as_int(row.get("rencana_minggu_pertemuan")),
                    "actual_meetings": as_int(row.get("realisasi_minggu_pertemuan")),
                    "evaluation_type_id": clean(row.get("id_jenis_evaluasi")),
                    "source": "feeder_snapshot",
                }
            )
        course_source = old_courses.get(normalized(source.get("MKID")), {})
        course = courses_by_id.get(normalized(source.get("MKID")), {}) or {
            "id": clean(source.get("MKID")),
            "code": clean(source.get("MKKode") or course_source.get("MKKode")),
            "name": clean(source.get("Nama") or course_source.get("Nama")),
        }
        values = {
            "feeder_class_id": feeder_class_id,
            "period_code": clean(source.get("TahunID")),
            "course_code": clean(source.get("MKKode")) or course.get("code", ""),
            "sks": as_float(source.get("SKS")),
            "capacity": as_int(source.get("Kapasitas")),
            "mode_kuliah_id": clean(source.get("ModeKuliahID")),
            "mode_kuliah_code": mode_kuliah_feeder_code.get(
                normalized(source.get("ModeKuliahID")), ""
            ),
            "lingkup_kelas_id": clean(source.get("LingkupKelasID")),
            "feeder_class_name": clean(
                old_rombel.get(normalized(source.get("KelasID") or source.get("KelasEID")), {}).get("Nama")
                or source.get("NamaKelas_old")
            ),
            "tanggal_mulai_efektif": clean(source.get("TglMulai")),
            "tanggal_akhir_efektif": clean(source.get("TglSelesai")),
            "planned_meetings": as_int(source.get("RencanaKehadiran"), 16),
            "dosen_pengajar": feeder_teachers or local_teachers,
            "local_dosen_pengajar": local_teachers,
            "feeder_sync_status": "matched" if feeder_class_id else "not_synced",
            "feeder_last_error_code": clean(source.get("ErrorCode")),
            "feeder_last_error": clean(source.get("ErrorDesc")),
            "migration_source": source_name,
            "migration_verified_at": generated_at,
        }
        target_id = target.get("id") or clean(source.get("JadwalID"))
        if is_new_class:
            period_code = clean(source.get("TahunID"))
            info = period_info(period_code) if re.fullmatch(r"\d{4}[123]", period_code) else {
                "year": "",
                "semester": "",
            }
            rombel_source_id = normalized(source.get("KelasID") or source.get("KelasEID"))
            rombel = old_rombel.get(rombel_source_id, {})
            rombel_name = clean(rombel.get("Nama"))
            class_name = (
                f"Kelas {rombel_name.split('-')[-1].strip()}"
                if rombel_name
                else clean(source.get("NamaKelas_old"))
                or f"Kelas {target_id}"
            )
            day_value = clean(source.get("HariID"))
            day_number = {"0": 7, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6}.get(day_value)
            day_label = {1: "Senin", 2: "Selasa", 3: "Rabu", 4: "Kamis", 5: "Jumat", 6: "Sabtu", 7: "Minggu"}.get(day_number, "")
            starts_at = normalized_time(source.get("JamMulai"))
            ends_at = normalized_time(source.get("JamSelesai"))
            room_code = clean(source.get("RuangID"))
            room_exists = normalized(room_code) in old_rooms
            schedule_parts = []
            if day_label and starts_at and ends_at:
                schedule_parts.append(f"{day_label}, {starts_at}–{ends_at}")
            if room_exists:
                schedule_parts.append(f"Ruang {room_code}")
            values.update(
                {
                    "id": target_id,
                    "academic_year": info.get("year", ""),
                    "semester": info.get("semester", ""),
                    "course_id": clean(source.get("MKID")),
                    "course_name": clean(source.get("Nama")) or course.get("name", ""),
                    "name": class_name,
                    "schedule": " · ".join(schedule_parts),
                    "jadwal_hari": day_number,
                    "jadwal_jam_mulai": starts_at,
                    "jadwal_jam_selesai": ends_at,
                    "ruangan_id": room_code if room_exists else "",
                    "ruangan_kode": room_code if room_exists else "",
                    "class_code": f"KLS{target_id.zfill(4)}",
                    "lecturer_id": clean(source.get("DosenID")),
                    "lecturer_name": clean(old_staff.get(normalized(source.get("DosenID")), {}).get("Nama")),
                    "status": "active" if period_code == period else "ended",
                    "rombel_id": f"RLM-{rombel_source_id}" if rombel_source_id else "",
                    "student_ids": sorted(source_students_by_class.get(class_id, set())),
                    "program_id": clean(source.get("ProdiID")),
                    "program_name": clean(old_programs.get(normalized(source.get("ProdiID")), {}).get("Nama")),
                    "created_at": generated_at,
                }
            )
        updates.append(
            PlannedUpdate("classes", {"id": target_id}, values, upsert=is_new_class)
        )

    # Database lama adalah sumber operasional selama masa transisi. Seluruh
    # kelompok student+periode dilacak agar perubahan baru bisa dibedakan dari
    # perubahan lokal di SIAKAD baru.
    old_krs_grouped: defaultdict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in tables.get("krs", []):
        key = (normalized(row.get("MhswID")), normalized(row.get("TahunID")))
        if all(key):
            old_krs_grouped[key].append(row)

    old_khs_unique: dict[tuple[str, str], dict[str, Any]] = {}
    for row in tables.get("khs", []):
        key = (normalized(row.get("MhswID")), normalized(row.get("TahunID")))
        if all(key):
            old_khs_unique[key] = row

    changed_krs_documents = 0
    changed_khs_documents = 0
    for key, source_rows in old_krs_grouped.items():
        nim, period_code = key
        desired_courses = [
            {
                "class_id": clean(row.get("JadwalID")),
                "course_code": clean(row.get("MKKode")),
                "course_name": clean(row.get("Nama")),
                "sks": as_int(row.get("SKS")),
                "final_score": as_float(row.get("NilaiAkhir")),
                "grade_letter": clean(row.get("GradeNilai")),
                "grade_point": as_float(row.get("BobotNilai")),
            }
            for row in source_rows
        ]
        desired_values = Counter(
            (
                normalized(row.get("JadwalID")),
                *old_grade(row),
            )
            for row in source_rows
        )
        target_krs = krs_by_key.get(key)
        if target_krs:
            current_values = Counter(
                (
                    normalized(row.get("class_id")),
                    *new_grade(row, "final_score"),
                )
                for row in target_krs.get("courses") or []
            )
            krs_needs_write = current_values != desired_values
            krs_id = target_krs["id"]
            krs_values = {
                "courses": desired_courses,
                "migration_source": source_name,
                "migration_reconciled_at": generated_at,
            }
            krs_upsert = False
        else:
            krs_needs_write = True
            krs_id = f"krs_{clean(source_rows[0].get('MhswID'))}_{clean(source_rows[0].get('TahunID'))}"
            krs_values = {
                "id": krs_id,
                "student_id": clean(source_rows[0].get("MhswID")),
                "academic_period_id": clean(source_rows[0].get("TahunID")),
                "status": "approved",
                "courses": desired_courses,
                "migration_source": source_name,
                "migration_reconciled_at": generated_at,
                "created_at": generated_at,
            }
            krs_upsert = True
        if krs_needs_write:
            changed_krs_documents += 1
        updates.append(
            PlannedUpdate(
                "krs",
                {"id": krs_id},
                krs_values,
                upsert=krs_upsert,
                needs_write=krs_needs_write,
            )
        )

        target_khs = khs_by_key.get(key)
        if target_khs is None and nim not in old_students:
            # KRS yatim historis tanpa master mahasiswa tidak boleh membuat
            # dokumen KHS baru yang tidak dapat dimiliki user mana pun.
            continue
        summary_row = old_khs_unique.get(key, {})
        desired_grades = [
            {
                "course_code": clean(row.get("MKKode")),
                "course_name": clean(row.get("Nama")),
                "sks": as_int(row.get("SKS")),
                "score": as_float(row.get("NilaiAkhir")),
                "grade_letter": clean(row.get("GradeNilai")),
                "grade_point": as_float(row.get("BobotNilai")),
            }
            for row in source_rows
        ]
        desired_khs_values = Counter(
            (
                normalized(row.get("MKKode")),
                *old_grade(row),
                as_float(row.get("SKS")),
            )
            for row in source_rows
        )
        if target_khs:
            current_values = Counter(
                (
                    normalized(row.get("course_code")),
                    *new_grade(row, "score"),
                    as_float(row.get("sks")),
                )
                for row in target_khs.get("grades") or []
            )
            summary_values = {
                "ips": as_float(summary_row.get("IPS")),
                "ipk": as_float(summary_row.get("IPK")),
                "total_sks_semester": as_int(summary_row.get("SKS")),
                "total_sks_kumulatif": as_int(summary_row.get("TotalSKS")),
                "status_mhs": clean(summary_row.get("StatusMhswID")),
                "biaya_kuliah_smt": as_float(summary_row.get("Biaya")),
            }
            khs_needs_write = current_values != desired_khs_values or any(
                values_differ(target_khs.get(field), value)
                for field, value in summary_values.items()
            )
            khs_id = target_khs["id"]
            khs_values = {
                "grades": desired_grades,
                **summary_values,
                "migration_source": source_name,
                "migration_reconciled_at": generated_at,
            }
            khs_upsert = False
        else:
            khs_needs_write = True
            khs_id = clean(summary_row.get("KHSID")) or f"khs_{nim}_{period_code}"
            khs_values = {
                "id": khs_id,
                "student_id": clean(source_rows[0].get("MhswID")),
                "academic_period_id": clean(source_rows[0].get("TahunID")),
                "period_name": period_info(period_code)["name"] if re.fullmatch(r"\d{4}[123]", period_code) else period_code,
                "ips": as_float(summary_row.get("IPS")),
                "ipk": as_float(summary_row.get("IPK")),
                "total_sks_semester": as_int(summary_row.get("SKS")),
                "total_sks_kumulatif": as_int(summary_row.get("TotalSKS")),
                "status_mhs": clean(summary_row.get("StatusMhswID")),
                "biaya_kuliah_smt": as_float(summary_row.get("Biaya")),
                "grades": desired_grades,
                "migration_source": source_name,
                "migration_reconciled_at": generated_at,
                "created_at": generated_at,
            }
            khs_upsert = True
        if khs_needs_write:
            changed_khs_documents += 1
        updates.append(
            PlannedUpdate(
                "khs",
                {"id": khs_id},
                khs_values,
                upsert=khs_upsert,
                needs_write=khs_needs_write,
            )
        )

    for key, summary_row in old_khs_unique.items():
        if key in old_krs_grouped:
            continue
        nim, period_code = key
        if nim not in old_students:
            continue
        target_khs = khs_by_key.get(key)
        summary_values = {
            "ips": as_float(summary_row.get("IPS")),
            "ipk": as_float(summary_row.get("IPK")),
            "total_sks_semester": as_int(summary_row.get("SKS")),
            "total_sks_kumulatif": as_int(summary_row.get("TotalSKS")),
            "status_mhs": clean(summary_row.get("StatusMhswID")),
            "biaya_kuliah_smt": as_float(summary_row.get("Biaya")),
        }
        if target_khs:
            khs_id = target_khs["id"]
            values = {
                **summary_values,
                "migration_source": source_name,
                "migration_reconciled_at": generated_at,
            }
            needs_write = any(
                values_differ(target_khs.get(field), value)
                for field, value in summary_values.items()
            )
            upsert = False
        else:
            khs_id = clean(summary_row.get("KHSID")) or f"khs_{nim}_{period_code}"
            values = {
                "id": khs_id,
                "student_id": clean(summary_row.get("MhswID")),
                "academic_period_id": clean(summary_row.get("TahunID")),
                "period_name": period_info(period_code)["name"] if re.fullmatch(r"\d{4}[123]", period_code) else period_code,
                **summary_values,
                "grades": [],
                "migration_source": source_name,
                "migration_reconciled_at": generated_at,
                "created_at": generated_at,
            }
            needs_write = True
            upsert = True
        if needs_write:
            changed_khs_documents += 1
        updates.append(
            PlannedUpdate(
                "khs",
                {"id": khs_id},
                values,
                upsert=upsert,
                needs_write=needs_write,
            )
        )

    for (nim, period_code), row in old_khs_unique.items():
        user = users_by_id.get(nim, {})
        feeder_snapshot = live_activities.get(nim, {}) if period_code == period else {}
        activity_id = f"AKTMHS_{period_code}_{nim}"
        values = {
            "id": activity_id,
            "student_id": user.get("id") or clean(row.get("MhswID")),
            "nim": clean(row.get("MhswID")),
            "student_name": user.get("name", ""),
            "period_code": clean(row.get("TahunID")),
            "status_mhs": clean(row.get("StatusMhswID")),
            "ips": as_float(row.get("IPS")),
            "ipk": as_float(row.get("IPK")),
            "sks_smt": as_float(row.get("SKS")),
            "sks_total": as_float(row.get("TotalSKS")),
            "biaya_kuliah_smt": as_float(row.get("Biaya")),
            "jenis_pembiayaan_id": clean(
                (user.get("registration") or {}).get("jenis_pembiayaan_id")
            ),
            "feeder_snapshot": feeder_snapshot,
            "migration_source": source_name,
            "updated_at": generated_at,
        }
        updates.append(
            PlannedUpdate("aktivitas_mahasiswa", {"id": activity_id}, values, upsert=True)
        )

    for row in tables.get("prosesstatusmhsw", []):
        history_id = f"OLD_STATUS_{clean(row.get('ProsesStatusMhswID'))}"
        values = {
            "id": history_id,
            "student_id": clean(row.get("MhswID")),
            "period_code": clean(row.get("TahunID")),
            "previous_status": clean(row.get("StatusMhswLama")),
            "new_status": clean(row.get("StatusMhswID")),
            "effective_date": clean(row.get("Tanggal")),
            "decree_number": clean(row.get("SK")),
            "decree_date": clean(row.get("TglSK")),
            "feeder_status_change_id": clean(row.get("ProsesStatusMhswIDDikti")),
            "feeder_error_code": clean(row.get("ErrorCode")),
            "feeder_error": clean(row.get("ErrorDesc")),
            "migration_source": source_name,
            "updated_at": generated_at,
        }
        updates.append(
            PlannedUpdate("student_status_history", {"id": history_id}, values, upsert=True)
        )

    reference_specs = [
        ("agama", "Agama", "AgamaID", "Nama"),
        ("jenis_pendaftaran", "StatusAwalID", "StatusAwal", "Nama"),
        ("jalur_masuk", "JalurMasukID", "JalurMasukID", "Nama"),
        ("jenis_pembiayaan", "JenisPembiayaanID", "JenisPembiayaanID", "Nama"),
        ("jenis_tinggal", "JenisTinggalID", "JenisTinggalID", "Nama"),
        ("transportasi", "JenisTransportasiID", "JenisTransportasiID", "Nama"),
        ("jenis_keluar", "JenisKeluarID", "JenisKeluarID", "Nama"),
    ]
    table_by_category = {
        "agama": "agama",
        "jenis_pendaftaran": "statusawal",
        "jalur_masuk": "jalurmasuk",
        "jenis_pembiayaan": "jenispembiayaan",
        "jenis_tinggal": "jenistinggal",
        "transportasi": "jenistransportasi",
        "jenis_keluar": "jeniskeluar",
    }
    for category, source_field, feeder_field, name_field in reference_specs:
        for row in tables.get(table_by_category[category], []):
            source_code = clean(row.get(source_field))
            if not source_code:
                continue
            reference_id = f"{category}:{source_code}"
            values = {
                "id": reference_id,
                "category": category,
                "source_code": source_code,
                "feeder_code": clean(row.get(feeder_field)),
                "name": clean(row.get(name_field)),
                "is_active": normalized(row.get("NA")) != "Y",
                "migration_source": source_name,
                "updated_at": generated_at,
            }
            updates.append(
                PlannedUpdate("pddikti_reference_mappings", {"id": reference_id}, values, upsert=True)
            )

    grades_by_program: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in tables.get("nilai", []):
        program_id = clean(row.get("ProdiID"))
        if not program_id:
            continue
        grades_by_program[program_id].append(
            {
                "letter": clean(row.get("Nama")),
                "weight": as_float(row.get("Bobot")),
                "minimum": as_float(row.get("NilaiMin")),
                "maximum": as_float(row.get("NilaiMax")),
                "passes": normalized(row.get("Lulus")) == "Y",
                "counts_for_gpa": normalized(row.get("HitungIPK")) == "Y",
            }
        )
    for program_id, scales in grades_by_program.items():
        scale_id = f"GRADE_SCALE_{program_id}"
        values = {
            "id": scale_id,
            "program_id": program_id,
            "feeder_program_id": old_programs.get(normalized(program_id), {}).get(
                "IDProdiDiktiID", ""
            ),
            "scales": sorted(scales, key=lambda item: item["minimum"], reverse=True),
            "migration_source": source_name,
            "updated_at": generated_at,
        }
        updates.append(
            PlannedUpdate("pddikti_grade_scales", {"id": scale_id}, values, upsert=True)
        )

    feeder_program_to_local = {
        normalized(row.get("IDProdiDiktiID")): clean(row.get("ProdiID"))
        for row in tables.get("prodi", [])
        if meaningful(row.get("IDProdiDiktiID"))
    }
    for row in read_csv_rows(DAYA_TAMPUNG_CSV):
        if clean(row.get("soft_delete")) == "1":
            continue
        period_code = clean(row.get("id_smt"))
        feeder_program_id = clean(row.get("id_sms"))
        capacity_id = f"CAPACITY_{period_code}_{feeder_program_id}"
        values = {
            "id": capacity_id,
            "period_code": period_code,
            "program_id": feeder_program_to_local.get(normalized(feeder_program_id), ""),
            "feeder_program_id": feeder_program_id,
            "target_new_students": as_int(row.get("target_mhs_baru")),
            "selection_candidates": as_int(row.get("calon_ikut_seleksi")),
            "selection_passed": as_int(row.get("calon_lulus_seleksi")),
            "registered_students": as_int(row.get("daftar_sbg_mhs")),
            "withdrawn_students": as_int(row.get("pst_undur_diri")),
            "lecture_start_date": clean(row.get("tgl_awal_kul")),
            "lecture_end_date": clean(row.get("tgl_akhir_kul")),
            "lecture_weeks": as_int(row.get("jml_mgu_kul")),
            "migration_source": "dump_feeder/daya_tampung.csv",
            "updated_at": generated_at,
        }
        updates.append(
            PlannedUpdate("pddikti_capacity", {"id": capacity_id}, values, upsert=True)
        )

    old_student_ids = set(old_students)
    feeder_student_ids = set(live_students)
    report = {
        "planned_updates": Counter(
            update.collection for update in updates if update.needs_write
        ),
        "tracked_records": Counter(update.collection for update in updates),
        "changed_krs_documents": changed_krs_documents,
        "changed_khs_documents": changed_khs_documents,
        "old_students": len(old_students),
        "new_students": sum(row.get("role") == "student" for row in current["users"]),
        "feeder_students": len(live_students),
        "students_old_only_vs_feeder": sorted(old_student_ids - feeder_student_ids),
        "students_feeder_only_vs_old": sorted(feeder_student_ids - old_student_ids),
        "student_feeder_ids_available": sum(
            meaningful(row.get("MhswIDDikti")) for row in old_students.values()
        ),
        "student_registration_ids_available": sum(
            meaningful(row.get("MhswRegIDDikti")) for row in old_students.values()
        ),
        "course_feeder_ids_available": sum(
            meaningful(row.get("MKIDDiktiID")) for row in old_courses.values()
        ),
        "class_feeder_ids_available": sum(
            meaningful(row.get("JadwalIDDIkti")) for row in old_classes.values()
        ),
        "active_class_feeder_ids_available": sum(
            normalized(row.get("TahunID")) == period and meaningful(row.get("JadwalIDDIkti"))
            for row in old_classes.values()
        ),
    }
    return updates, report


async def execute_plan(db: PostgresDatabase, updates: list[PlannedUpdate]) -> Counter[str]:
    results: Counter[str] = Counter()
    for operation in updates:
        if not operation.needs_write:
            continue
        result = await getattr(db, operation.collection).update_one(
            operation.query,
            {"$set": operation.values},
            upsert=operation.upsert,
        )
        results[f"{operation.collection}.matched"] += result.matched_count
        results[f"{operation.collection}.modified"] += result.modified_count
        if result.upserted_id is not None:
            results[f"{operation.collection}.upserted"] += 1
    return results


async def run(args: argparse.Namespace) -> None:
    old_path = Path(args.file).expanduser().resolve()
    if not old_path.exists():
        raise SystemExit(f"File sumber tidak ditemukan: {old_path}")
    if not re.fullmatch(r"\d{4}[123]", args.period):
        raise SystemExit("Kode periode harus 5 digit, misalnya 20252")

    print(f"Membaca OLD-SIAP: {old_path}")
    tables = parse_old_tables(old_path)
    print(f"Tabel sumber: {len(tables)}")

    db = PostgresDatabase(os.environ["DATABASE_URL"])
    await db.connect()
    try:
        print("Membaca snapshot Feeder (read-only)...")
        live = await fetch_live_feeder(db, args.period)
        collection_names = [
            "users",
            "programs",
            "courses",
            "classes",
            "kurikulum",
            "academic_periods",
            "krs",
            "khs",
        ]
        current = {
            name: await load_collection(db, name)
            for name in collection_names
        }
        grade_summary = build_three_way_grade_summary(
            tables, current["krs"], live["grades"], args.period
        )
        updates, report = build_plan(
            tables=tables,
            current=current,
            live=live,
            period=args.period,
            source_name=old_path.name,
        )

        print("\n=== AUDIT TIGA ARAH NILAI ===")
        for key, value in sorted(grade_summary.items()):
            print(f"  {key}: {value}")
        print("\n=== KELENGKAPAN IDENTIFIER SUMBER ===")
        for key in [
            "student_feeder_ids_available",
            "student_registration_ids_available",
            "course_feeder_ids_available",
            "class_feeder_ids_available",
            "active_class_feeder_ids_available",
        ]:
            print(f"  {key}: {report[key]}")
        print("\n=== RENCANA BACKFILL ===")
        for collection, count in sorted(report["planned_updates"].items()):
            print(f"  {collection}: {count}")
        print(f"  Dokumen KRS dengan nilai berbeda: {report['changed_krs_documents']}")
        print(f"  Dokumen KHS dengan nilai berbeda: {report['changed_khs_documents']}")
        print(
            "  Mahasiswa hanya di Feeder (tidak otomatis diimpor): "
            f"{len(report['students_feeder_only_vs_old'])}"
        )
        print(
            "  Mahasiswa hanya di OLD/SIAKAD (perlu tindak lanjut Feeder): "
            f"{len(report['students_old_only_vs_feeder'])}"
        )

        if not args.execute:
            print("\nDRY-RUN selesai. Tidak ada database yang diubah.")
            return

        print("\nMenjalankan backfill ke PostgreSQL SIAKAD baru...")
        result = await execute_plan(db, updates)
        print("\n=== HASIL EKSEKUSI ===")
        for key, value in sorted(result.items()):
            if value:
                print(f"  {key}: {value}")
        print("\nBackfill selesai. Neo Feeder tidak diubah.")
    finally:
        await db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", default=str(DEFAULT_OLD_JSON), help="Path export JSON OLD-SIAP")
    parser.add_argument("--period", default="20252", help="Kode semester PDDikti")
    parser.add_argument("--execute", action="store_true", help="Tulis hasil backfill ke PostgreSQL")
    args = parser.parse_args()
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
