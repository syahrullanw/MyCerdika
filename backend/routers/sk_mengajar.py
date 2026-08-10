"""Router FastAPI untuk Persuratan Akademik — SK (Surat Keputusan) Mengajar Dosen.

Fokus awal: Surat Keputusan Penugasan Mengajar Dosen (dibutuhkan sebagai
lampiran laporan BKD). Struktur sengaja dibuat per-dokumen agar kelak
mudah diperluas ke jenis persuratan akademik lain.

Referensi data:
- kelas (rombel)  : academic_year, semester, lecturer_id, course_*
- user (dosen)    : name, nidn, nip, nik, gelar, homebase, prodi_id, ...
- programs        : nama, kode, kaprodi (untuk blok "Mengetahui")
- app_settings    : campus_name, campus_address, dst untuk kop surat
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from uuid import uuid4
from datetime import datetime, timezone
import re

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from postgres_database import PostgresDatabase
from routers.master_data import (
    _active_pejabat,
    _pejabat_ident,
    get_current_user,
    require_admin_or_kaprodi,
)


router = APIRouter(prefix="/api/v1/sk-mengajar", tags=["Persuratan Akademik — SK Mengajar"])


# ─── helpers kecil ────────────────────────────────────────────────────────────


def get_db(request: Request) -> PostgresDatabase:
    return request.app.state.db


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid4())


async def _period_years(db: PostgresDatabase, tahun_ajaran: str) -> List[str]:
    all_years = await db.classes.distinct("academic_year")
    prefix = tahun_ajaran.strip()
    return sorted({str(y) for y in all_years if y and str(y).startswith(prefix)})


async def _period_classes(
    db: PostgresDatabase,
    *,
    tahun_ajaran: Optional[str] = None,
    semester: Optional[str] = None,
    dosen_ids: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    query: Dict[str, Any] = {"status": {"$ne": "deleted"}}
    if tahun_ajaran:
        matching = await _period_years(db, tahun_ajaran)
        if not matching:
            return []
        query["academic_year"] = {"$in": matching}
    if semester:
        query["semester"] = semester
    if dosen_ids:
        query["lecturer_id"] = {"$in": list(dosen_ids)}
    classes = await db.classes.find(query, {"_id": 0}).to_list(1000)
    await _backfill_class_sks(db, classes)
    return classes


async def _backfill_class_sks(
    db: PostgresDatabase,
    classes: List[Dict[str, Any]],
) -> None:
    """Isi `sks` dari kurikulum (`courses`) bila dokumen kelas belum punya nilai."""
    sks_cache: Dict[str, Any] = {}
    for c in classes:
        sks = c.get("sks")
        if sks not in (None, ""):
            continue
        course_id = c.get("course_id", "")
        if course_id and course_id not in sks_cache:
            sks_cache[course_id] = ""
            crs = await db.courses.find_one({"id": course_id}, {"_id": 0, "sks": 1, "total_sks": 1})
            if crs:
                sks_cache[course_id] = crs.get("sks", crs.get("total_sks", ""))
        if sks_cache.get(course_id):
            c["sks"] = sks_cache[course_id]


async def _period_years(db: PostgresDatabase, tahun_ajaran: str) -> List[str]:
    all_years = await db.classes.distinct("academic_year")
    prefix = tahun_ajaran.strip()
    return sorted({str(y) for y in all_years if y and str(y).startswith(prefix)})


def _year_part(tahun_ajaran: str) -> str:
    m = re.search(r"\d{4}", tahun_ajaran or "")
    return m.group(0) if m else ""


def _normalize_period(tahun_ajaran: str, semester: str) -> str:
    """Normalisasi TA bare year (mis. '2026') menjadi label '2026/2027'."""
    ta = (tahun_ajaran or "").strip()
    sem = (semester or "").strip()
    m = re.fullmatch(r"(\d{4})", ta)
    if not m:
        return ta
    year = int(m.group(1))
    if sem.lower() == "genap":
        return f"{year - 1}/{year}"
    return f"{year}/{year + 1}"


def _kop_from_settings(settings: Dict[str, Any]) -> Dict[str, str]:
    return {
        "instansi": str(settings.get("campus_name") or "SEKOLAH TINGGI / POLITEKNIK"),
        "alamat": str(settings.get("campus_address") or ""),
        "kota": str(settings.get("kampus_kota") or ""),
        "header_url": str(settings.get("kop_header_url") or ""),
        "footer_url": str(settings.get("kop_footer_url") or ""),
    }


async def _resolve_pejabat_blocks(
    db: PostgresDatabase,
    settings: Dict[str, Any],
    *,
    user: Dict[str, Any],
    prodi_id: str,
) -> tuple[Dict[str, Any], Dict[str, Any]]:
    """Blok penetap (Direktur) & mengetahui (Kaprodi) dari penugasan jabatan aktif.

    Tidak memakai nama user session maupun teks hardcoded; fallback hanya
    dipakai bila penugasan pejabat belum ada di sistem.
    """
    penetap_jabatan_setting = str(settings.get("sk_penetap_jabatan") or "Direktur")

    penetap: Dict[str, Any] = {
        "jabatan": penetap_jabatan_setting,
        "nama": "",
        "nip": "",
        "nidn": "",
        "pangkat": "",
        "golongan": "",
    }
    pj = await _active_pejabat(db, jabatan_kode="DIREKTUR")
    if pj:
        penetap = {
            "jabatan": pj["jabatan"] or penetap_jabatan_setting,
            "nama": pj["nama"],
            "nip": pj["nip"],
            "nidn": pj["nidn"],
            "pangkat": pj["pangkat"],
            "golongan": pj["golongan"],
            "user_id": pj["user_id"],
        }
    else:
        penetap["nama"] = str(settings.get("sk_penetap_nama") or (user or {}).get("name", ""))

    mengetahui: Dict[str, Any] = {
        "jabatan": "Ketua Program Studi",
        "nama": "",
        "nip": "",
        "nidn": "",
    }
    kap = await _active_pejabat(db, jabatan_kode="KAPRODI", prodi_id=prodi_id or "")
    if kap:
        mengetahui = {
            "jabatan": kap["jabatan"] or "Ketua Program Studi",
            "nama": kap["nama"],
            "nip": kap["nip"],
            "nidn": kap["nidn"],
            "user_id": kap["user_id"],
        }
    elif prodi_id:
        prodi = await db.programs.find_one({"id": prodi_id}, {"_id": 0})
        if prodi:
            mengetahui["nama"] = str(prodi.get("kaprodi") or "")

    return penetap, mengetahui


# ─── model input ──────────────────────────────────────────────────────────────


class SkGenerateInput(BaseModel):
    tahun_ajaran: str
    semester: str
    dosen_ids: List[str]


class SkFinalizeInput(BaseModel):
    nomor_sk: Optional[str] = None
    tanggal_sk: Optional[str] = None


class SkCetakInput(BaseModel):
    validate_base_url: Optional[str] = None


# ─── data dosen ───────────────────────────────────────────────────────────────


async def _dosen_profile(db: PostgresDatabase, dosen_id: str) -> Dict[str, Any]:
    user = await db.users.find_one(
        {"$or": [{"id": dosen_id}, {"username": dosen_id}, {"nim": dosen_id}]},
        {"_id": 0},
    )
    prodi_ref: Dict[str, Any] = {}
    homebase = ""
    if user:
        homebase = str(user.get("homebase") or "").strip()
        prodi_id = (
            homebase.split(",")[0].strip()
            or str(user.get("prodi_id") or "").split(",")[0].strip()
            or ""
        )
        if prodi_id:
            prodi = await db.programs.find_one({"id": prodi_id}, {"_id": 0})
            prodi_ref = prodi or {}
    return {
        "dosen_id": dosen_id,
        "nama": (user or {}).get("name", ""),
        "nidn": (user or {}).get("nidn", ""),
        "nip": (user or {}).get("nip", ""),
        "nik": (user or {}).get("nik", ""),
        "gelar_depan": (user or {}).get("gelar_depan", ""),
        "gelar_belakang": (user or {}).get("gelar_belakang", ""),
        "gelar": (user or {}).get("gelar", ""),
        "jabatan": (user or {}).get("jabatan_akademik", "") or (user or {}).get("jabatan", ""),
        "pangkat": (user or {}).get("pangkat", ""),
        "golongan": (user or {}).get("golongan", ""),
        "status_kepegawaian": (user or {}).get("status_kepegawaian", ""),
        "homebase": homebase,
        "prodi_id": prodi_ref.get("id", ""),
        "prodi_nama": prodi_ref.get("nama", ""),
        "prodi_kode": prodi_ref.get("kode", ""),
    }


# ═════════════════════════════════════════════════════════════════════════════
#  REKAP DOSEN PENGAMPU
#  Daftar dosen yang mengajar pada periode tertentu + ringkasan beban MK/SKS.
# ═════════════════════════════════════════════════════════════════════════════


@router.get("/rekap/dosen")
async def rekap_dosen_sk(
    request: Request,
    tahun_ajaran: Optional[str] = None,
    semester: Optional[str] = None,
    db: PostgresDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_admin_or_kaprodi),
):
    tahun_ajaran = _normalize_period(tahun_ajaran or "", semester or "")
    classes = await _period_classes(db, tahun_ajaran=tahun_ajaran, semester=semester)
    by_dosen: Dict[str, Dict[str, Any]] = {}
    for c in classes:
        lid = c.get("lecturer_id") or ""
        if not lid:
            continue
        row = by_dosen.setdefault(lid, {"dosen_id": lid, "kelas": [], "jumlah_mk": 0, "total_sks": 0})
        row["kelas"].append(
            {
                "class_id": c.get("id", ""),
                "class_code": c.get("class_code", ""),
                "course_code": c.get("course_code", ""),
                "course_name": c.get("course_name", ""),
                "class_name": c.get("name", ""),
                "sks": _as_int(c.get("sks")),
                "program_name": c.get("program_name", ""),
                "schedule": c.get("schedule", ""),
            }
        )
        row["jumlah_mk"] += 1
        row["total_sks"] += _as_int(c.get("sks"))

    result = []
    for item in by_dosen.values():
        prof = await _dosen_profile(db, item["dosen_id"])
        item.update(prof)
        existing = await db.sk_mengajar.find_one(
            {
                "dosen.dosen_id": item["dosen_id"],
                "tahun_ajaran": tahun_ajaran or "",
                "semester": semester or "",
                "status": {"$ne": "deleted"},
            },
            {"_id": 0, "id": 1, "nomor_sk": 1, "status": 1},
        )
        item["sk_id"] = (existing or {}).get("id", "")
        item["sk_nomor"] = (existing or {}).get("nomor_sk", "")
        item["sk_status"] = (existing or {}).get("status", "")
        item.pop("kelas", None)
        result.append(item)

    result.sort(key=lambda r: (r.get("nama") or "").lower())
    return result


def _as_int(value: Any) -> int:
    try:
        return int(str(value or "").strip() or 0)
    except (ValueError, TypeError):
        return 0


# ═════════════════════════════════════════════════════════════════════════════
#  GENERATE SK MENGAJAR
#  Satu SK per dosen per periode; idempotent terhadap SK yang sudah ada.
# ═════════════════════════════════════════════════════════════════════════════


@router.post("/generate")
async def generate_sk_mengajar(
    body: SkGenerateInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    user: Dict[str, Any] = Depends(require_admin_or_kaprodi),
):
    tahun_ajaran = _normalize_period(body.tahun_ajaran or "", body.semester or "")
    semester = (body.semester or "").strip()
    if not tahun_ajaran or not semester:
        raise HTTPException(status_code=400, detail="Tahun ajaran dan semester diperlukan")
    dosen_ids = [d for d in (body.dosen_ids or []) if d]
    if not dosen_ids:
        raise HTTPException(status_code=400, detail="Pilih minimal satu dosen")

    settings = await db.app_settings.find_one({"id": "main"}, {"_id": 0}) or {}
    kop = _kop_from_settings(settings)

    created = []
    skipped = []
    for did in dosen_ids:
        existing = await db.sk_mengajar.find_one(
            {
                "dosen.dosen_id": did,
                "tahun_ajaran": tahun_ajaran,
                "semester": semester,
                "status": {"$ne": "deleted"},
            },
            {"_id": 0, "id": 1, "status": 1, "nomor_sk": 1},
        )
        if existing:
            if existing.get("status") == "draft":
                try:
                    prof_refresh = await _dosen_profile(db, did)
                    penetap, mengetahui = await _resolve_pejabat_blocks(
                        db, settings, user=user, prodi_id=prof_refresh.get("prodi_id", "")
                    )
                    await db.sk_mengajar.update_one(
                        {"id": existing["id"]},
                        {
                            "$set": {
                                "penetap": penetap,
                                "mengetahui": mengetahui,
                                "updated_at": now_iso(),
                            }
                        },
                    )
                except Exception:
                    pass
            skipped.append(
                {
                    "dosen_id": did,
                    "sk_id": existing.get("id", ""),
                    "status": existing.get("status", ""),
                    "message": "SK sudah ada",
                }
            )
            continue

        prof = await _dosen_profile(db, did)
        if not prof["dosen_id"] or not prof["nama"]:
            skipped.append({"dosen_id": did, "message": "Dosen tidak ditemukan"})
            continue

        classes = [
            c
            for c in await _period_classes(
                db, tahun_ajaran=tahun_ajaran, semester=semester, dosen_ids=[did]
            )
            if c.get("lecturer_id") == did
        ]
        items = []
        total_sks = 0
        for c in classes:
            sks = _as_int(c.get("sks"))
            total_sks += sks
            items.append(
                {
                    "class_id": c.get("id", ""),
                    "class_code": c.get("class_code", ""),
                    "course_code": c.get("course_code", ""),
                    "course_name": c.get("course_name", ""),
                    "class_name": c.get("name", ""),
                    "sks": sks,
                    "program_name": c.get("program_name", ""),
                    "schedule": c.get("schedule", ""),
                }
            )

        penetap, mengetahui = await _resolve_pejabat_blocks(
            db, settings, user=user or {}, prodi_id=prof.get("prodi_id", "")
        )
        doc = {
            "id": new_id(),
            "nomor_sk": "",
            "tahun_ajaran": tahun_ajaran,
            "semester": semester,
            "dosen": prof,
            "prodi": {
                "id": prof["prodi_id"],
                "nama": prof["prodi_nama"],
                "kode": prof["prodi_kode"],
            },
            "kelas": items,
            "jumlah_mk": len(items),
            "total_sks": total_sks,
            "kop": kop,
            "penetap": penetap,
            "mengetahui": mengetahui,
            "status": "draft",
            "tanggal_sk": "",
            "created_at": now_iso(),
            "updated_at": now_iso(),
            "created_by": (user or {}).get("name", ""),
        }
        await db.sk_mengajar.insert_one(doc)
        created.append(
            {
                "sk_id": doc["id"],
                "nomor_sk": "",
                "dosen_id": did,
                "dosen_name": prof["nama"],
                "jumlah_mk": len(items),
                "total_sks": total_sks,
            }
        )

    return {"ok": True, "created": created, "skipped": skipped}


# ═════════════════════════════════════════════════════════════════════════════
#  DAFTAR & DETAIL SK
# ═════════════════════════════════════════════════════════════════════════════


@router.get("")
async def list_sk_mengajar(
    request: Request,
    tahun_ajaran: Optional[str] = None,
    semester: Optional[str] = None,
    dosen_id: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
    db: PostgresDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_admin_or_kaprodi),
):
    query: Dict[str, Any] = {"status": {"$ne": "deleted"}}
    if tahun_ajaran:
        query["tahun_ajaran"] = _normalize_period(tahun_ajaran, semester or "")
    if semester:
        query["semester"] = semester
    if dosen_id:
        query["dosen.dosen_id"] = dosen_id
    if status:
        query["status"] = status
    docs = await db.sk_mengajar.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    if q and q.strip():
        needle = q.strip().lower()
        docs = [d for d in docs if needle in str(d.get("nomor_sk", "")).lower() or needle in str(d.get("dosen", {}).get("nama", "")).lower()]
    return [
        {
            "id": d.get("id"),
            "nomor_sk": d.get("nomor_sk", ""),
            "tahun_ajaran": d.get("tahun_ajaran", ""),
            "semester": d.get("semester", ""),
            "dosen": d.get("dosen", {}),
            "prodi": d.get("prodi", {}),
            "jumlah_mk": d.get("jumlah_mk", 0),
            "total_sks": d.get("total_sks", 0),
            "status": d.get("status", ""),
            "tanggal_sk": d.get("tanggal_sk", ""),
            "created_at": d.get("created_at", ""),
        }
        for d in docs
    ]


@router.get("/validasi/{token}")
async def validasi_sk_mengajar(
    token: str,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
):
    """Validasi publik SK via QR. Publik (tanpa login)."""
    doc = await db.sk_validations.find_one({"token": token}, {"_id": 0})
    if not doc:
        detail = "Token QR tidak ditemukan. Dokumen tidak terdaftar atau QR bukan berasal dari aplikasi ini."
        if "text/html" in (request.headers.get("accept") or ""):
            return HTMLResponse(_validation_html(None, error=detail), status_code=404)
        raise HTTPException(status_code=404, detail=detail)

    payload = {
        "token": doc.get("token", ""),
        "valid": doc.get("status") == "valid",
        "nomor_sk": doc.get("nomor_sk", ""),
        "dosen_name": doc.get("dosen_name", ""),
        "tahun_ajaran": doc.get("tahun_ajaran", ""),
        "semester": doc.get("semester", ""),
        "jumlah_mk": doc.get("jumlah_mk", 0),
        "total_sks": doc.get("total_sks", 0),
        "status_sk": doc.get("status_sk", ""),
        "created_at": doc.get("created_at", ""),
        "signer_role": doc.get("signer_role", ""),
        "signer_label": doc.get("signer_label", ""),
        "signer_jabatan": doc.get("signer_jabatan", ""),
        "signer_name": doc.get("signer_name", ""),
        "signer_ident": str(doc.get("signer_ident") or ""),
        "message": "Dokumen SK valid dan terdaftar di sistem."
        if doc.get("status") == "valid"
        else "Dokumen tidak lagi valid (dicabut atau kedaluwarsa).",
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
        status_class = "valid" if valid else "invalid"
        status_text = "VALID" if valid else "TIDAK VALID"
        signer_rows = ""
        if payload and payload.get("signer_name"):
            signer_rows = f"""
          <table class="signer">
            <tr><th>Penandatangan</th><td>{esc(payload.get('signer_label',''))} — {esc(payload.get('signer_jabatan',''))}</td></tr>
            <tr><th>Nama</th><td>{esc(payload.get('signer_name',''))}</td></tr>
            <tr><th>NIP / NIDN / NUPTK</th><td>{esc(payload.get('signer_ident',''))}</td></tr>
          </table>"""
        body = f"""
        <div class="card {status_class}">
          <div class="badge">{status_text}</div>
          <h1>Validasi Surat Keputusan (SK) Mengajar</h1>
          <p>{esc(payload.get('message',''))}</p>
          <table class="meta">
            <tr><th>Nomor SK</th><td>{esc(payload.get('nomor_sk',''))}</td></tr>
            <tr><th>Dosen</th><td>{esc(payload.get('dosen_name',''))}</td></tr>
            <tr><th>Periode</th><td>{esc(payload.get('semester',''))} {esc(payload.get('tahun_ajaran',''))}</td></tr>
            <tr><th>Beban</th><td>{esc(payload.get('jumlah_mk',0))} MK / {esc(payload.get('total_sks',0))} SKS</td></tr>
            <tr><th>Status SK</th><td>{esc(payload.get('status_sk',''))}</td></tr>
            <tr><th>Diterbitkan</th><td>{esc(payload.get('created_at',''))}</td></tr>
          </table>
          {signer_rows}
        </div>
        """
    return f"""<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Validasi SK Mengajar</title>
<style>
  body {{ font-family: -apple-system, "Segoe UI", Roboto, sans-serif; background: #f1f5f9; margin: 0; padding: 32px 16px; }}
  main {{ max-width: 700px; margin: 0 auto; }}
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
  footer {{ margin-top: 16px; color: #64748b; font-size: 12px; text-align: center; }}
</style>
</head>
<body>
<main>
{body}
<footer>Sistem Informasi Akademik — validasi otomatis hasil cetak SK Mengajar.</footer>
</main>
</body>
</html>"""


@router.get("/{sk_id}")
async def detail_sk_mengajar(
    sk_id: str,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_admin_or_kaprodi),
):
    doc = await db.sk_mengajar.find_one({"id": sk_id, "status": {"$ne": "deleted"}}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="SK tidak ditemukan")
    return doc


# ═════════════════════════════════════════════════════════════════════════════
#  FINALISASI, HAPUS & CETAK
# ═════════════════════════════════════════════════════════════════════════════


@router.put("/{sk_id}")
async def update_sk_mengajar_draft(
    sk_id: str,
    body: SkFinalizeInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_admin_or_kaprodi),
):
    """Operator mengisi manual nomor surat & tanggal penetapan pada SK draft."""
    doc = await db.sk_mengajar.find_one({"id": sk_id, "status": {"$ne": "deleted"}}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="SK tidak ditemukan")
    if doc.get("status") == "final":
        raise HTTPException(status_code=409, detail="SK final terkunci. Nomor & tanggal ditetapkan saat finalisasi.")
    updates: Dict[str, Any] = {"updated_at": now_iso()}
    if body.nomor_sk is not None:
        nomor = str(body.nomor_sk).strip()
        if not nomor:
            raise HTTPException(status_code=400, detail="Nomor surat tidak boleh kosong")
        updates["nomor_sk"] = nomor
    if body.tanggal_sk is not None:
        if not str(body.tanggal_sk).strip():
            raise HTTPException(status_code=400, detail="Tanggal surat tidak boleh kosong")
        updates["tanggal_sk"] = str(body.tanggal_sk).strip()
    await db.sk_mengajar.update_one({"id": sk_id}, {"$set": updates})
    fresh = await db.sk_mengajar.find_one({"id": sk_id}, {"_id": 0})
    return {"ok": True, "sk": fresh}


@router.put("/{sk_id}/final")
async def finalize_sk_mengajar(
    sk_id: str,
    body: SkFinalizeInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_admin_or_kaprodi),
):
    doc = await db.sk_mengajar.find_one({"id": sk_id, "status": {"$ne": "deleted"}}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="SK tidak ditemukan")
    nomor_sk = str(body.nomor_sk or doc.get("nomor_sk") or "").strip()
    tanggal_sk = str(body.tanggal_sk or doc.get("tanggal_sk") or "").strip()
    if not nomor_sk:
        raise HTTPException(status_code=400, detail="Nomor surat belum diisi. Isi manual oleh operator sebelum finalisasi.")
    if not tanggal_sk:
        raise HTTPException(status_code=400, detail="Tanggal penetapan belum diisi. Isi manual oleh operator sebelum finalisasi.")
    updates: Dict[str, Any] = {
        "status": "final",
        "nomor_sk": nomor_sk,
        "tanggal_sk": tanggal_sk,
        "updated_at": now_iso(),
    }
    try:
        settings = await db.app_settings.find_one({"id": "main"}, {"_id": 0}) or {}
        penetap, mengetahui = await _resolve_pejabat_blocks(
            db,
            settings,
            user={"name": doc.get("created_by", "")},
            prodi_id=(doc.get("prodi") or {}).get("id", "") or (doc.get("dosen") or {}).get("prodi_id", ""),
        )
        if penetap.get("nama"):
            updates["penetap"] = penetap
        if mengetahui.get("nama"):
            updates["mengetahui"] = mengetahui
    except Exception:
        pass
    await db.sk_mengajar.update_one({"id": sk_id}, {"$set": updates})
    return {"ok": True, "id": sk_id, "status": "final", "nomor_sk": nomor_sk, "tanggal_sk": tanggal_sk}


@router.delete("/{sk_id}")
async def delete_sk_mengajar(
    sk_id: str,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_admin_or_kaprodi),
):
    doc = await db.sk_mengajar.find_one({"id": sk_id, "status": {"$ne": "deleted"}}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="SK tidak ditemukan")
    if doc.get("status") == "final":
        raise HTTPException(status_code=409, detail="SK final tidak dapat dihapus. Batalkan/arsipkan bila tidak terpakai.")
    await db.sk_mengajar.update_one(
        {"id": sk_id},
        {"$set": {"status": "deleted", "deleted_at": now_iso(), "updated_at": now_iso()}},
    )
    return {"ok": True}


# ═════════════════════════════════════════════════════════════════════════════
#  CETAK + VALIDASI QR
# ═════════════════════════════════════════════════════════════════════════════


def _qr_png_data_url(content: str) -> str:
    import base64
    import io

    import segno

    qr = segno.make(content, error="m")
    buf = io.BytesIO()
    qr.save(buf, kind="png", scale=6, border=2)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


@router.post("/{sk_id}/cetak")
async def cetak_sk_mengajar(
    sk_id: str,
    body: SkCetakInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    user: Dict[str, Any] = Depends(require_admin_or_kaprodi),
):
    doc = await db.sk_mengajar.find_one({"id": sk_id, "status": {"$ne": "deleted"}}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="SK tidak ditemukan")
    if not str(doc.get("nomor_sk") or "").strip():
        raise HTTPException(status_code=400, detail="Nomor surat belum diisi. Isi nomor & tanggal pada detail SK sebelum mencetak.")

    # Kop selalu memakai header/footer resmi terbaru dari pengaturan kampus.
    settings = await db.app_settings.find_one({"id": "main"}, {"_id": 0}) or {}
    kop = _kop_from_settings(settings)
    try:
        await db.sk_mengajar.update_one({"id": sk_id}, {"$set": {"kop": kop, "updated_at": now_iso()}})
        doc["kop"] = kop
    except Exception:
        pass

    base = str(body.validate_base_url or request.base_url).rstrip("/")
    common = {
        "sk_id": sk_id,
        "nomor_sk": doc.get("nomor_sk", ""),
        "dosen_name": doc.get("dosen", {}).get("nama", ""),
        "tahun_ajaran": doc.get("tahun_ajaran", ""),
        "semester": doc.get("semester", ""),
        "jumlah_mk": doc.get("jumlah_mk", 0),
        "total_sks": doc.get("total_sks", 0),
        "status_sk": doc.get("status", ""),
        "created_at": now_iso(),
        "status": "valid",
    }

    # Satu QR per penandatangan (TTD digital). QR menggantikan ttd manual.
    signers = []
    for role, label in (("penetap", "Penetap"), ("mengetahui", "Mengetahui")):
        pejabat = doc.get(role) or {}
        if not str(pejabat.get("nama") or "").strip():
            continue
        token = new_id()
        qr_url = f"{base}/api/v1/sk-mengajar/validasi/{token}"
        ident = _pejabat_ident(pejabat)
        validation_doc = {
            "id": token,
            "token": token,
            "qr_url": qr_url,
            "signer_role": role,
            "signer_label": label,
            "signer_jabatan": str(pejabat.get("jabatan") or ""),
            "signer_name": str(pejabat.get("nama") or ""),
            "signer_nip": str(pejabat.get("nip") or ""),
            "signer_nidn": str(pejabat.get("nidn") or ""),
            "signer_nuptk": str(pejabat.get("nuptk") or ""),
            "signer_ident": ident,
            **common,
        }
        await db.sk_validations.insert_one(validation_doc)
        signers.append(
            {
                "role": role,
                "label": label,
                "jabatan": validation_doc["signer_jabatan"],
                "nama": validation_doc["signer_name"],
                "nip": validation_doc["signer_nip"],
                "nidn": validation_doc["signer_nidn"],
                "nuptk": validation_doc["signer_nuptk"],
                "ident": ident,
                "token": token,
                "qr_url": qr_url,
                "qr_png": _qr_png_data_url(qr_url),
            }
        )

    return {
        "ok": True,
        "sk": doc,
        "signers": signers,
        "kop": doc.get("kop", {}),
        "validated_at": now_iso(),
    }