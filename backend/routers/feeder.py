"""Router FastAPI untuk Integrasi PDDikti Neo Feeder Web Service Protocol."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import tempfile
import time
import httpx
from collections import Counter, defaultdict
from typing import Any, Dict, Literal, Optional
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel

from postgres_database import PostgresDatabase

router = APIRouter(prefix="/api/feeder", tags=["PDDikti Feeder Integration"])


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
        raise HTTPException(status_code=403, detail="Hanya admin kampus yang diizinkan")
    return user


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class FeederConfigInput(BaseModel):
    feeder_url: str
    feeder_path: str = "/ws/sandbox2.php"
    username: str
    password: Optional[str] = None
    mode: Literal["live", "sandbox"] = "sandbox"
    auto_sync: bool = False


class OldImportApplyInput(BaseModel):
    preview_id: str


class FeederSyncExecuteInput(BaseModel):
    preview_id: str
    operation_ids: list[str]
    approval: Literal["ready", "use_siakad"] = "ready"
    confirm_sandbox: Literal[
        "EXECUTE_SANDBOX", "APPROVE_SIAKAD_OVER_FEEDER"
    ]
    stop_on_error: bool = True


class FeederSyncResolutionInput(BaseModel):
    preview_id: str
    operation_ids: list[str]
    decision: Literal["keep_feeder", "use_feeder"]
    confirm_review: Literal["RESOLVE_SYNC_REVIEW"]


DEFAULT_FEEDER_CONFIG = {
    "feeder_url": "http://127.0.0.1:8100",
    "feeder_path": "/ws/sandbox2.php",
    "username": "",
    "password": "",
    "mode": "sandbox",
    "auto_sync": False,
    "last_status": "not_configured",
    "last_connected_at": None,
    "feeder_info": None,
}


def normalize_feeder_url(value: str) -> str:
    feeder_url = str(value or "").strip().rstrip("/")
    parsed = urlsplit(feeder_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(
            status_code=422,
            detail="Host Feeder harus berupa URL HTTP/HTTPS yang valid, misalnya http://192.168.1.10:8100",
        )
    return feeder_url


def normalize_feeder_path(value: str, mode: str) -> str:
    feeder_path = str(value or "").strip()
    if not feeder_path.startswith("/"):
        feeder_path = f"/{feeder_path}"

    # Mode harus benar-benar memilih endpoint sandbox/live jika pengguna
    # masih memakai salah satu path standar Neo Feeder.
    if feeder_path in {"/", "/ws/live2.php", "/ws/sandbox2.php"}:
        return "/ws/sandbox2.php" if mode == "sandbox" else "/ws/live2.php"
    return feeder_path


def feeder_response_data(payload: Dict[str, Any]) -> Any:
    """Support response envelopes used by old and current Neo Feeder builds."""
    result = payload.get("result")
    if result not in (None, "", [], {}):
        return result
    return payload.get("data", result if result is not None else {})


def feeder_response_token(payload: Dict[str, Any]) -> str:
    data = feeder_response_data(payload)
    if isinstance(data, dict):
        return str(data.get("token") or data.get("access_token") or "")
    return ""


def masked_token(token: str) -> str:
    if len(token) <= 8:
        return "***"
    return f"{token[:4]}...{token[-4:]}"


def normalized_key(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip()).upper()


def semester_identity(period_code: str) -> Dict[str, str]:
    year = int(period_code[:4])
    semester = {"1": "Ganjil", "2": "Genap", "3": "Pendek"}.get(period_code[4], "")
    return {
        "code": period_code,
        "academic_year": f"{year}/{year + 1}",
        "semester": semester,
        "label": f"{year}/{year + 1} {semester}".strip(),
    }


def values_differ(left: Any, right: Any, tolerance: float = 0.01) -> bool:
    try:
        return abs(float(left or 0) - float(right or 0)) > tolerance
    except (TypeError, ValueError):
        return normalized_key(left) != normalized_key(right)


def operation_state_hash(operation: Dict[str, Any]) -> str:
    """Fingerprint nilai konflik agar keputusan lama batal saat data berubah."""
    managed = {
        key: operation.get(key)
        for key in ("category", "action", "identity", "siakad", "feeder")
    }
    encoded = json.dumps(
        managed, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str
    )
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def recalculate_preview_summary(result: Dict[str, Any]) -> None:
    statuses = Counter(item.get("status") for item in result.get("operations") or [])
    categories: defaultdict[str, Counter[str]] = defaultdict(Counter)
    for operation in result.get("operations") or []:
        category = str(operation.get("category") or "")
        status = str(operation.get("status") or "")
        categories[category][status] += 1
        categories[category]["total"] += 1
    result["summary"] = {
        "total": len(result.get("operations") or []),
        "ready": statuses["ready"],
        "review": statuses["review"],
        "blocked": statuses["blocked"],
        "resolved": statuses["resolved"],
        "by_category": {key: dict(value) for key, value in categories.items()},
    }


def apply_saved_resolutions(
    result: Dict[str, Any], resolutions: list[Dict[str, Any]]
) -> None:
    """Tandai konflik yang diputuskan mempertahankan Feeder selama nilainya sama."""
    resolution_by_operation = {
        str(item.get("operation_id") or ""): item
        for item in resolutions
        if item.get("decision") == "keep_feeder"
    }
    for operation in result.get("operations") or []:
        if operation.get("status") != "review":
            continue
        resolution = resolution_by_operation.get(str(operation.get("id") or ""))
        if not resolution:
            continue
        if resolution.get("state_hash") != operation_state_hash(operation):
            continue
        operation["status"] = "resolved"
        operation["resolution"] = {
            "decision": "keep_feeder",
            "resolved_at": resolution.get("resolved_at"),
            "resolved_by": resolution.get("resolved_by"),
        }
        operation["reason"] = "Diselesaikan: data Feeder dipertahankan oleh admin"
    recalculate_preview_summary(result)


def class_matches_period(document: Dict[str, Any], period: Dict[str, str], period_ids: set[str]) -> bool:
    direct_values = {
        str(document.get(key) or "")
        for key in ("period_code", "academic_period_id", "tahun_ajaran_id", "id_semester")
    }
    if direct_values & period_ids:
        return True
    academic_year = str(document.get("academic_year") or document.get("tahun_ajaran_label") or "")
    semester = str(document.get("semester") or document.get("tahun_ajaran_label") or "")
    return period["academic_year"] in academic_year and period["semester"].lower() in semester.lower()


async def fetch_feeder_rows(
    client: httpx.AsyncClient,
    endpoint: str,
    token: str,
    action: str,
    filter_value: str,
    page_size: int = 500,
) -> list[Dict[str, Any]]:
    rows: list[Dict[str, Any]] = []
    offset = 0
    while True:
        response = await client.post(
            endpoint,
            json={
                "act": action,
                "token": token,
                "filter": filter_value,
                "order": "",
                "limit": str(page_size),
                "offset": str(offset),
            },
        )
        if response.status_code != 200:
            raise RuntimeError(f"{action} gagal dengan HTTP {response.status_code}")
        payload = response.json()
        if payload.get("error_code") != 0:
            raise RuntimeError(f"{action}: {payload.get('error_desc') or 'respons Feeder gagal'}")
        page = feeder_response_data(payload)
        if not isinstance(page, list):
            page = []
        rows.extend(item for item in page if isinstance(item, dict))
        if len(page) < page_size:
            return rows
        offset += page_size
        if offset >= 10000:
            raise RuntimeError(f"{action}: jumlah data melebihi batas audit 10.000 baris")


def build_semester_reconciliation(
    period: Dict[str, str],
    period_ids: set[str],
    feeder_classes: list[Dict[str, Any]],
    feeder_grades: list[Dict[str, Any]],
    feeder_lecturers: list[Dict[str, Any]],
    feeder_activities: list[Dict[str, Any]],
    local_users: list[Dict[str, Any]],
    local_courses: list[Dict[str, Any]],
    all_local_classes: list[Dict[str, Any]],
    all_local_khs: list[Dict[str, Any]],
) -> Dict[str, Any]:
    user_by_id = {str(item.get("id") or ""): item for item in local_users}
    course_by_id = {str(item.get("id") or ""): item for item in local_courses}
    nim_by_user_id = {
        user_id: normalized_key(item.get("nim") or item.get("username"))
        for user_id, item in user_by_id.items()
    }

    local_classes = [
        item for item in all_local_classes if class_matches_period(item, period, period_ids)
    ]
    local_class_meta: Dict[str, Dict[str, Any]] = {}
    for item in local_classes:
        class_id = str(item.get("id") or "")
        course = course_by_id.get(str(item.get("course_id") or ""), {})
        local_class_meta[class_id] = {
            "id": class_id,
            "feeder_class_id": str(item.get("feeder_class_id") or ""),
            "course_code": normalized_key(item.get("course_code") or course.get("code") or course.get("kode")),
            "course_name": normalized_key(item.get("course_name") or course.get("name") or course.get("nama")),
            "class_name": str(item.get("name") or item.get("class_code") or ""),
            "class_code": str(item.get("class_code") or item.get("code") or ""),
            "lecturer_id": str(item.get("lecturer_id") or ""),
            "student_nims": {
                nim_by_user_id.get(str(student_id), "")
                for student_id in item.get("student_ids") or []
            }
            - {""},
        }

    feeder_class_meta: Dict[str, Dict[str, Any]] = {
        str(item.get("id_kelas_kuliah") or ""): {
            "id": str(item.get("id_kelas_kuliah") or ""),
            "course_code": normalized_key(item.get("kode_mata_kuliah")),
            "course_name": normalized_key(item.get("nama_mata_kuliah")),
            "class_name": str(item.get("nama_kelas_kuliah") or ""),
            "program_name": str(item.get("nama_program_studi") or ""),
            "student_nims": set(),
        }
        for item in feeder_classes
        if item.get("id_kelas_kuliah")
    }
    for item in feeder_grades:
        class_id = str(item.get("id_kelas_kuliah") or "")
        if class_id in feeder_class_meta:
            nim = normalized_key(item.get("nim"))
            if nim:
                feeder_class_meta[class_id]["student_nims"].add(nim)

    class_map: Dict[str, str] = {}
    mapping_basis: Dict[str, str] = {}
    used_local_ids: set[str] = set()

    # ID kelas Feeder yang telah dimigrasikan dari OLD-SIAP adalah identitas
    # paling kuat. Pencocokan kode/nama/peserta hanya menjadi fallback untuk
    # kelas yang memang belum mempunyai identifier tersebut.
    for local_id, local_class in local_class_meta.items():
        feeder_id = local_class["feeder_class_id"]
        if feeder_id and feeder_id in feeder_class_meta and feeder_id not in class_map:
            class_map[feeder_id] = local_id
            mapping_basis[feeder_id] = "feeder_id"
            used_local_ids.add(local_id)

    candidates = []
    for feeder_id, feeder_class in feeder_class_meta.items():
        for local_id, local_class in local_class_meta.items():
            same_code = bool(feeder_class["course_code"] and feeder_class["course_code"] == local_class["course_code"])
            same_name = bool(feeder_class["course_name"] and feeder_class["course_name"] == local_class["course_name"])
            if not same_code and not same_name:
                continue
            feeder_nims = feeder_class["student_nims"]
            local_nims = local_class["student_nims"]
            union = feeder_nims | local_nims
            overlap = len(feeder_nims & local_nims)
            similarity = overlap / len(union) if union else 1.0
            if union and similarity < 0.5:
                continue
            candidates.append(
                (
                    int(same_code),
                    int(same_name),
                    similarity,
                    overlap,
                    -abs(len(feeder_nims) - len(local_nims)),
                    feeder_id,
                    local_id,
                    "course_code" if same_code else "course_name",
                )
            )
    candidates.sort(reverse=True)

    for _, _, _similarity, _overlap, _, feeder_id, local_id, basis in candidates:
        if feeder_id in class_map or local_id in used_local_ids:
            continue
        class_map[feeder_id] = local_id
        mapping_basis[feeder_id] = basis
        used_local_ids.add(local_id)

    class_mappings = []
    participant_issues = []
    exact_class_count = 0
    for feeder_id, local_id in sorted(class_map.items()):
        feeder_class = feeder_class_meta[feeder_id]
        local_class = local_class_meta[local_id]
        only_feeder = sorted(feeder_class["student_nims"] - local_class["student_nims"])
        only_siakad = sorted(local_class["student_nims"] - feeder_class["student_nims"])
        if not only_feeder and not only_siakad:
            exact_class_count += 1
        class_mappings.append(
            {
                "feeder_class_id": feeder_id,
                "siakad_class_id": local_id,
                "course_code_feeder": feeder_class["course_code"],
                "course_code_siakad": local_class["course_code"],
                "course_name": feeder_class["course_name"] or local_class["course_name"],
                "class_name_feeder": feeder_class["class_name"],
                "class_name_siakad": local_class["class_name"],
                "mapping_basis": mapping_basis[feeder_id],
                "feeder_students": len(feeder_class["student_nims"]),
                "siakad_students": len(local_class["student_nims"]),
                "status": "match" if not only_feeder and not only_siakad else "different",
            }
        )
        participant_issues.extend(
            {
                "side": "feeder_only",
                "nim": nim,
                "course_code": feeder_class["course_code"],
                "class_feeder": feeder_class["class_name"],
                "class_siakad": local_class["class_name"],
            }
            for nim in only_feeder
        )
        participant_issues.extend(
            {
                "side": "siakad_only",
                "nim": nim,
                "course_code": local_class["course_code"],
                "class_feeder": feeder_class["class_name"],
                "class_siakad": local_class["class_name"],
            }
            for nim in only_siakad
        )

    feeder_only_classes = [
        {
            "side": "feeder_only",
            "id": class_id,
            "course_code": item["course_code"],
            "course_name": item["course_name"],
            "class_name": item["class_name"],
            "students": len(item["student_nims"]),
        }
        for class_id, item in feeder_class_meta.items()
        if class_id not in class_map
    ]
    siakad_only_classes = [
        {
            "side": "siakad_only",
            "id": class_id,
            "course_code": item["course_code"],
            "course_name": item["course_name"],
            "class_name": item["class_name"],
            "students": len(item["student_nims"]),
        }
        for class_id, item in local_class_meta.items()
        if class_id not in used_local_ids
    ]
    for item in feeder_only_classes:
        participant_issues.extend(
            {
                "side": "feeder_only",
                "nim": nim,
                "course_code": item["course_code"],
                "class_feeder": item["class_name"],
                "class_siakad": "",
            }
            for nim in feeder_class_meta[item["id"]]["student_nims"]
        )
    for item in siakad_only_classes:
        participant_issues.extend(
            {
                "side": "siakad_only",
                "nim": nim,
                "course_code": item["course_code"],
                "class_feeder": "",
                "class_siakad": item["class_name"],
            }
            for nim in local_class_meta[item["id"]]["student_nims"]
        )

    local_khs = [
        item for item in all_local_khs if str(item.get("academic_period_id") or "") in period_ids
    ]
    local_grade_by_key: defaultdict[tuple[str, str], list[Dict[str, Any]]] = defaultdict(list)
    local_activity_by_nim: Dict[str, Dict[str, Any]] = {}
    local_grade_row_count = 0
    for document in local_khs:
        student_id = str(document.get("student_id") or "")
        nim = nim_by_user_id.get(student_id) or normalized_key(student_id)
        if not nim:
            continue
        local_activity_by_nim[nim] = document
        for grade in document.get("grades") or []:
            course_code = normalized_key(grade.get("course_code"))
            if course_code:
                local_grade_row_count += 1
                local_grade_by_key[(nim, course_code)].append(grade)

    grade_issues = []
    grade_field_mismatches: Counter[str] = Counter()
    matched_grade_rows = 0
    feeder_grade_by_key: defaultdict[
        tuple[str, str], list[Dict[str, Any]]
    ] = defaultdict(list)
    for grade in feeder_grades:
        feeder_class_id = str(grade.get("id_kelas_kuliah") or "")
        nim = normalized_key(grade.get("nim"))
        mapped_local_id = class_map.get(feeder_class_id)
        local_course_code = (
            local_class_meta[mapped_local_id]["course_code"]
            if mapped_local_id in local_class_meta
            else normalized_key(grade.get("kode_mata_kuliah"))
        )
        feeder_grade_by_key[(nim, local_course_code)].append(grade)

    def grade_differences(local_grade: Dict[str, Any], feeder_grade: Dict[str, Any]) -> list[str]:
        fields = []
        if normalized_key(local_grade.get("grade_letter")) != normalized_key(
            feeder_grade.get("nilai_huruf")
        ):
            fields.append("nilai_huruf")
        if values_differ(local_grade.get("score"), feeder_grade.get("nilai_angka")):
            fields.append("nilai_angka")
        if values_differ(local_grade.get("grade_point"), feeder_grade.get("nilai_indeks")):
            fields.append("nilai_indeks")
        return fields

    for nim, course_code in sorted(set(local_grade_by_key) | set(feeder_grade_by_key)):
        local_remaining = list(local_grade_by_key.get((nim, course_code), []))
        feeder_remaining = list(feeder_grade_by_key.get((nim, course_code), []))
        while local_remaining and feeder_remaining:
            feeder_grade = feeder_remaining.pop(0)
            local_index = min(
                range(len(local_remaining)),
                key=lambda index: len(grade_differences(local_remaining[index], feeder_grade)),
            )
            local_grade = local_remaining.pop(local_index)
            different_fields = grade_differences(local_grade, feeder_grade)
            matched_grade_rows += 1
            if different_fields:
                grade_field_mismatches.update(different_fields)
                grade_issues.append(
                    {
                        "status": "different",
                        "nim": nim,
                        "course_code": course_code,
                        "fields": different_fields,
                        "siakad": {
                            "nilai_angka": local_grade.get("score"),
                            "nilai_huruf": local_grade.get("grade_letter"),
                            "nilai_indeks": local_grade.get("grade_point"),
                        },
                        "feeder": {
                            "nilai_angka": feeder_grade.get("nilai_angka"),
                            "nilai_huruf": feeder_grade.get("nilai_huruf"),
                            "nilai_indeks": feeder_grade.get("nilai_indeks"),
                        },
                    }
                )
        for _grade in feeder_remaining:
            grade_issues.append(
                {
                    "status": "feeder_only",
                    "nim": nim,
                    "course_code": course_code,
                    "fields": [],
                }
            )
        for _grade in local_remaining:
            grade_issues.append(
                {
                    "status": "siakad_only",
                    "nim": nim,
                    "course_code": course_code,
                    "fields": [],
                }
            )

    feeder_activity_by_nim = {
        normalized_key(item.get("nim")): item
        for item in feeder_activities
        if normalized_key(item.get("nim"))
    }
    activity_issues = []
    activity_field_mismatches: Counter[str] = Counter()
    for nim in sorted(set(local_activity_by_nim) | set(feeder_activity_by_nim)):
        local_item = local_activity_by_nim.get(nim)
        feeder_item = feeder_activity_by_nim.get(nim)
        if not local_item or not feeder_item:
            activity_issues.append(
                {
                    "status": "siakad_only" if local_item else "feeder_only",
                    "nim": nim,
                    "fields": [],
                }
            )
            continue
        field_map = {
            "ips": ("ips", "ips"),
            "ipk": ("ipk", "ipk"),
            "sks_semester": ("total_sks_semester", "sks_semester"),
            "sks_total": ("total_sks_kumulatif", "sks_total"),
        }
        different_fields = [
            label
            for label, (local_field, feeder_field) in field_map.items()
            if values_differ(local_item.get(local_field), feeder_item.get(feeder_field))
        ]
        if different_fields:
            activity_field_mismatches.update(different_fields)
            activity_issues.append(
                {
                    "status": "different",
                    "nim": nim,
                    "fields": different_fields,
                    "siakad": {
                        "ips": local_item.get("ips"),
                        "ipk": local_item.get("ipk"),
                        "sks_semester": local_item.get("total_sks_semester"),
                        "sks_total": local_item.get("total_sks_kumulatif"),
                    },
                    "feeder": {
                        "ips": feeder_item.get("ips"),
                        "ipk": feeder_item.get("ipk"),
                        "sks_semester": feeder_item.get("sks_semester"),
                        "sks_total": feeder_item.get("sks_total"),
                    },
                }
            )

    feeder_lecturers_by_class: defaultdict[str, set[str]] = defaultdict(set)
    for item in feeder_lecturers:
        identities = {
            normalized_key(item.get(field))
            for field in ("nidn", "nama_dosen")
        } - {"", "-"}
        feeder_lecturers_by_class[str(item.get("id_kelas_kuliah") or "")].update(identities)
    lecturer_issues = []
    lecturer_match_count = 0
    for feeder_id, local_id in sorted(class_map.items()):
        local_class = local_class_meta[local_id]
        lecturer = user_by_id.get(local_class["lecturer_id"], {})
        local_identities = {
            normalized_key(lecturer.get(field))
            for field in ("nidn", "employee_id", "name")
        } - {"", "-"}
        feeder_identities = feeder_lecturers_by_class.get(feeder_id, set())
        if local_identities and feeder_identities and local_identities & feeder_identities:
            lecturer_match_count += 1
        elif local_identities or feeder_identities:
            lecturer_issues.append(
                {
                    "course_code": local_class["course_code"],
                    "class_siakad": local_class["class_name"],
                    "class_feeder": feeder_class_meta[feeder_id]["class_name"],
                    "siakad": sorted(local_identities),
                    "feeder": sorted(feeder_identities),
                }
            )

    grade_status_counts = Counter(item["status"] for item in grade_issues)
    activity_status_counts = Counter(item["status"] for item in activity_issues)
    participant_status_counts = Counter(item["side"] for item in participant_issues)
    return {
        "ok": True,
        "mode": "read_only",
        "generated_at": now_iso(),
        "period": period,
        "summary": {
            "classes": {
                "feeder": len(feeder_class_meta),
                "siakad": len(local_class_meta),
                "mapped": len(class_map),
                "exact": exact_class_count,
                "different": len(class_map) - exact_class_count,
                "feeder_only": len(feeder_only_classes),
                "siakad_only": len(siakad_only_classes),
            },
            "participants": {
                "feeder": sum(len(item["student_nims"]) for item in feeder_class_meta.values()),
                "siakad": sum(len(item["student_nims"]) for item in local_class_meta.values()),
                "feeder_only": participant_status_counts["feeder_only"],
                "siakad_only": participant_status_counts["siakad_only"],
            },
            "grades": {
                "feeder": len(feeder_grades),
                "siakad": local_grade_row_count,
                "unique_feeder": len(feeder_grade_by_key),
                "unique_siakad": len(local_grade_by_key),
                "matched": matched_grade_rows,
                "different": grade_status_counts["different"],
                "feeder_only": grade_status_counts["feeder_only"],
                "siakad_only": grade_status_counts["siakad_only"],
                "field_mismatches": dict(grade_field_mismatches),
            },
            "student_activities": {
                "feeder": len(feeder_activity_by_nim),
                "siakad": len(local_activity_by_nim),
                "matched": len(set(local_activity_by_nim) & set(feeder_activity_by_nim)),
                "different": activity_status_counts["different"],
                "feeder_only": activity_status_counts["feeder_only"],
                "siakad_only": activity_status_counts["siakad_only"],
                "field_mismatches": dict(activity_field_mismatches),
            },
            "lecturers": {
                "feeder_assignments": len(feeder_lecturers),
                "matched_classes": lecturer_match_count,
                "different_or_missing_classes": len(lecturer_issues),
            },
        },
        "class_mappings": class_mappings,
        "issues": {
            "classes": (feeder_only_classes + siakad_only_classes)[:100],
            "participants": participant_issues[:200],
            "grades": grade_issues[:200],
            "student_activities": activity_issues[:200],
            "lecturers": lecturer_issues[:100],
        },
        "issue_totals": {
            "classes": len(feeder_only_classes) + len(siakad_only_classes),
            "participants": len(participant_issues),
            "grades": len(grade_issues),
            "student_activities": len(activity_issues),
            "lecturers": len(lecturer_issues),
        },
    }


def grade_has_value(item: Dict[str, Any], feeder: bool = False) -> bool:
    letter_field = "nilai_huruf" if feeder else "grade_letter"
    score_field = "nilai_angka" if feeder else "final_score"
    point_field = "nilai_indeks" if feeder else "grade_point"
    letter = normalized_key(item.get(letter_field))
    if letter and letter not in {"-", "BELUM", "NONE"}:
        return True
    for field in (score_field, point_field):
        value = item.get(field)
        if value not in (None, "", "-"):
            try:
                if abs(float(value)) > 0.001:
                    return True
            except (TypeError, ValueError):
                return True
    return False


def build_feeder_write_preview(
    period: Dict[str, str],
    period_ids: set[str],
    feeder_classes: list[Dict[str, Any]],
    feeder_grades: list[Dict[str, Any]],
    feeder_lecturers: list[Dict[str, Any]],
    feeder_activities: list[Dict[str, Any]],
    local_users: list[Dict[str, Any]],
    local_courses: list[Dict[str, Any]],
    all_local_classes: list[Dict[str, Any]],
    all_local_krs: list[Dict[str, Any]],
    all_local_khs: list[Dict[str, Any]],
    feeder_courses: Optional[list[Dict[str, Any]]] = None,
    feeder_programs: Optional[list[Dict[str, Any]]] = None,
    feeder_students: Optional[list[Dict[str, Any]]] = None,
    local_programs: Optional[list[Dict[str, Any]]] = None,
    feeder_curricula: Optional[list[Dict[str, Any]]] = None,
    feeder_curriculum_courses: Optional[list[Dict[str, Any]]] = None,
    local_curricula: Optional[list[Dict[str, Any]]] = None,
    feeder_lecturer_registrations: Optional[list[Dict[str, Any]]] = None,
    feeder_student_statuses: Optional[list[Dict[str, Any]]] = None,
    feeder_mode: str = "sandbox",
) -> Dict[str, Any]:
    """Bangun antrean tulis yang dapat ditinjau tanpa memanggil aksi tulis Feeder."""
    users_by_id = {str(item.get("id") or ""): item for item in local_users}
    users_by_nim = {
        normalized_key(item.get("nim") or item.get("username")): item
        for item in local_users
        if normalized_key(item.get("nim") or item.get("username"))
    }
    courses_by_id = {str(item.get("id") or ""): item for item in local_courses}
    programs_by_id = {
        str(item.get("id") or ""): item for item in (local_programs or [])
    }
    curricula_by_id = {
        str(item.get("id") or ""): item for item in (local_curricula or [])
    }
    strict_master_validation = feeder_courses is not None
    feeder_courses_by_id = {
        str(item.get("id_matkul") or ""): item
        for item in (feeder_courses or [])
        if item.get("id_matkul")
    }
    feeder_courses_by_code: defaultdict[str, list[Dict[str, Any]]] = defaultdict(list)
    for item in feeder_courses or []:
        code = normalized_key(item.get("kode_mata_kuliah"))
        if code:
            feeder_courses_by_code[code].append(item)
    feeder_program_ids = {
        str(item.get("id_prodi") or "")
        for item in (feeder_programs or [])
        if item.get("id_prodi")
    }
    feeder_curriculum_ids = {
        str(item.get("id_kurikulum") or "")
        for item in (feeder_curricula or [])
        if item.get("id_kurikulum")
    }
    feeder_curriculum_course_keys = {
        (
            str(item.get("id_kurikulum") or ""),
            str(item.get("id_matkul") or ""),
        )
        for item in (feeder_curriculum_courses or [])
        if item.get("id_kurikulum") and item.get("id_matkul")
    }
    feeder_students_by_nim = {
        normalized_key(item.get("nim") or item.get("nipd")): item
        for item in (feeder_students or [])
        if normalized_key(item.get("nim") or item.get("nipd"))
    }
    valid_registration_ids = {
        str(item.get("id_registrasi_mahasiswa") or "")
        for item in (feeder_students or [])
        if item.get("id_registrasi_mahasiswa")
    }
    valid_lecturer_registration_ids = {
        str(item.get("id_registrasi_dosen") or "")
        for item in (feeder_lecturer_registrations or [])
        if item.get("id_registrasi_dosen")
    }
    lecturer_registrations_by_id: defaultdict[str, set[str]] = defaultdict(set)
    for item in feeder_lecturer_registrations or []:
        if item.get("id_dosen") and item.get("id_registrasi_dosen"):
            lecturer_registrations_by_id[str(item["id_dosen"])].add(
                str(item["id_registrasi_dosen"])
            )
    valid_student_status_ids = {
        str(item.get("id_status_mahasiswa") or "")
        for item in (feeder_student_statuses or [])
        if item.get("id_status_mahasiswa")
    }

    def mode_specific_id(document: Dict[str, Any], generic_field: str) -> str:
        mode_field = f"{feeder_mode}_{generic_field}"
        return str(document.get(mode_field) or document.get(generic_field) or "")

    def resolved_registration_id(student: Dict[str, Any], nim: str) -> str:
        local_id = mode_specific_id(student, "feeder_registration_id")
        if feeder_students is None or local_id in valid_registration_ids:
            return local_id
        return str(
            (feeder_students_by_nim.get(nim) or {}).get("id_registrasi_mahasiswa")
            or ""
        )

    def resolved_student_id(student: Dict[str, Any], nim: str) -> str:
        local_id = mode_specific_id(student, "feeder_student_id")
        live_item = feeder_students_by_nim.get(nim) or {}
        valid_ids = {str(item.get("id_mahasiswa") or "") for item in feeder_students or []}
        if feeder_students is None or local_id in valid_ids:
            return local_id
        return str(live_item.get("id_mahasiswa") or "")

    def resolved_course_id(course: Dict[str, Any]) -> str:
        local_id = mode_specific_id(course, "feeder_course_id")
        if not strict_master_validation or local_id in feeder_courses_by_id:
            return local_id
        return ""

    def resolved_class_id(item: Dict[str, Any]) -> str:
        sandbox_id = mode_specific_id(item, "feeder_class_id")
        if sandbox_id in feeder_classes_by_id:
            return sandbox_id
        return ""

    def feeder_class_name(item: Dict[str, Any]) -> str:
        explicit = str(item.get("feeder_class_name") or "").strip()
        if explicit:
            return explicit[:5]
        name = re.sub(r"^kelas\s+", "", str(item.get("name") or "").strip(), flags=re.I)
        return name[:5]
    local_classes = {
        str(item.get("id") or ""): item
        for item in all_local_classes
        if class_matches_period(item, period, period_ids)
    }
    feeder_classes_by_id = {
        str(item.get("id_kelas_kuliah") or ""): item
        for item in feeder_classes
        if item.get("id_kelas_kuliah")
    }
    local_class_by_feeder_id = {
        resolved_class_id(item): item
        for item in local_classes.values()
        if resolved_class_id(item)
    }
    operations: list[Dict[str, Any]] = []

    def add_operation(
        category: str,
        action: str,
        status: str,
        reason: str,
        identity: Dict[str, Any],
        siakad: Optional[Dict[str, Any]] = None,
        feeder: Optional[Dict[str, Any]] = None,
        dependencies: Optional[list[str]] = None,
        stage: int = 1,
    ) -> None:
        raw_id = "|".join(
            [period["code"], category, action]
            + [f"{key}={identity[key]}" for key in sorted(identity)]
        )
        operations.append(
            {
                "id": hashlib.sha256(raw_id.encode("utf-8")).hexdigest()[:24],
                "stage": stage,
                "category": category,
                "action": action,
                "status": status,
                "reason": reason,
                "identity": identity,
                "dependencies": dependencies or [],
                "siakad": siakad or {},
                "feeder": feeder or {},
            }
        )

    active_student_ids = {
        str(student_id)
        for item in local_classes.values()
        for student_id in item.get("student_ids") or []
    }
    for student_id in sorted(active_student_ids):
        student = users_by_id.get(student_id) or users_by_nim.get(normalized_key(student_id), {})
        nim = normalized_key(student.get("nim") or student.get("username") or student_id)
        missing = []
        if not resolved_student_id(student, nim):
            missing.append("id_mahasiswa")
        if not resolved_registration_id(student, nim):
            missing.append("id_registrasi_mahasiswa")
        if missing:
            add_operation(
                "students",
                "complete_student_identity",
                "blocked",
                f"Identifier belum lengkap: {', '.join(missing)}",
                {"nim": nim},
                {"name": student.get("name"), "missing": missing},
                stage=1,
            )

    courses_needed_by_classes = {
        str(item.get("course_id") or "") for item in local_classes.values()
    }
    for course_id in sorted(courses_needed_by_classes):
        course = courses_by_id.get(course_id, {})
        if resolved_course_id(course):
            continue
        course_code = normalized_key(course.get("code") or course.get("kode"))
        exact_matches = feeder_courses_by_code.get(course_code, [])
        if len(exact_matches) == 1:
            add_operation(
                "courses",
                "relink_existing_course",
                "ready",
                "Mata kuliah ditemukan berdasarkan kode; tautkan ID sandbox tanpa menulis Feeder",
                {"course_id": course_id, "course_code": course_code},
                {"name": course.get("name") or course.get("nama")},
                {"id_matkul": exact_matches[0].get("id_matkul")},
                stage=2,
            )
            continue
        program = programs_by_id.get(
            str(course.get("program_id") or course.get("prodi_id") or ""), {}
        )
        program_id = mode_specific_id(program, "feeder_program_id")
        missing = []
        if not course_code:
            missing.append("kode_mata_kuliah")
        if not program_id or (feeder_programs is not None and program_id not in feeder_program_ids):
            missing.append("id_prodi_sandbox")
        status = "review" if len(exact_matches) > 1 else "blocked" if missing else "ready"
        reason = (
            "Lebih dari satu mata kuliah Feeder memiliki kode yang sama"
            if len(exact_matches) > 1
            else f"Dependensi belum lengkap: {', '.join(missing)}"
            if missing
            else "Mata kuliah dipakai kelas aktif tetapi belum ada di sandbox Feeder"
        )
        add_operation(
            "courses",
            "create_course",
            status,
            reason,
            {"course_id": course_id, "course_code": course_code},
            {
                "name": course.get("name") or course.get("nama"),
                "program_id": program.get("id"),
                "feeder_program_id": program_id,
                "sks": course.get("sks") or course.get("credits"),
            },
            dependencies=missing,
            stage=2,
        )

    strict_curriculum_validation = feeder_curriculum_courses is not None
    course_has_curriculum_membership: Dict[str, bool] = {}
    for course_id in sorted(courses_needed_by_classes):
        course = courses_by_id.get(course_id, {})
        feeder_course_id = resolved_course_id(course)
        curriculum = curricula_by_id.get(str(course.get("kurikulum_id") or ""), {})
        curriculum_id = mode_specific_id(curriculum, "feeder_curriculum_id")
        if feeder_curricula is not None and curriculum_id not in feeder_curriculum_ids:
            curriculum_id = ""
        membership_exists = bool(
            feeder_course_id
            and curriculum_id
            and (curriculum_id, feeder_course_id) in feeder_curriculum_course_keys
        )
        course_has_curriculum_membership[course_id] = (
            membership_exists if strict_curriculum_validation else True
        )
        if not strict_curriculum_validation or membership_exists or not feeder_course_id:
            continue
        missing = []
        if not curriculum_id:
            missing.append("id_kurikulum_sandbox")
        add_operation(
            "curriculum_courses",
            "insert_curriculum_course",
            "blocked" if missing else "ready",
            (
                f"Dependensi belum lengkap: {', '.join(missing)}"
                if missing
                else "Mata kuliah belum menjadi anggota kurikulum sandbox"
            ),
            {
                "course_id": course_id,
                "course_code": course.get("code") or course.get("kode"),
                "curriculum_id": curriculum.get("id"),
            },
            {
                "feeder_course_id": feeder_course_id,
                "feeder_curriculum_id": curriculum_id,
                "semester": course.get("semester_paket") or course.get("semester"),
                "sks": course.get("sks") or course.get("credits"),
                "is_required": normalized_key(course.get("sifat")) != "PILIHAN",
            },
            dependencies=missing,
            stage=3,
        )

    for class_id, item in sorted(local_classes.items()):
        feeder_class_id = resolved_class_id(item)
        course = courses_by_id.get(str(item.get("course_id") or ""), {})
        if feeder_class_id:
            continue
        missing = []
        if not resolved_course_id(course):
            missing.append("id_mata_kuliah")
        elif not course_has_curriculum_membership.get(str(item.get("course_id") or ""), True):
            missing.append("mata_kuliah_kurikulum")
        program = programs_by_id.get(str(item.get("program_id") or ""), {})
        program_id = mode_specific_id(program, "feeder_program_id")
        if feeder_programs is not None and program_id not in feeder_program_ids:
            missing.append("id_prodi_sandbox")
        class_name = feeder_class_name(item)
        if not class_name:
            missing.append("nama_kelas_kuliah")
        status = "blocked" if missing else "ready"
        reason = (
            f"Dependensi belum lengkap: {', '.join(missing)}"
            if missing
            else "Kelas ada di SIAKAD tetapi belum ditemukan pada semester Feeder"
        )
        add_operation(
            "classes",
            "create_or_relink_class",
            status,
            reason,
            {"class_id": class_id, "course_code": item.get("course_code") or course.get("code")},
            {
                "name": item.get("name"),
                "feeder_class_name": class_name,
                "feeder_class_id": feeder_class_id,
                "students": len(item.get("student_ids") or []),
            },
            dependencies=missing,
            stage=4,
        )

    feeder_grade_groups: defaultdict[tuple[str, str], list[Dict[str, Any]]] = defaultdict(list)
    for item in feeder_grades:
        key = (
            normalized_key(item.get("nim")),
            str(item.get("id_kelas_kuliah") or ""),
        )
        if all(key):
            feeder_grade_groups[key].append(item)

    local_grade_groups: defaultdict[tuple[str, str], list[Dict[str, Any]]] = defaultdict(list)
    for document in all_local_krs:
        if str(document.get("academic_period_id") or "") not in period_ids:
            continue
        student_id = str(document.get("student_id") or "")
        student = users_by_id.get(student_id) or users_by_nim.get(normalized_key(student_id), {})
        nim = normalized_key(student.get("nim") or student.get("username") or student_id)
        for grade in document.get("courses") or []:
            class_id = str(grade.get("class_id") or "")
            if nim and class_id in local_classes:
                local_grade_groups[(nim, class_id)].append(grade)

    paired_feeder_rows: set[int] = set()
    for (nim, class_id), local_rows in sorted(local_grade_groups.items()):
        class_item = local_classes[class_id]
        feeder_class_id = resolved_class_id(class_item)
        student = users_by_nim.get(nim, {})
        registration_id = resolved_registration_id(student, nim)
        dependencies = []
        if not feeder_class_id:
            dependencies.append("kelas_feeder")
        if not registration_id:
            dependencies.append("registrasi_mahasiswa")
        feeder_rows = list(feeder_grade_groups.get((nim, feeder_class_id), []))
        duplicate_rows = len(local_rows) > 1 or len(feeder_rows) > 1
        for index, local_grade in enumerate(local_rows):
            feeder_grade = feeder_rows[index] if index < len(feeder_rows) else None
            identity = {
                "nim": nim,
                "class_id": class_id,
                "feeder_class_id": feeder_class_id,
                "course_code": local_grade.get("course_code") or class_item.get("course_code"),
                "occurrence": index + 1,
            }
            local_score = local_grade.get("final_score")
            local_point = local_grade.get("grade_point")
            local_value = {
                "nilai_angka": (
                    round(float(local_score), 2)
                    if local_score not in (None, "", "-")
                    else local_score
                ),
                "nilai_huruf": local_grade.get("grade_letter"),
                "nilai_indeks": (
                    round(float(local_point), 2)
                    if local_point not in (None, "", "-")
                    else local_point
                ),
            }
            if feeder_grade is None:
                add_operation(
                    "participants",
                    "insert_class_participant",
                    "blocked" if dependencies else "review" if duplicate_rows else "ready",
                    (
                        "Ada record peserta/nilai ganda; periksa sebelum membuat peserta Feeder"
                        if duplicate_rows
                        else "Peserta KRS belum ditemukan pada kelas Feeder"
                    ),
                    identity,
                    {"registration_id": registration_id},
                    dependencies=dependencies,
                    stage=6,
                )
                if grade_has_value(local_grade):
                    add_operation(
                        "grades",
                        "update_grade_after_participant",
                        "blocked",
                        "Nilai dapat dikirim setelah peserta kelas berhasil dibuat",
                        identity,
                        local_value,
                        dependencies=["peserta_kelas"],
                        stage=7,
                    )
                continue

            paired_feeder_rows.add(id(feeder_grade))
            feeder_value = {
                "nilai_angka": feeder_grade.get("nilai_angka"),
                "nilai_huruf": feeder_grade.get("nilai_huruf"),
                "nilai_indeks": feeder_grade.get("nilai_indeks"),
            }
            local_has_grade = grade_has_value(local_grade)
            feeder_has_grade = grade_has_value(feeder_grade, feeder=True)
            # Nilai 0/"-"/NULL sama-sama berarti belum dinilai. Jangan membuat
            # review palsu hanya karena representasi nilai kosongnya berbeda.
            if not local_has_grade and not feeder_has_grade:
                continue
            differs = (
                normalized_key(local_value["nilai_huruf"])
                != normalized_key(feeder_value["nilai_huruf"])
                or values_differ(local_value["nilai_angka"], feeder_value["nilai_angka"])
                or values_differ(local_value["nilai_indeks"], feeder_value["nilai_indeks"])
            )
            if not differs:
                continue
            if duplicate_rows:
                status = "review"
                reason = "Ada record peserta/nilai ganda; tentukan pasangan yang benar"
            elif local_has_grade and not feeder_has_grade:
                status = "blocked" if dependencies else "ready"
                reason = "Nilai SIAKAD terisi sedangkan nilai Feeder masih kosong"
            else:
                status = "review"
                reason = (
                    "Nilai berbeda dan keduanya terisi; perlu persetujuan admin"
                    if local_has_grade and feeder_has_grade
                    else "Feeder memiliki nilai tetapi SIAKAD belum terisi; jangan ditimpa otomatis"
                )
            add_operation(
                "grades",
                "update_grade",
                status,
                reason,
                identity,
                local_value,
                feeder_value,
                dependencies=dependencies,
                stage=7,
            )

    for rows in feeder_grade_groups.values():
        for feeder_grade in rows:
            if id(feeder_grade) in paired_feeder_rows:
                continue
            feeder_class_id = str(feeder_grade.get("id_kelas_kuliah") or "")
            local_class = local_class_by_feeder_id.get(feeder_class_id)
            add_operation(
                "participants",
                "review_feeder_only_participant",
                "review",
                "Peserta ditemukan di Feeder tetapi tidak ada pada KRS SIAKAD",
                {
                    "nim": normalized_key(feeder_grade.get("nim")),
                    "class_id": str((local_class or {}).get("id") or ""),
                    "feeder_class_id": feeder_class_id,
                    "course_code": feeder_grade.get("kode_mata_kuliah"),
                },
                feeder=feeder_grade,
                stage=6,
            )

    feeder_activity_by_nim = {
        normalized_key(item.get("nim")): item
        for item in feeder_activities
        if normalized_key(item.get("nim"))
    }
    local_activity_nims: set[str] = set()
    for document in all_local_khs:
        if str(document.get("academic_period_id") or "") not in period_ids:
            continue
        student_id = str(document.get("student_id") or "")
        student = users_by_id.get(student_id) or users_by_nim.get(normalized_key(student_id), {})
        nim = normalized_key(student.get("nim") or student.get("username") or student_id)
        if not nim:
            continue
        local_activity_nims.add(nim)
        feeder_item = feeder_activity_by_nim.get(nim)
        local_value = {
            "ips": document.get("ips"),
            "ipk": document.get("ipk"),
            "sks_semester": document.get("total_sks_semester"),
            "sks_total": document.get("total_sks_kumulatif"),
            "id_status_mahasiswa": (
                document.get("status_mhs")
                or student.get("academic_status_code")
                or (student.get("registration") or {}).get("status_mahasiswa_id")
            ),
            "biaya_kuliah_smt": document.get("biaya_kuliah_smt"),
            "id_pembiayaan": (student.get("registration") or {}).get(
                "jenis_pembiayaan_id"
            ),
        }
        feeder_value = {
            "ips": (feeder_item or {}).get("ips"),
            "ipk": (feeder_item or {}).get("ipk"),
            "sks_semester": (feeder_item or {}).get("sks_semester"),
            "sks_total": (feeder_item or {}).get("sks_total"),
            "id_status_mahasiswa": (feeder_item or {}).get("id_status_mahasiswa"),
            "biaya_kuliah_smt": (feeder_item or {}).get("biaya_kuliah_smt"),
            "id_pembiayaan": (feeder_item or {}).get("id_pembiayaan"),
        }
        # ``id_pembiayaan`` wajib saat menulis, tetapi tidak dikembalikan oleh
        # GetAktivitasKuliahMahasiswa pada beberapa build Neo Feeder. Karena itu
        # field tulis-saja tersebut tidak dapat dijadikan pembanding read-back.
        comparable_activity_fields = (
            "ips",
            "ipk",
            "sks_semester",
            "sks_total",
            "id_status_mahasiswa",
            "biaya_kuliah_smt",
        )
        differs = feeder_item is None or any(
            values_differ(local_value[field], feeder_value[field])
            for field in comparable_activity_fields
        )
        if not differs:
            continue
        dependencies = []
        if not resolved_registration_id(student, nim):
            dependencies.append("registrasi_mahasiswa")
        for field in ("id_status_mahasiswa", "biaya_kuliah_smt", "id_pembiayaan"):
            if local_value[field] in (None, ""):
                dependencies.append(field)
        try:
            if float(local_value.get("sks_semester") or 0) <= 0:
                dependencies.append("sks_semester_positif")
        except (TypeError, ValueError):
            dependencies.append("sks_semester_positif")
        if (
            feeder_student_statuses is not None
            and str(local_value.get("id_status_mahasiswa") or "")
            not in valid_student_status_ids
        ):
            dependencies.append("status_mahasiswa_feeder")
        live_student = feeder_students_by_nim.get(nim) or {}
        exit_period = str(
            live_student.get("id_periode_keluar")
            or live_student.get("semester_keluar")
            or ""
        )
        if re.fullmatch(r"\d{4}[123]", exit_period) and period["code"] > exit_period:
            dependencies.append("periode_keluar_feeder")
        feeder_nonzero = feeder_item is not None and any(
            value not in (None, "", "-")
            and (
                abs(float(value)) > 0.001
                if isinstance(value, (int, float))
                or str(value).replace(".", "", 1).replace("-", "", 1).isdigit()
                else True
            )
            for value in feeder_value.values()
        )
        status = "blocked" if dependencies else "review" if feeder_nonzero else "ready"
        add_operation(
            "student_activities",
            "insert_student_activity" if feeder_item is None else "update_student_activity",
            status,
            (
                "Aktivitas semester belum ada di Feeder"
                if feeder_item is None
                else "Aktivitas berbeda dan Feeder sudah berisi data; perlu persetujuan"
                if feeder_nonzero
                else "Aktivitas SIAKAD terisi sedangkan Feeder masih kosong"
            ),
            {"nim": nim},
            local_value,
            feeder_value,
            dependencies=dependencies,
            stage=8,
        )

    for nim, feeder_item in feeder_activity_by_nim.items():
        if nim not in local_activity_nims:
            add_operation(
                "student_activities",
                "review_feeder_only_activity",
                "review",
                "Aktivitas semester hanya ditemukan di Feeder",
                {"nim": nim},
                feeder=feeder_item,
                stage=8,
            )

    feeder_lecturers_by_class: defaultdict[str, list[Dict[str, Any]]] = defaultdict(list)
    evaluation_ids_by_registration: defaultdict[str, list[str]] = defaultdict(list)
    for item in feeder_lecturers:
        feeder_lecturers_by_class[str(item.get("id_kelas_kuliah") or "")].append(item)
        if item.get("id_registrasi_dosen") and item.get("id_jenis_evaluasi") not in (None, ""):
            evaluation_ids_by_registration[str(item["id_registrasi_dosen"])].append(
                str(item["id_jenis_evaluasi"])
            )
    for class_id, class_item in sorted(local_classes.items()):
        feeder_class_id = resolved_class_id(class_item)
        local_lecturer_ids = {
            str(class_item.get("lecturer_id") or ""),
            *{
                str(item.get("lecturer_id") or "")
                for item in class_item.get("local_dosen_pengajar") or []
            },
        } - {""}
        for lecturer_id in sorted(local_lecturer_ids):
            lecturer = users_by_id.get(lecturer_id, {})
            registration_candidates = {
                str(item) for item in lecturer.get("feeder_registration_ids") or [] if item
            }
            if feeder_lecturer_registrations is None:
                registrations = registration_candidates
            else:
                registrations = registration_candidates & valid_lecturer_registration_ids
                lecturer_feeder_id = mode_specific_id(lecturer, "feeder_lecturer_id")
                registrations.update(
                    lecturer_registrations_by_id.get(lecturer_feeder_id, set())
                )
            evaluation_candidates = [
                evaluation_id
                for registration_id in registrations
                for evaluation_id in evaluation_ids_by_registration.get(registration_id, [])
            ]
            evaluation_type_id = (
                Counter(evaluation_candidates).most_common(1)[0][0]
                if evaluation_candidates
                else ""
            )
            local_identities = {
                normalized_key(lecturer.get("nidn")),
                normalized_key(lecturer.get("name")),
                *{normalized_key(item) for item in registrations},
            } - {"", "-"}
            feeder_rows = feeder_lecturers_by_class.get(feeder_class_id, [])
            feeder_identities = {
                normalized_key(row.get(field))
                for row in feeder_rows
                for field in ("nidn", "nama_dosen", "id_registrasi_dosen")
            } - {"", "-"}
            if local_identities & feeder_identities:
                continue
            dependencies = []
            if not feeder_class_id:
                dependencies.append("kelas_feeder")
            if not registrations:
                dependencies.append("registrasi_dosen")
            if not evaluation_type_id:
                dependencies.append("jenis_evaluasi")
            if class_item.get("sks") in (None, "", 0, "0"):
                dependencies.append("sks_substansi_total")
            if class_item.get("planned_meetings") in (None, "", 0, "0"):
                dependencies.append("rencana_minggu_pertemuan")
            add_operation(
                "lecturers",
                "assign_lecturer",
                "blocked" if dependencies else "ready",
                "Dosen lokal belum ditemukan pada penugasan kelas Feeder",
                {
                    "class_id": class_id,
                    "feeder_class_id": feeder_class_id,
                    "lecturer_id": lecturer_id,
                },
                {
                    "name": lecturer.get("name"),
                    "nidn": lecturer.get("nidn"),
                    "registration_ids": sorted(registrations),
                    "evaluation_type_id": evaluation_type_id,
                    "sks": class_item.get("sks"),
                    "planned_meetings": class_item.get("planned_meetings"),
                },
                {"assignments": feeder_rows},
                dependencies=dependencies,
                stage=5,
            )

    status_counts = Counter(item["status"] for item in operations)
    category_counts: defaultdict[str, Counter[str]] = defaultdict(Counter)
    for item in operations:
        category_counts[item["category"]][item["status"]] += 1
        category_counts[item["category"]]["total"] += 1
    operations.sort(key=lambda item: (item["stage"], item["category"], item["id"]))
    return {
        "ok": True,
        "mode": "preview_only",
        "generated_at": now_iso(),
        "period": period,
        "summary": {
            "total": len(operations),
            "ready": status_counts["ready"],
            "review": status_counts["review"],
            "blocked": status_counts["blocked"],
            "resolved": 0,
            "by_category": {key: dict(value) for key, value in category_counts.items()},
        },
        "operations": operations,
        "notice": "Preview ini tidak menjalankan aksi tulis apa pun ke Feeder.",
    }


def apply_sandbox_capability_blocks(
    result: Dict[str, Any], config: Dict[str, Any]
) -> None:
    """Turunkan operasi ready menjadi blocked setelah probe tulis server gagal."""
    if str(config.get("mode") or "") != "sandbox":
        return
    blocks = config.get("sandbox_write_blocks") or {}
    if not isinstance(blocks, dict) or not blocks:
        return
    for operation in result.get("operations") or []:
        category = str(operation.get("category") or "")
        block = blocks.get(category)
        if operation.get("status") != "ready" or not isinstance(block, dict):
            continue
        operation["status"] = "blocked"
        operation["dependencies"] = [
            *operation.get("dependencies", []),
            "kapabilitas_tulis_sandbox",
        ]
        operation["reason"] = (
            f"Tulis sandbox ditahan setelah probe gagal"
            f" ({block.get('error_code') or 'error'}): "
            f"{block.get('error_desc') or 'periksa log eksekusi'}"
        )
    recalculate_preview_summary(result)


OLD_IMPORT_MAX_BYTES = 200 * 1024 * 1024
OLD_IMPORT_BASE_COLLECTIONS = [
    "users",
    "programs",
    "courses",
    "classes",
    "kurikulum",
    "academic_periods",
    "krs",
    "khs",
    "aktivitas_mahasiswa",
]
OLD_IMPORT_FINANCE_COLLECTIONS = {
    "finance_components",
    "finance_schemes",
    "finance_scheme_rules",
    "tuition_bills",
    "tuition_payments",
    "finance_migration_exceptions",
}


def incremental_summary(entries: list[Dict[str, Any]]) -> Dict[str, Any]:
    statuses = Counter(item.get("status") for item in entries)
    by_collection: defaultdict[str, Counter[str]] = defaultdict(Counter)
    for item in entries:
        status = str(item.get("status") or "unknown")
        collection = str(item.get("collection") or "unknown")
        by_collection[collection][status] += 1
        by_collection[collection]["total"] += 1
    return {
        "total": len(entries),
        "ready_create": statuses["ready_create"],
        "ready_update": statuses["ready_update"],
        "unchanged": statuses["unchanged"],
        "local_newer": statuses["local_newer"],
        "conflict": statuses["conflict"],
        "reconciliation_hold": statuses["reconciliation_hold"],
        "by_collection": {key: dict(value) for key, value in by_collection.items()},
    }


def hold_finance_entries_for_reconciliation(
    entries: list[Dict[str, Any]],
    finance_summary: Dict[str, Any],
) -> int:
    """Hold automatic finance writes when BIPOT and payment totals differ."""
    if not finance_summary.get("finance_migration_exceptions"):
        return 0
    held = 0
    for entry in entries:
        if (
            entry.get("collection") in OLD_IMPORT_FINANCE_COLLECTIONS
            and entry.get("status") in {"ready_create", "ready_update"}
        ):
            entry["status"] = "reconciliation_hold"
            entry["action"] = "review"
            held += 1
    return held


def public_incremental_entry(entry: Dict[str, Any]) -> Dict[str, Any]:
    return {
        key: entry.get(key)
        for key in (
            "id",
            "collection",
            "status",
            "action",
            "changed_fields",
            "current_preview",
            "source_preview",
        )
    }


def public_old_import_preview(document: Dict[str, Any]) -> Dict[str, Any]:
    entries = document.get("operations") or []
    relevant = [item for item in entries if item.get("status") != "unchanged"]
    feeder_available = (document.get("migration_report") or {}).get("feeder", {}).get(
        "available", True
    )
    return {
        "ok": True,
        "preview_id": document.get("id"),
        "status": document.get("status"),
        "period": document.get("period"),
        "source": document.get("source"),
        "created_at": document.get("created_at"),
        "summary": document.get("summary") or incremental_summary(entries),
        "migration_report": document.get("migration_report") or {},
        "operations": [public_incremental_entry(item) for item in relevant[:300]],
        "operation_total_returned": min(len(relevant), 300),
        "notice": (
            "Preview tidak mengubah database atau Feeder. Audit Feeder belum tersedia; "
            "migrasi OLD ke SIAKAD baru tetap dapat ditinjau."
            if not feeder_available
            else "Preview tidak mengubah database atau Feeder. Terapkan hanya perubahan berstatus siap."
        ),
    }


@router.post("/old-import/preview")
async def preview_old_siakad_import(
    period: str,
    file: UploadFile = File(...),
    db: PostgresDatabase = Depends(get_db),
    user: Dict[str, Any] = Depends(require_admin),
):
    """Unggah ekspor OLD-SIAKAD dan klasifikasikan perubahan secara incremental."""
    requested_period = str(period or "").strip()
    if not re.fullmatch(r"\d{4}[123]", requested_period):
        raise HTTPException(status_code=422, detail="Kode semester harus 5 digit, misalnya 20252.")
    filename = os.path.basename(file.filename or "old-siakad.json")
    if not filename.lower().endswith(".json"):
        raise HTTPException(status_code=422, detail="Ekspor OLD-SIAKAD harus berupa file JSON.")

    descriptor, temp_path = tempfile.mkstemp(prefix="old-siakad-", suffix=".json")
    os.close(descriptor)
    digest = hashlib.sha256()
    size = 0
    try:
        with open(temp_path, "wb") as handle:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > OLD_IMPORT_MAX_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail="Ukuran ekspor OLD-SIAKAD maksimal 200 MB.",
                    )
                digest.update(chunk)
                handle.write(chunk)
        await file.close()

        from old_siakad_migration import (  # Lazy import avoids router cycle.
            PlannedUpdate,
            build_plan,
            build_three_way_grade_summary,
            classify_incremental_updates,
            fetch_live_feeder,
            parse_old_tables,
        )
        from old_siakad_finance_migration import build_finance_plan

        try:
            tables = await asyncio.to_thread(parse_old_tables, Path(temp_path))
        except (json.JSONDecodeError, UnicodeDecodeError, TypeError, ValueError) as error:
            raise HTTPException(status_code=422, detail=f"File JSON tidak valid: {error}") from error
        required_tables = {"mhsw", "pegawai", "mk", "jadwal", "krs", "khs"}
        missing_tables = sorted(required_tables - set(tables))
        if missing_tables:
            raise HTTPException(
                status_code=422,
                detail=f"Bukan ekspor OLD-SIAKAD lengkap. Tabel tidak ditemukan: {', '.join(missing_tables)}",
            )

        feeder_available = True
        feeder_error = ""
        try:
            live = await fetch_live_feeder(db, requested_period)
        except (RuntimeError, httpx.HTTPError, ValueError, HTTPException) as error:
            # Feeder hanya pembanding read-only pada tahap migrasi OLD -> SIAKAD.
            # Kegagalan koneksi tidak boleh menghalangi pemindahan data antar-SIAKAD.
            feeder_available = False
            feeder_error = str(error)
            live = {}
        current = {
            name: await getattr(db, name).find({}, {"_id": 0}).to_list(None)
            for name in OLD_IMPORT_BASE_COLLECTIONS
        }
        grade_summary = (
            build_three_way_grade_summary(
                tables, current["krs"], live.get("grades", []), requested_period
            )
            if feeder_available
            else None
        )
        updates, report = build_plan(
            tables=tables,
            current=current,
            live=live,
            period=requested_period,
            source_name=filename,
            feeder_available=feeder_available,
        )
        finance_plan, finance_summary = build_finance_plan(tables, filename)
        updates.extend(
            PlannedUpdate(collection, {"id": document["id"]}, document, upsert=True)
            for collection, documents in finance_plan.items()
            for document in documents
        )
        for name in sorted({item.collection for item in updates} - set(current)):
            current[name] = await getattr(db, name).find({}, {"_id": 0}).to_list(None)
        states = await db.old_siakad_sync_state.find({}, {"_id": 0}).to_list(None)
        entries, _ = classify_incremental_updates(updates, current, states)
        finance_operations_held = hold_finance_entries_for_reconciliation(entries, finance_summary)
        preview_id = str(uuid4())
        preview_document = {
            "id": preview_id,
            "status": "pending",
            "period": requested_period,
            "source": {
                "filename": filename,
                "sha256": digest.hexdigest(),
                "size_bytes": size,
                "table_count": len(tables),
            },
            "summary": incremental_summary(entries),
            "migration_report": {
                "changed_krs_documents": report.get("changed_krs_documents", 0),
                "changed_khs_documents": report.get("changed_khs_documents", 0),
                "students_old_only_vs_feeder": (
                    len(report.get("students_old_only_vs_feeder", []))
                    if feeder_available
                    else None
                ),
                "students_feeder_only_vs_old": (
                    len(report.get("students_feeder_only_vs_old", []))
                    if feeder_available
                    else None
                ),
                "three_way_grades": dict(grade_summary) if grade_summary is not None else None,
                "feeder": {
                    "available": feeder_available,
                    "read_only": True,
                    "error": feeder_error or None,
                    "notice": (
                        "Feeder berhasil dibaca untuk audit; tidak ada data yang ditulis ke Feeder."
                        if feeder_available
                        else "Audit Feeder ditunda. Preview dan penerapan hanya memproses OLD ke SIAKAD baru."
                    ),
                },
                "finance": {
                    **finance_summary,
                    "operations_held": finance_operations_held,
                    "status": (
                        "needs_reconciliation"
                        if finance_summary.get("finance_migration_exceptions")
                        else "ready"
                    ),
                },
            },
            "operations": entries,
            "created_by": user.get("id"),
            "created_at": now_iso(),
        }
        await db.old_siakad_import_previews.insert_one(preview_document)
        return public_old_import_preview(preview_document)
    finally:
        try:
            os.unlink(temp_path)
        except FileNotFoundError:
            pass


@router.get("/old-import/latest")
async def latest_old_siakad_import_preview(
    db: PostgresDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_admin),
):
    previews = await db.old_siakad_import_previews.find({}, {"_id": 0}).sort(
        "created_at", -1
    ).to_list(1)
    if not previews:
        return {"ok": True, "preview": None}
    return {"ok": True, "preview": public_old_import_preview(previews[0])}


@router.post("/old-import/apply")
async def apply_old_siakad_import(
    body: OldImportApplyInput,
    db: PostgresDatabase = Depends(get_db),
    user: Dict[str, Any] = Depends(require_admin),
):
    """Terapkan record aman dari preview; konflik dan perubahan lokal selalu dilewati."""
    from old_siakad_migration import managed_values, stable_hash

    preview = await db.old_siakad_import_previews.find_one(
        {"id": body.preview_id}, {"_id": 0}
    )
    if not preview:
        raise HTTPException(status_code=404, detail="Preview migrasi tidak ditemukan.")
    if preview.get("status") != "pending":
        raise HTTPException(status_code=409, detail="Preview migrasi ini sudah pernah diproses.")

    result_counts: Counter[str] = Counter()
    applied_at = now_iso()
    for entry in preview.get("operations") or []:
        status = entry.get("status")
        if status not in {"ready_create", "ready_update", "unchanged"}:
            result_counts[f"skipped_{status or 'unknown'}"] += 1
            continue
        collection = getattr(db, entry["collection"])
        current = await collection.find_one(entry["query"], {"_id": 0})
        desired = managed_values(entry.get("values") or {})
        current_subset = (
            managed_values({key: current.get(key) for key in desired})
            if current is not None
            else None
        )
        current_hash = stable_hash(current_subset) if current_subset is not None else ""
        is_stale = (
            status == "ready_create" and current is not None
        ) or (
            status in {"ready_update", "unchanged"}
            and current_hash != entry.get("target_hash_before")
        )
        if is_stale:
            result_counts["skipped_stale"] += 1
            continue

        if status in {"ready_create", "ready_update"} and entry.get("needs_write", True):
            write_values = dict(entry.get("values") or {})
            # Re-import must never replace the original local creation time.
            # ``created_at`` remains available for an actual upsert only.
            if current is not None:
                write_values.pop("created_at", None)
            write = await collection.update_one(
                entry["query"],
                {"$set": write_values},
                upsert=bool(entry.get("upsert")),
            )
            if write.upserted_id is not None:
                result_counts["created"] += 1
            elif write.modified_count:
                result_counts["updated"] += 1
            else:
                result_counts["matched_no_change"] += 1
        else:
            result_counts["baseline_seeded"] += 1

        state_document = {
            "id": entry["id"],
            "collection": entry["collection"],
            "query": entry["query"],
            "source_hash": entry["source_hash"],
            "target_hash": entry["target_hash_after"],
            "source_filename": preview.get("source", {}).get("filename"),
            "source_file_hash": preview.get("source", {}).get("sha256"),
            "period": preview.get("period"),
            "last_applied_preview_id": preview["id"],
            "updated_at": applied_at,
        }
        await db.old_siakad_sync_state.update_one(
            {"id": state_document["id"]}, {"$set": state_document}, upsert=True
        )

    run_id = str(uuid4())
    run_document = {
        "id": run_id,
        "preview_id": preview["id"],
        "period": preview.get("period"),
        "source": preview.get("source"),
        "result": dict(result_counts),
        "executed_by": user.get("id"),
        "executed_at": applied_at,
        "feeder_write_count": 0,
    }
    await db.old_siakad_import_runs.insert_one(run_document)
    await db.old_siakad_import_previews.update_one(
        {"id": preview["id"]},
        {
            "$set": {
                "status": "applied_safe_changes",
                "applied_at": applied_at,
                "applied_by": user.get("id"),
                "run_id": run_id,
                "result": dict(result_counts),
            }
        },
    )
    return {
        "ok": True,
        "run_id": run_id,
        "preview_id": preview["id"],
        "result": dict(result_counts),
        "message": "Perubahan aman diterapkan. Konflik dan perubahan lokal tidak ditimpa. Feeder tidak diubah.",
    }


async def current_feeder_write_preview(
    db: PostgresDatabase, requested_period: str
) -> Dict[str, Any]:
    """Baca ulang Feeder dan database untuk menghasilkan preview yang tidak kedaluwarsa."""
    from old_siakad_migration import fetch_live_feeder

    live = await fetch_live_feeder(db, requested_period)
    matching_periods, matching_tahun = await asyncio.gather(
        db.academic_periods.find({"code": requested_period}, {"_id": 0}).to_list(None),
        db.tahun_ajaran.find({"id": requested_period}, {"_id": 0}).to_list(None),
    )
    period_ids = {requested_period}
    period_ids.update(
        str(item.get("id") or "")
        for item in [*matching_periods, *matching_tahun]
        if item.get("id")
    )
    (
        local_users,
        local_courses,
        local_programs,
        local_curricula,
        local_classes,
        local_krs,
        local_khs,
    ) = await asyncio.gather(
        db.users.find({}, {"_id": 0}).to_list(None),
        db.courses.find({}, {"_id": 0}).to_list(None),
        db.programs.find({}, {"_id": 0}).to_list(None),
        db.kurikulum.find({}, {"_id": 0}).to_list(None),
        db.classes.find({}, {"_id": 0}).to_list(None),
        db.krs.find({}, {"_id": 0}).to_list(None),
        db.khs.find({}, {"_id": 0}).to_list(None),
    )
    config, resolutions = await asyncio.gather(
        db.feeder_config.find_one({"id": "default"}, {"_id": 0}),
        db.feeder_sync_resolutions.find(
            {"period": requested_period}, {"_id": 0}
        ).to_list(None),
    )
    config = config or {}
    result = build_feeder_write_preview(
        period=semester_identity(requested_period),
        period_ids=period_ids,
        feeder_classes=live["classes"],
        feeder_grades=live["grades"],
        feeder_lecturers=live["lecturers"],
        feeder_activities=live["activities"],
        local_users=local_users,
        local_courses=local_courses,
        all_local_classes=local_classes,
        all_local_krs=local_krs,
        all_local_khs=local_khs,
        feeder_courses=live.get("courses", []),
        feeder_programs=live.get("programs", []),
        feeder_students=live.get("students", []),
        local_programs=local_programs,
        feeder_curricula=live.get("curricula", []),
        feeder_curriculum_courses=live.get("curriculum_courses", []),
        local_curricula=local_curricula,
        feeder_lecturer_registrations=live.get("lecturer_registrations", []),
        feeder_student_statuses=live.get("student_statuses", []),
        feeder_mode=str(config.get("mode") or "sandbox"),
    )
    apply_sandbox_capability_blocks(result, config)
    apply_saved_resolutions(result, resolutions)
    return {"result": result, "live": live, "config": config}


@router.get("/sync-preview")
async def preview_feeder_writes(
    period: str,
    db: PostgresDatabase = Depends(get_db),
    user: Dict[str, Any] = Depends(require_admin),
):
    """Susun antrean sinkronisasi berurutan; seluruh akses Feeder tetap read-only."""
    requested_period = str(period or "").strip()
    if not re.fullmatch(r"\d{4}[123]", requested_period):
        raise HTTPException(status_code=422, detail="Kode semester harus 5 digit, misalnya 20252.")
    context = await current_feeder_write_preview(db, requested_period)
    result = context["result"]
    preview_id = str(uuid4())
    result["preview_id"] = preview_id
    await db.feeder_sync_previews.insert_one(
        {
            "id": preview_id,
            "period": requested_period,
            "mode": "preview_only",
            "summary": result["summary"],
            "operations": result["operations"],
            "created_by": user.get("id"),
            "created_at": result["generated_at"],
        }
    )
    return result


def compact_feeder_response(payload: Dict[str, Any]) -> Dict[str, Any]:
    data = feeder_response_data(payload)
    if isinstance(data, list):
        data = data[:3]
    return {
        "error_code": payload.get("error_code"),
        "error_desc": payload.get("error_desc") or "",
        "data": data,
    }


def feeder_result_identifier(payload: Dict[str, Any], field: str) -> str:
    data = feeder_response_data(payload)
    if isinstance(data, list):
        data = data[0] if data else {}
    return str(data.get(field) or "") if isinstance(data, dict) else ""


async def build_feeder_write_request(
    db: PostgresDatabase,
    operation: Dict[str, Any],
    period: str,
    live: Dict[str, Any],
) -> Dict[str, Any]:
    """Hidrasi request dari database terkini; payload preview tidak pernah dipercaya sendiri."""
    identity = operation.get("identity") or {}
    action = str(operation.get("action") or "")
    live_course_ids = {
        str(item.get("id_matkul") or "") for item in live.get("courses", [])
    }
    live_program_ids = {
        str(item.get("id_prodi") or "") for item in live.get("programs", [])
    }

    def valid_mode_id(document: Dict[str, Any], generic_field: str, valid_ids: set[str]) -> str:
        for field in (f"sandbox_{generic_field}", generic_field):
            value = str(document.get(field) or "")
            if value and value in valid_ids:
                return value
        return ""

    if action == "relink_existing_course":
        feeder_id = str((operation.get("feeder") or {}).get("id_matkul") or "")
        if feeder_id not in live_course_ids:
            raise ValueError("ID mata kuliah hasil pencocokan tidak lagi ditemukan di sandbox")
        return {
            "local_only": True,
            "collection": "courses",
            "query": {"id": str(identity.get("course_id") or "")},
            "update": {
                "sandbox_feeder_course_id": feeder_id,
                "sandbox_feeder_verified_at": now_iso(),
            },
        }

    if action == "create_course":
        course = await db.courses.find_one(
            {"id": str(identity.get("course_id") or "")}, {"_id": 0}
        )
        if not course:
            raise ValueError("Mata kuliah lokal tidak ditemukan")
        program = await db.programs.find_one(
            {"id": str(course.get("program_id") or course.get("prodi_id") or "")},
            {"_id": 0},
        ) or {}
        program_id = valid_mode_id(program, "feeder_program_id", live_program_ids)
        if not program_id:
            raise ValueError("ID prodi sandbox mata kuliah belum valid")
        code = str(course.get("code") or course.get("kode") or "").strip()
        if not code or len(code) > 20:
            raise ValueError("Kode mata kuliah kosong atau melebihi 20 karakter")
        theory = course.get("sks_teori")
        if theory in (None, ""):
            theory = course.get("sks") or course.get("credits") or 0
        record: Dict[str, Any] = {
            "kode_mata_kuliah": code,
            "nama_mata_kuliah": str(course.get("name") or course.get("nama") or "")[:200],
            "id_prodi": program_id,
            "sks_tatap_muka": float(theory or 0),
            "sks_praktek": float(course.get("sks_praktikum") or 0),
            "sks_praktek_lapangan": float(course.get("sks_prak_lapangan") or 0),
            "sks_simulasi": float(course.get("sks_simulasi") or 0),
        }
        course_type = str(course.get("pddikti_course_type_code") or "")
        course_group = str(course.get("pddikti_course_group_code") or "")
        if course_type in {"A", "B", "C", "D", "S"}:
            record["id_jenis_mata_kuliah"] = course_type
        if course_group in set("ABCDEFGH"):
            record["id_kelompok_mata_kuliah"] = course_group
        return {
            "act": "InsertMataKuliah",
            "record": record,
            "result_id_field": "id_matkul",
            "collection": "courses",
            "query": {"id": str(course.get("id") or "")},
            "result_update_field": "sandbox_feeder_course_id",
        }

    if action == "insert_curriculum_course":
        course = await db.courses.find_one(
            {"id": str(identity.get("course_id") or "")}, {"_id": 0}
        ) or {}
        curriculum = await db.kurikulum.find_one(
            {"id": str(identity.get("curriculum_id") or course.get("kurikulum_id") or "")},
            {"_id": 0},
        ) or {}
        live_curriculum_ids = {
            str(item.get("id_kurikulum") or "") for item in live.get("curricula", [])
        }
        course_id = valid_mode_id(course, "feeder_course_id", live_course_ids)
        curriculum_id = valid_mode_id(
            curriculum, "feeder_curriculum_id", live_curriculum_ids
        )
        if not course_id or not curriculum_id:
            raise ValueError("ID mata kuliah atau kurikulum sandbox belum valid")
        semester = int(course.get("semester_paket") or course.get("semester") or 0)
        if semester < 1 or semester > 14:
            raise ValueError("Semester paket mata kuliah tidak valid")
        theory = float(course.get("sks_teori") or 0)
        practice = float(course.get("sks_praktikum") or 0)
        field_practice = float(course.get("sks_prak_lapangan") or 0)
        simulation = float(course.get("sks_simulasi") or 0)
        total = float(course.get("sks") or course.get("credits") or 0)
        return {
            "act": "InsertMatkulKurikulum",
            "record": {
                "id_kurikulum": curriculum_id,
                "id_matkul": course_id,
                "semester": semester,
                "sks_mata_kuliah": total,
                "sks_tatap_muka": theory,
                "sks_praktek": practice,
                "sks_praktek_lapangan": field_practice,
                "sks_simulasi": simulation,
                "apakah_wajib": (
                    # Beberapa build Neo Feeder memeriksa ``empty(0)`` dan
                    # keliru menolak angka nol sebagai field kosong. String
                    # numerik 0.0 tetap dicast menjadi nol oleh PostgreSQL.
                    "0.0" if normalized_key(course.get("sifat")) == "PILIHAN" else 1
                ),
            },
            "local_update": {
                "collection": "courses",
                "query": {"id": str(course.get("id") or "")},
                "update": {
                    "sandbox_feeder_curriculum_id": curriculum_id,
                    "sandbox_feeder_curriculum_verified_at": now_iso(),
                },
            },
        }

    if action == "create_or_relink_class":
        class_item = await db.classes.find_one(
            {"id": str(identity.get("class_id") or "")}, {"_id": 0}
        )
        if not class_item:
            raise ValueError("Kelas lokal tidak ditemukan")
        course = await db.courses.find_one(
            {"id": str(class_item.get("course_id") or "")}, {"_id": 0}
        ) or {}
        program = await db.programs.find_one(
            {"id": str(class_item.get("program_id") or course.get("program_id") or "")},
            {"_id": 0},
        ) or {}
        course_id = valid_mode_id(course, "feeder_course_id", live_course_ids)
        program_id = valid_mode_id(program, "feeder_program_id", live_program_ids)
        class_name = str((operation.get("siakad") or {}).get("feeder_class_name") or "")
        if not course_id or not program_id or not class_name:
            raise ValueError("Dependensi kelas (prodi, mata kuliah, atau nama kelas) belum lengkap")
        record = {
            "id_prodi": program_id,
            "id_semester": period,
            "id_matkul": course_id,
            "nama_kelas_kuliah": class_name[:5],
        }
        capacity = class_item.get("capacity")
        if capacity not in (None, ""):
            record["kapasitas"] = int(capacity)
        lingkup = str(class_item.get("lingkup_kelas_id") or "")
        if lingkup in {"1", "2", "3"}:
            record["lingkup"] = int(lingkup)
        mode = str(class_item.get("mode_kuliah_code") or "")
        if not mode:
            mode = {"1": "O", "2": "F", "3": "M"}.get(
                str(class_item.get("mode_kuliah_id") or ""), ""
            )
        if mode in {"O", "F", "M"}:
            record["mode"] = mode
        for local_field, feeder_field in (
            ("tanggal_mulai_efektif", "tanggal_mulai_efektif"),
            ("tanggal_akhir_efektif", "tanggal_akhir_efektif"),
        ):
            value = str(class_item.get(local_field) or "")[:10]
            if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
                record[feeder_field] = value
        return {
            "act": "InsertKelasKuliah",
            "record": record,
            "result_id_field": "id_kelas_kuliah",
            "collection": "classes",
            "query": {"id": str(class_item.get("id") or "")},
            "result_update_field": "sandbox_feeder_class_id",
        }

    if action == "assign_lecturer":
        local_class = await db.classes.find_one(
            {"id": str(identity.get("class_id") or "")}, {"_id": 0}
        ) or {}
        lecturer = await db.users.find_one(
            {"id": str(identity.get("lecturer_id") or "")}, {"_id": 0}
        ) or {}
        live_class_ids = {
            str(item.get("id_kelas_kuliah") or "") for item in live.get("classes", [])
        }
        class_id = valid_mode_id(local_class, "feeder_class_id", live_class_ids)
        values = operation.get("siakad") or {}
        registration_ids = [
            str(item) for item in values.get("registration_ids") or [] if item
        ]
        valid_registration_ids = {
            str(item.get("id_registrasi_dosen") or "")
            for item in live.get("lecturer_registrations", [])
            if item.get("id_registrasi_dosen")
        }
        registration_id = next(
            (item for item in registration_ids if item in valid_registration_ids), ""
        )
        evaluation_type_id = str(values.get("evaluation_type_id") or "")
        if not class_id or not registration_id or not evaluation_type_id:
            raise ValueError("Dependensi penugasan dosen sandbox belum lengkap")
        return {
            "act": "InsertDosenPengajarKelasKuliah",
            "record": {
                "id_registrasi_dosen": registration_id,
                "id_kelas_kuliah": class_id,
                "sks_substansi_total": float(local_class.get("sks") or 0),
                "rencana_minggu_pertemuan": int(
                    local_class.get("planned_meetings") or 0
                ),
                "realisasi_minggu_pertemuan": 0,
                "id_jenis_evaluasi": int(evaluation_type_id),
            },
            "result_id_field": "id_aktivitas_mengajar",
            "collection": "classes",
            "query": {"id": str(local_class.get("id") or "")},
            "result_update_field": "sandbox_feeder_last_assignment_id",
            "local_update": {
                "collection": "users",
                "query": {"id": str(lecturer.get("id") or "")},
                "update": {
                    "sandbox_feeder_registration_ids": [registration_id],
                    "sandbox_feeder_verified_at": now_iso(),
                },
            },
        }

    nim = normalized_key(identity.get("nim"))
    student = await db.users.find_one({"nim": nim}, {"_id": 0}) or await db.users.find_one(
        {"id": nim}, {"_id": 0}
    ) or {}
    registration_id = str((operation.get("siakad") or {}).get("registration_id") or "")
    if not registration_id:
        live_student = next(
            (
                item for item in live.get("students", [])
                if normalized_key(item.get("nim") or item.get("nipd")) == nim
            ),
            {},
        )
        registration_id = str(live_student.get("id_registrasi_mahasiswa") or "")
    if not registration_id:
        raise ValueError("ID registrasi mahasiswa sandbox tidak ditemukan")

    class_id = str(identity.get("feeder_class_id") or "")
    if action in {"insert_class_participant", "update_grade", "update_grade_after_participant"}:
        local_class = await db.classes.find_one(
            {"id": str(identity.get("class_id") or "")}, {"_id": 0}
        ) or {}
        live_class_ids = {
            str(item.get("id_kelas_kuliah") or "") for item in live.get("classes", [])
        }
        class_id = valid_mode_id(local_class, "feeder_class_id", live_class_ids)
        if not class_id:
            raise ValueError("ID kelas sandbox tidak ditemukan")

    local_update = {
        "collection": "users",
        "query": {"id": str(student.get("id") or nim)},
        "update": {
            "sandbox_feeder_registration_id": registration_id,
            "sandbox_feeder_verified_at": now_iso(),
        },
    }
    if action == "insert_class_participant":
        return {
            "act": "InsertPesertaKelasKuliah",
            "record": {
                "id_kelas_kuliah": class_id,
                "id_registrasi_mahasiswa": registration_id,
            },
            "local_update": local_update,
        }
    if action in {"update_grade", "update_grade_after_participant"}:
        value = operation.get("siakad") or {}
        record: Dict[str, Any] = {}
        if value.get("nilai_angka") not in (None, ""):
            record["nilai_angka"] = round(float(value["nilai_angka"]), 2)
        if value.get("nilai_indeks") not in (None, ""):
            record["nilai_indeks"] = round(float(value["nilai_indeks"]), 2)
        if value.get("nilai_huruf") not in (None, ""):
            record["nilai_huruf"] = str(value["nilai_huruf"])[:3]
        if not record:
            raise ValueError("Nilai lokal kosong")
        return {
            "act": "UpdateNilaiPerkuliahanKelas",
            "key": {
                "id_registrasi_mahasiswa": registration_id,
                "id_kelas_kuliah": class_id,
            },
            "record": record,
            "local_update": local_update,
        }
    if action in {"insert_student_activity", "update_student_activity"}:
        value = operation.get("siakad") or {}
        required = (
            "id_status_mahasiswa",
            "biaya_kuliah_smt",
            "id_pembiayaan",
        )
        missing = [field for field in required if value.get(field) in (None, "")]
        if missing:
            raise ValueError(f"Field aktivitas wajib belum lengkap: {', '.join(missing)}")
        tuition_cost = float(value["biaya_kuliah_smt"])
        record = {
            "id_status_mahasiswa": str(value["id_status_mahasiswa"]),
            "ips": float(value.get("ips") or 0),
            "ipk": float(value.get("ipk") or 0),
            "sks_semester": int(float(value.get("sks_semester") or 0)),
            "total_sks": int(float(value.get("sks_total") or 0)),
            # Hindari bug ``empty(0)`` pada validator build sandbox tertentu.
            "biaya_kuliah_smt": "0.0" if tuition_cost == 0 else tuition_cost,
            "id_pembiayaan": str(value["id_pembiayaan"]),
        }
        if action == "insert_student_activity":
            record.update(
                {"id_registrasi_mahasiswa": registration_id, "id_semester": period}
            )
            request = {"act": "InsertPerkuliahanMahasiswa", "record": record}
        else:
            request = {
                "act": "UpdatePerkuliahanMahasiswa",
                "key": {
                    "id_registrasi_mahasiswa": registration_id,
                    "id_semester": period,
                },
                "record": record,
            }
        request["local_update"] = local_update
        return request
    raise ValueError(f"Aksi {action or '-'} tidak diizinkan oleh eksekutor sandbox")


@router.post("/sync-execute")
async def execute_feeder_writes(
    body: FeederSyncExecuteInput,
    db: PostgresDatabase = Depends(get_db),
    user: Dict[str, Any] = Depends(require_admin),
):
    """Eksekusi batch kecil ke sandbox setelah seluruh operasi dibaca ulang."""
    operation_ids = list(dict.fromkeys(str(item) for item in body.operation_ids if item))
    if not operation_ids:
        raise HTTPException(status_code=422, detail="Pilih minimal satu operasi.")
    if len(operation_ids) > 25:
        raise HTTPException(status_code=422, detail="Satu batch maksimal 25 operasi.")
    stored_preview = await db.feeder_sync_previews.find_one(
        {"id": body.preview_id}, {"_id": 0}
    )
    if not stored_preview:
        raise HTTPException(status_code=404, detail="Preview sinkronisasi tidak ditemukan.")
    period = str(stored_preview.get("period") or "")
    if not re.fullmatch(r"\d{4}[123]", period):
        raise HTTPException(status_code=409, detail="Periode preview tidak valid.")

    context = await current_feeder_write_preview(db, period)
    config = context["config"]
    if body.approval == "ready" and body.confirm_sandbox != "EXECUTE_SANDBOX":
        raise HTTPException(status_code=422, detail="Konfirmasi eksekusi sandbox tidak valid.")
    if (
        body.approval == "use_siakad"
        and body.confirm_sandbox != "APPROVE_SIAKAD_OVER_FEEDER"
    ):
        raise HTTPException(
            status_code=422,
            detail="Persetujuan menimpa data Feeder dengan SIAKAD tidak valid.",
        )
    feeder_path = normalize_feeder_path(
        config.get("feeder_path") or DEFAULT_FEEDER_CONFIG["feeder_path"],
        str(config.get("mode") or "sandbox"),
    )
    if str(config.get("mode") or "") != "sandbox" or feeder_path != "/ws/sandbox2.php":
        raise HTTPException(
            status_code=409,
            detail="Eksekutor dikunci untuk mode dan endpoint sandbox2.php.",
        )
    fresh_operations = {
        item["id"]: item for item in context["result"].get("operations") or []
    }
    selected = []
    stale = []
    required_status = "ready" if body.approval == "ready" else "review"
    for operation_id in operation_ids:
        operation = fresh_operations.get(operation_id)
        if not operation or operation.get("status") != required_status:
            stale.append(operation_id)
        else:
            selected.append(operation)
    if stale:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Preview berubah atau operasi tidak lagi siap. Buat preview baru.",
                "operation_ids": stale,
            },
        )
    categories = {str(item.get("category") or "") for item in selected}
    if len(categories) != 1:
        raise HTTPException(
            status_code=422,
            detail="Satu batch hanya boleh memuat satu kategori agar urutan dependensi terjaga.",
        )
    category = next(iter(categories))
    if body.approval == "use_siakad":
        allowed_review_actions = {
            "student_activities": {
                "update_student_activity",
            },
            "grades": {"update_grade"},
        }
        allowed_actions = allowed_review_actions.get(category, set())
        invalid_actions = [
            item.get("id")
            for item in selected
            if item.get("action") not in allowed_actions
        ]
        if invalid_actions:
            raise HTTPException(
                status_code=422,
                detail="Kategori review ini tidak boleh ditimpa otomatis. Periksa secara manual.",
            )
        if category == "grades" and (config.get("sandbox_write_blocks") or {}).get(
            "grades"
        ):
            raise HTTPException(
                status_code=409,
                detail="Persetujuan nilai ditahan karena endpoint nilai sandbox masih gagal dengan error 1178.",
            )

    endpoint = normalize_feeder_url(config.get("feeder_url")) + feeder_path
    run_id = str(uuid4())
    logs: list[Dict[str, Any]] = []
    external_write_count = 0
    stopped = False
    async with httpx.AsyncClient(timeout=60.0) as client:
        token_response = await client.post(
            endpoint,
            json={
                "act": "GetToken",
                "username": config.get("username"),
                "password": config.get("password"),
            },
        )
        token_payload = token_response.json()
        token = feeder_response_token(token_payload)
        if token_response.status_code != 200 or token_payload.get("error_code") not in (0, "0") or not token:
            raise HTTPException(
                status_code=502,
                detail=token_payload.get("error_desc") or "Token sandbox tidak tersedia.",
            )

        for operation in selected:
            log: Dict[str, Any] = {
                "operation_id": operation["id"],
                "category": operation.get("category"),
                "action": operation.get("action"),
                "identity": operation.get("identity"),
                "started_at": now_iso(),
            }
            try:
                request_data = await build_feeder_write_request(
                    db, operation, period, context["live"]
                )
                if request_data.get("local_only"):
                    collection = getattr(db, request_data["collection"])
                    await collection.update_one(
                        request_data["query"], {"$set": request_data["update"]}
                    )
                    log.update({"status": "relinked_local", "external_write": False})
                else:
                    payload = {
                        key: value
                        for key, value in request_data.items()
                        if key in {"act", "key", "record"}
                    }
                    payload["token"] = token
                    response = await client.post(endpoint, json=payload)
                    response_payload = response.json()
                    log["request"] = {key: value for key, value in payload.items() if key != "token"}
                    log["response"] = compact_feeder_response(response_payload)
                    external_write_count += 1
                    if response.status_code != 200 or response_payload.get("error_code") not in (0, "0"):
                        log["status"] = "failed"
                        if (
                            operation.get("category") == "grades"
                            and str(response_payload.get("error_code") or "") == "1178"
                        ):
                            blocks = dict(config.get("sandbox_write_blocks") or {})
                            blocks["grades"] = {
                                "error_code": response_payload.get("error_code"),
                                "error_desc": response_payload.get("error_desc") or "",
                                "blocked_at": now_iso(),
                                "run_id": run_id,
                            }
                            config["sandbox_write_blocks"] = blocks
                            await db.feeder_config.update_one(
                                {"id": "default"},
                                {"$set": {"sandbox_write_blocks": blocks}},
                                upsert=True,
                            )
                        logs.append(log)
                        stopped = True
                        if body.stop_on_error:
                            break
                        continue
                    result_field = request_data.get("result_id_field")
                    if result_field:
                        result_id = feeder_result_identifier(response_payload, result_field)
                        if not result_id:
                            raise ValueError(
                                f"Feeder sukses tetapi tidak mengembalikan {result_field}"
                            )
                        collection = getattr(db, request_data["collection"])
                        await collection.update_one(
                            request_data["query"],
                            {
                                "$set": {
                                    request_data["result_update_field"]: result_id,
                                    "sandbox_feeder_verified_at": now_iso(),
                                }
                            },
                        )
                        log["result_id"] = result_id
                    local_update = request_data.get("local_update")
                    if local_update:
                        collection = getattr(db, local_update["collection"])
                        await collection.update_one(
                            local_update["query"], {"$set": local_update["update"]}
                        )
                    log["status"] = "success"
                    log["external_write"] = True
            except (httpx.TimeoutException, httpx.ConnectError) as error:
                log.update(
                    {
                        "status": "unknown_network_result",
                        "error": str(error),
                    }
                )
                logs.append(log)
                stopped = True
                break
            except (ValueError, TypeError, KeyError) as error:
                log.update({"status": "failed_validation", "error": str(error)})
                logs.append(log)
                stopped = True
                break
            log["finished_at"] = now_iso()
            logs.append(log)

    result_counts = Counter(item.get("status") for item in logs)
    run_document = {
        "id": run_id,
        "preview_id": body.preview_id,
        "period": period,
        "mode": "sandbox",
        "category": category,
        "approval": body.approval,
        "operation_ids": operation_ids,
        "logs": logs,
        "result": dict(result_counts),
        "external_write_count": external_write_count,
        "stopped": stopped,
        "executed_by": user.get("id"),
        "executed_at": now_iso(),
    }
    await db.feeder_sync_runs.insert_one(run_document)

    verification: Dict[str, Any]
    try:
        verified = await current_feeder_write_preview(db, period)
        remaining_ids = {
            item["id"] for item in verified["result"].get("operations") or []
        }
        verification = {
            "reconciled": True,
            "selected_operations_remaining": [
                operation_id for operation_id in operation_ids if operation_id in remaining_ids
            ],
            "summary": verified["result"].get("summary"),
        }
    except Exception as error:
        verification = {"reconciled": False, "error": str(error)}
    await db.feeder_sync_runs.update_one(
        {"id": run_id}, {"$set": {"verification": verification}}
    )
    return {
        "ok": not stopped and not result_counts.get("failed") and not result_counts.get("failed_validation"),
        "run_id": run_id,
        "mode": "sandbox",
        "category": category,
        "approval": body.approval,
        "result": dict(result_counts),
        "external_write_count": external_write_count,
        "logs": logs,
        "verification": verification,
    }


async def import_feeder_grade_to_siakad(
    db: PostgresDatabase,
    operation: Dict[str, Any],
    period: str,
    run_id: str,
) -> Dict[str, Any]:
    """Salin nilai Feeder ke KRS dan KHS hanya ketika nilai lokal masih kosong."""
    identity = operation.get("identity") or {}
    nim = normalized_key(identity.get("nim"))
    class_id = str(identity.get("class_id") or "")
    course_code = normalized_key(identity.get("course_code"))
    occurrence = max(0, int(identity.get("occurrence") or 1) - 1)
    feeder_value = operation.get("feeder") or {}
    local_value = operation.get("siakad") or {}
    if operation.get("category") != "grades" or operation.get("action") != "update_grade":
        raise ValueError("Hanya konflik nilai berpasangan yang dapat diimpor")
    if grade_has_value(local_value, feeder=True):
        raise ValueError("Nilai SIAKAD sudah terisi dan tidak boleh ditimpa otomatis")
    if not grade_has_value(feeder_value, feeder=True):
        raise ValueError("Nilai Feeder kosong")

    student = await db.users.find_one({"nim": nim}, {"_id": 0}) or await db.users.find_one(
        {"id": nim}, {"_id": 0}
    )
    if not student:
        raise ValueError("Mahasiswa lokal tidak ditemukan")
    student_id = str(student.get("id") or nim)
    krs = await db.krs.find_one(
        {"student_id": student_id, "academic_period_id": period}, {"_id": 0}
    )
    khs = await db.khs.find_one(
        {"student_id": student_id, "academic_period_id": period}, {"_id": 0}
    )
    if not krs or not khs:
        raise ValueError("Dokumen KRS atau KHS semester tidak ditemukan")

    courses = [dict(item) for item in krs.get("courses") or []]
    course_indexes = [
        index for index, item in enumerate(courses)
        if str(item.get("class_id") or "") == class_id
    ]
    if occurrence >= len(course_indexes):
        raise ValueError("Baris mata kuliah KRS tidak ditemukan")
    course_index = course_indexes[occurrence]
    if grade_has_value(courses[course_index]):
        raise ValueError("Nilai KRS berubah setelah preview; buat preview baru")

    khs_grades = [dict(item) for item in khs.get("grades") or []]
    khs_indexes = [
        index for index, item in enumerate(khs_grades)
        if normalized_key(item.get("course_code")) == course_code
    ]
    if len(khs_indexes) != 1:
        raise ValueError("Nilai KHS tidak memiliki pasangan mata kuliah yang unik")

    score = round(float(feeder_value.get("nilai_angka") or 0), 2)
    point = round(float(feeder_value.get("nilai_indeks") or 0), 2)
    letter = str(feeder_value.get("nilai_huruf") or "")[:3]
    courses[course_index].update(
        {"final_score": score, "grade_point": point, "grade_letter": letter}
    )
    khs_grades[khs_indexes[0]].update(
        {"score": score, "grade_point": point, "grade_letter": letter}
    )
    imported_at = now_iso()
    await db.krs.update_one(
        {"id": krs["id"]},
        {
            "$set": {
                "courses": courses,
                "feeder_imported_at": imported_at,
                "feeder_import_run_id": run_id,
            }
        },
    )
    await db.khs.update_one(
        {"id": khs["id"]},
        {
            "$set": {
                "grades": khs_grades,
                "feeder_imported_at": imported_at,
                "feeder_import_run_id": run_id,
            }
        },
    )
    return {"krs_id": krs["id"], "khs_id": khs["id"]}


@router.post("/sync-resolve")
async def resolve_feeder_review(
    body: FeederSyncResolutionInput,
    db: PostgresDatabase = Depends(get_db),
    user: Dict[str, Any] = Depends(require_admin),
):
    """Selesaikan review tanpa menebak: pertahankan Feeder atau impor nilai kosong."""
    operation_ids = list(dict.fromkeys(str(item) for item in body.operation_ids if item))
    if not operation_ids:
        raise HTTPException(status_code=422, detail="Pilih minimal satu data review.")
    if len(operation_ids) > 25:
        raise HTTPException(status_code=422, detail="Satu batch maksimal 25 data review.")
    preview = await db.feeder_sync_previews.find_one(
        {"id": body.preview_id}, {"_id": 0}
    )
    if not preview:
        raise HTTPException(status_code=404, detail="Preview sinkronisasi tidak ditemukan.")
    period = str(preview.get("period") or "")
    context = await current_feeder_write_preview(db, period)
    config = context["config"]
    feeder_path = normalize_feeder_path(
        config.get("feeder_path") or DEFAULT_FEEDER_CONFIG["feeder_path"],
        str(config.get("mode") or "sandbox"),
    )
    if str(config.get("mode") or "") != "sandbox" or feeder_path != "/ws/sandbox2.php":
        raise HTTPException(
            status_code=409,
            detail="Penyelesaian review dikunci untuk database sandbox.",
        )
    fresh = {item["id"]: item for item in context["result"].get("operations") or []}
    selected = [fresh.get(operation_id) for operation_id in operation_ids]
    stale = [
        operation_id
        for operation_id, operation in zip(operation_ids, selected)
        if not operation or operation.get("status") != "review"
    ]
    if stale:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Data review berubah atau sudah diselesaikan. Buat preview baru.",
                "operation_ids": stale,
            },
        )
    categories = {str(item.get("category") or "") for item in selected if item}
    if len(categories) != 1:
        raise HTTPException(status_code=422, detail="Satu batch harus satu kategori.")
    category = next(iter(categories))
    if body.decision == "use_feeder" and category != "grades":
        raise HTTPException(
            status_code=422,
            detail="Impor dari Feeder saat ini hanya diizinkan untuk nilai SIAKAD yang kosong.",
        )

    run_id = str(uuid4())
    logs: list[Dict[str, Any]] = []
    stopped = False
    for operation in selected:
        log = {
            "operation_id": operation["id"],
            "category": category,
            "action": operation.get("action"),
            "identity": operation.get("identity"),
            "started_at": now_iso(),
            "external_write": False,
        }
        try:
            if body.decision == "keep_feeder":
                resolution = {
                    "id": f"{period}:{operation['id']}",
                    "operation_id": operation["id"],
                    "period": period,
                    "category": category,
                    "decision": "keep_feeder",
                    "state_hash": operation_state_hash(operation),
                    "identity": operation.get("identity"),
                    "resolved_by": user.get("id"),
                    "resolved_at": now_iso(),
                }
                await db.feeder_sync_resolutions.update_one(
                    {"id": resolution["id"]}, {"$set": resolution}, upsert=True
                )
                log["status"] = "resolved_keep_feeder"
            else:
                local_result = await import_feeder_grade_to_siakad(
                    db, operation, period, run_id
                )
                log.update(
                    {"status": "imported_feeder_to_siakad", "local_result": local_result}
                )
        except (ValueError, TypeError, KeyError) as error:
            log.update({"status": "failed_validation", "error": str(error)})
            stopped = True
        log["finished_at"] = now_iso()
        logs.append(log)
        if stopped:
            break

    result_counts = Counter(item.get("status") for item in logs)
    run_document = {
        "id": run_id,
        "preview_id": body.preview_id,
        "period": period,
        "mode": "sandbox",
        "category": category,
        "decision": body.decision,
        "operation_ids": operation_ids,
        "logs": logs,
        "result": dict(result_counts),
        "external_write_count": 0,
        "stopped": stopped,
        "executed_by": user.get("id"),
        "executed_at": now_iso(),
    }
    await db.feeder_sync_runs.insert_one(run_document)
    try:
        verified = await current_feeder_write_preview(db, period)
        verification = {
            "reconciled": True,
            "summary": verified["result"].get("summary"),
        }
    except Exception as error:
        verification = {"reconciled": False, "error": str(error)}
    await db.feeder_sync_runs.update_one(
        {"id": run_id}, {"$set": {"verification": verification}}
    )
    return {
        "ok": not stopped,
        "run_id": run_id,
        "mode": "sandbox",
        "category": category,
        "decision": body.decision,
        "result": dict(result_counts),
        "external_write_count": 0,
        "logs": logs,
        "verification": verification,
    }


def public_sync_run(document: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": document.get("id"),
        "period": document.get("period"),
        "mode": document.get("mode"),
        "category": document.get("category"),
        "approval": document.get("approval"),
        "decision": document.get("decision"),
        "result": document.get("result") or {},
        "external_write_count": document.get("external_write_count", 0),
        "stopped": bool(document.get("stopped")),
        "executed_by": document.get("executed_by"),
        "executed_at": document.get("executed_at"),
        "verification": document.get("verification") or {},
        "logs": [
            {
                key: item.get(key)
                for key in (
                    "operation_id",
                    "category",
                    "action",
                    "identity",
                    "status",
                    "error",
                    "response",
                    "result_id",
                    "local_result",
                    "external_write",
                )
            }
            for item in document.get("logs") or []
        ],
    }


@router.get("/sync-runs")
async def list_feeder_sync_runs(
    period: str = "",
    limit: int = 20,
    db: PostgresDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_admin),
):
    requested_period = str(period or "").strip()
    if requested_period and not re.fullmatch(r"\d{4}[123]", requested_period):
        raise HTTPException(status_code=422, detail="Kode semester tidak valid.")
    safe_limit = min(max(int(limit or 20), 1), 50)
    query = {"period": requested_period} if requested_period else {}
    runs = await db.feeder_sync_runs.find(query, {"_id": 0}).sort(
        "executed_at", -1
    ).to_list(safe_limit)
    return {"ok": True, "runs": [public_sync_run(item) for item in runs]}


@router.get("/config")
async def get_feeder_config(
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    """Ambil konfigurasi koneksi PDDikti Feeder."""
    cfg = await db.feeder_config.find_one({"id": "default"}, {"_id": 0})
    if not cfg:
        cfg = {**DEFAULT_FEEDER_CONFIG, "id": "default"}
        await db.feeder_config.update_one({"id": "default"}, {"$set": cfg}, upsert=True)
    else:
        cfg = {
            **DEFAULT_FEEDER_CONFIG,
            **cfg,
        }
        cfg["feeder_path"] = normalize_feeder_path(cfg.get("feeder_path", ""), cfg.get("mode", "sandbox"))

    masked_cfg = dict(cfg)
    if masked_cfg.get("password"):
        masked_cfg["password_masked"] = "•" * len(masked_cfg["password"])
        masked_cfg["password"] = ""
    else:
        masked_cfg["password_masked"] = ""
    return masked_cfg


@router.post("/config")
async def save_feeder_config(
    body: FeederConfigInput,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    """Simpan konfigurasi koneksi PDDikti Feeder."""
    ex = await db.feeder_config.find_one({"id": "default"}, {"_id": 0}) or {}

    feeder_url = normalize_feeder_url(body.feeder_url)
    feeder_path = normalize_feeder_path(body.feeder_path, body.mode)

    pwd = body.password if (body.password and body.password.strip() != "") else ex.get("password", "")

    doc = {
        "id": "default",
        "feeder_url": feeder_url,
        "feeder_path": feeder_path,
        "username": body.username.strip(),
        "password": pwd,
        "mode": body.mode,
        "auto_sync": body.auto_sync,
        "updated_at": now_iso(),
    }

    await db.feeder_config.update_one({"id": "default"}, {"$set": doc}, upsert=True)
    return {"ok": True, "message": "Pengaturan Feeder berhasil disimpan"}


@router.post("/test-connection")
async def test_feeder_connection(
    body: Optional[FeederConfigInput] = None,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    """Uji koneksi Web Service Neo Feeder PDDikti (GetToken)."""
    ex = await db.feeder_config.find_one({"id": "default"}, {"_id": 0}) or {}

    mode = body.mode if body else ex.get("mode", "sandbox")
    feeder_url = normalize_feeder_url(
        body.feeder_url if body and body.feeder_url else ex.get("feeder_url", DEFAULT_FEEDER_CONFIG["feeder_url"])
    )
    feeder_path = normalize_feeder_path(
        body.feeder_path if body and body.feeder_path else ex.get("feeder_path", DEFAULT_FEEDER_CONFIG["feeder_path"]),
        mode,
    )

    username = body.username if body and body.username else ex.get("username", "")
    password = (body.password if body and body.password else ex.get("password", ""))

    if not username or not password:
        return {
            "ok": False,
            "message": "Username dan Password Feeder wajib diisi untuk melakukan pengujian koneksi.",
            "error_code": 400,
            "response_time_ms": 0,
        }

    full_endpoint = f"{feeder_url}{feeder_path}"

    payload = {
        "act": "GetToken",
        "username": username,
        "password": password,
    }

    start_time = time.time()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(full_endpoint, json=payload)
            elapsed_ms = round((time.time() - start_time) * 1000, 2)

            if resp.status_code != 200:
                err_msg = f"HTTP Server Error (Status {resp.status_code}). Endpoint Feeder tidak merespon 200 OK."
                await db.feeder_config.update_one(
                    {"id": "default"},
                    {"$set": {"last_status": "failed", "last_connected_at": now_iso()}},
                    upsert=True
                )
                return {
                    "ok": False,
                    "message": err_msg,
                    "error_code": resp.status_code,
                    "response_time_ms": elapsed_ms,
                    "endpoint": full_endpoint,
                }

            res_json = resp.json()

            error_code = res_json.get("error_code", -1)
            error_desc = res_json.get("error_desc", "")
            token = feeder_response_token(res_json)

            if error_code == 0 and token:

                feeder_info = {"token_obtained": True}
                try:
                    profil_resp = await client.post(full_endpoint, json={
                        "act": "GetProfilPT",
                        "token": token,
                        "filter": "",
                    })
                    if profil_resp.status_code == 200:
                        profil_json = profil_resp.json()
                        pt_list = feeder_response_data(profil_json)
                        if profil_json.get("error_code") == 0 and pt_list:
                            if isinstance(pt_list, list) and len(pt_list) > 0:
                                pt = pt_list[0]
                                feeder_info = {
                                    "kode_pt": pt.get("kode_perguruan_tinggi", username),
                                    "nama_pt": pt.get("nama_perguruan_tinggi", "Perguruan Tinggi"),
                                    "id_pt": pt.get("id_perguruan_tinggi", ""),
                                }
                except Exception:
                    pass

                update_data = {
                    "last_status": "connected",
                    "last_connected_at": now_iso(),
                    "feeder_info": feeder_info,
                }
                await db.feeder_config.update_one({"id": "default"}, {"$set": update_data}, upsert=True)

                return {
                    "ok": True,
                    "message": "Koneksi ke Web Service Neo Feeder PDDikti BERHASIL!",
                    "response_time_ms": elapsed_ms,
                    "details": {
                        "token": masked_token(token),
                        "response_time_ms": elapsed_ms,
                        "endpoint": full_endpoint,
                        "kode_pt": feeder_info.get("kode_pt", username),
                        "nama_pt": feeder_info.get("nama_pt", "Perguruan Tinggi"),
                        "mode": mode,
                    },
                }
            elif error_code == 0:
                await db.feeder_config.update_one(
                    {"id": "default"},
                    {"$set": {"last_status": "failed", "last_connected_at": now_iso()}},
                    upsert=True,
                )
                return {
                    "ok": False,
                    "message": "Login diterima Feeder, tetapi token tidak ditemukan pada respons.",
                    "error_code": "INVALID_RESPONSE_SCHEMA",
                    "error_desc": "Respons GetToken tidak memiliki data.token maupun result.token.",
                    "response_time_ms": elapsed_ms,
                    "endpoint": full_endpoint,
                }
            else:
                await db.feeder_config.update_one(
                    {"id": "default"},
                    {"$set": {"last_status": "failed", "last_connected_at": now_iso()}},
                    upsert=True
                )
                return {
                    "ok": False,
                    "message": f"Login Feeder Gagal: {error_desc or 'Username/Password Feeder salah atau tidak terdaftar'}",
                    "error_code": error_code,
                    "error_desc": error_desc,
                    "response_time_ms": elapsed_ms,
                    "endpoint": full_endpoint,
                }

    except httpx.ConnectError:
        elapsed_ms = round((time.time() - start_time) * 1000, 2)
        await db.feeder_config.update_one(
            {"id": "default"},
            {"$set": {"last_status": "failed", "last_connected_at": now_iso()}},
            upsert=True
        )
        return {
            "ok": False,
            "message": f"Gagal Terhubung ke Feeder di {full_endpoint}. Pastikan aplikasi Neo Feeder PDDikti telah berjalan pada server tersebut.",
            "error_code": "CONNECT_REFUSED",
            "error_desc": f"Connection Refused ke {feeder_url}. Periksa IP/Port Host dan status service Neo Feeder.",
            "response_time_ms": elapsed_ms,
            "endpoint": full_endpoint,
        }
    except httpx.TimeoutException:
        elapsed_ms = round((time.time() - start_time) * 1000, 2)
        await db.feeder_config.update_one(
            {"id": "default"},
            {"$set": {"last_status": "failed", "last_connected_at": now_iso()}},
            upsert=True
        )
        return {
            "ok": False,
            "message": f"Koneksi Timeout saat menghubungi Feeder di {full_endpoint} (melebihi 10 detik).",
            "error_code": "TIMEOUT",
            "error_desc": "Request timeout. Periksa koneksi jaringan server Feeder.",
            "response_time_ms": elapsed_ms,
            "endpoint": full_endpoint,
        }
    except Exception as err:
        elapsed_ms = round((time.time() - start_time) * 1000, 2)
        await db.feeder_config.update_one(
            {"id": "default"},
            {"$set": {"last_status": "failed", "last_connected_at": now_iso()}},
            upsert=True
        )
        return {
            "ok": False,
            "message": f"Gagal melakukan pengujian koneksi: {str(err)}",
            "error_code": 500,
            "error_desc": str(err),
            "response_time_ms": elapsed_ms,
            "endpoint": full_endpoint,
        }


@router.get("/reconciliation")
async def reconcile_semester_data(
    period: Optional[str] = None,
    db: PostgresDatabase = Depends(get_db),
    _: Dict = Depends(require_admin),
):
    """Bandingkan data SIAKAD dan Feeder per semester tanpa mengubah data."""
    active_tahun, active_period = await asyncio.gather(
        db.tahun_ajaran.find_one({"is_active": True}, {"_id": 0}),
        db.academic_periods.find_one({"is_active": True}, {"_id": 0}),
    )
    requested_period = str(period or "").strip()
    if not requested_period:
        requested_period = str(
            (active_tahun or {}).get("id")
            or (active_tahun or {}).get("code")
            or (active_period or {}).get("code")
            or ""
        ).strip()
    if not re.fullmatch(r"\d{4}[123]", requested_period):
        raise HTTPException(
            status_code=422,
            detail="Kode semester harus 5 digit, misalnya 20252 untuk 2025/2026 Genap.",
        )

    config = await db.feeder_config.find_one({"id": "default"}, {"_id": 0}) or {}
    username = str(config.get("username") or "").strip()
    password = str(config.get("password") or "")
    if not username or not password:
        raise HTTPException(
            status_code=409,
            detail="Konfigurasi Feeder belum lengkap. Simpan username dan password terlebih dahulu.",
        )

    mode = str(config.get("mode") or "sandbox")
    feeder_url = normalize_feeder_url(config.get("feeder_url") or DEFAULT_FEEDER_CONFIG["feeder_url"])
    feeder_path = normalize_feeder_path(
        config.get("feeder_path") or DEFAULT_FEEDER_CONFIG["feeder_path"],
        mode,
    )
    endpoint = f"{feeder_url}{feeder_path}"
    feeder_filter = f"id_semester='{requested_period}'"

    try:
        async with httpx.AsyncClient(timeout=40.0) as client:
            token_response = await client.post(
                endpoint,
                json={"act": "GetToken", "username": username, "password": password},
            )
            if token_response.status_code != 200:
                raise RuntimeError(f"GetToken gagal dengan HTTP {token_response.status_code}")
            token_payload = token_response.json()
            token = feeder_response_token(token_payload)
            if token_payload.get("error_code") != 0 or not token:
                raise RuntimeError(
                    token_payload.get("error_desc")
                    or "Feeder tidak memberikan token akses yang valid"
                )

            (
                feeder_classes,
                feeder_grades,
                feeder_lecturers,
                feeder_activities,
            ) = await asyncio.gather(
                fetch_feeder_rows(
                    client, endpoint, token, "GetListKelasKuliah", feeder_filter
                ),
                fetch_feeder_rows(
                    client,
                    endpoint,
                    token,
                    "GetDetailNilaiPerkuliahanKelas",
                    feeder_filter,
                ),
                fetch_feeder_rows(
                    client,
                    endpoint,
                    token,
                    "GetDosenPengajarKelasKuliah",
                    feeder_filter,
                ),
                fetch_feeder_rows(
                    client,
                    endpoint,
                    token,
                    "GetAktivitasKuliahMahasiswa",
                    feeder_filter,
                ),
            )
    except httpx.ConnectError as error:
        raise HTTPException(
            status_code=502,
            detail="Server Feeder tidak dapat dihubungi saat audit semester dijalankan.",
        ) from error
    except httpx.TimeoutException as error:
        raise HTTPException(
            status_code=504,
            detail="Audit semester berhenti karena respons Feeder melebihi 40 detik.",
        ) from error
    except (RuntimeError, ValueError) as error:
        raise HTTPException(
            status_code=502,
            detail=f"Feeder menolak atau gagal memproses audit: {error}",
        ) from error

    (
        local_users,
        local_courses,
        local_classes,
        local_khs,
        matching_periods,
        matching_tahun,
    ) = await asyncio.gather(
        db.users.find({}, {"_id": 0}).to_list(None),
        db.courses.find({}, {"_id": 0}).to_list(None),
        db.classes.find({}, {"_id": 0}).to_list(None),
        db.khs.find({}, {"_id": 0}).to_list(None),
        db.academic_periods.find({"code": requested_period}, {"_id": 0}).to_list(None),
        db.tahun_ajaran.find({"id": requested_period}, {"_id": 0}).to_list(None),
    )
    period_ids = {requested_period}
    period_ids.update(
        str(item.get("id") or "")
        for item in [*matching_periods, *matching_tahun]
        if item.get("id")
    )

    result = build_semester_reconciliation(
        period=semester_identity(requested_period),
        period_ids=period_ids,
        feeder_classes=feeder_classes,
        feeder_grades=feeder_grades,
        feeder_lecturers=feeder_lecturers,
        feeder_activities=feeder_activities,
        local_users=local_users,
        local_courses=local_courses,
        all_local_classes=local_classes,
        all_local_khs=local_khs,
    )
    result["source"] = {
        "feeder_mode": mode,
        "endpoint": endpoint,
        "filter": feeder_filter,
    }
    return result
