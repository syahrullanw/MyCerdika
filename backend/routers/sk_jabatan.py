"""Router FastAPI untuk Persuratan Akademik — SK Jabatan Akademik Dosen.

Surat Keputusan Penetapan Jabatan Akademik (Fungsional) Dosen, mis. kenaikan
dari Asisten Ahli → Lektor, atau penetapan awal Tenaga Pengajar → Asisten Ahli.

Alur sama dengan SK Mengajar: rekap dosen → generate draft (operator mengisi
jabatan baru, pangkat, golongan, TMT) → isi nomor & tanggal manual →
finalisasi → cetak (kop resmi + TTD elektronik QR) → validasi publik via QR.

Referensi data:
- user (dosen)  : name, nidn, nip, gelar, jabatan_akademik, homebase, ...
- programs      : nama, kode (homebase prodi)
- app_settings  : campus_name, kop_header_url, dst untuk kop surat
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from postgres_database import PostgresDatabase
from routers.master_data import (
    _pejabat_ident,
)
from routers.sk_mengajar import (
    _dosen_profile,
    _kop_from_settings,
    _resolve_pejabat_blocks,
)
from routers.user_access import require_admin as require_authenticated_admin


router = APIRouter(prefix="/api/v1/sk-jabatan", tags=["Persuratan Akademik — SK Jabatan Akademik"])


# ─── helpers kecil ────────────────────────────────────────────────────────────


def get_db(request: Request) -> PostgresDatabase:
    return request.app.state.db


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid4())


def _year_of(value: Optional[str]) -> str:
    if not value:
        return ""
    m = str(value).strip()
    import re

    y = re.search(r"\d{4}", m)
    return y.group(0) if y else ""


# ─── model input ──────────────────────────────────────────────────────────────


class SkJabatanGenerateInput(BaseModel):
    dosen_ids: List[str]
    jabatan_akademik: str
    pangkat: str = ""
    golongan: str = ""
    tmt: Optional[str] = None


class SkJabatanUpdateInput(BaseModel):
    nomor_sk: Optional[str] = None
    tanggal_sk: Optional[str] = None
    jabatan_akademik: Optional[str] = None
    pangkat: Optional[str] = None
    golongan: Optional[str] = None
    tmt: Optional[str] = None


class SkJabatanCetakInput(BaseModel):
    validate_base_url: Optional[str] = None


# ═════════════════════════════════════════════════════════════════════════════
#  REKAP DOSEN
# ═════════════════════════════════════════════════════════════════════════════


@router.get("/rekap/dosen")
async def rekap_dosen_sk_jabatan(
    request: Request,
    q: Optional[str] = None,
    jabatan: Optional[str] = None,
    db: PostgresDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_authenticated_admin),
):
    users = await db.users.find(
        {"role": "lecturer", "status": {"$ne": "deleted"}},
        {"_id": 0},
    ).to_list(1000)

    result = []
    for u in users:
        prof = await _dosen_profile(db, u.get("id", ""))
        if not prof.get("nama"):
            continue
        if q and q.strip().lower() not in prof.get("nama", "").lower():
            continue
        if jabatan and (prof.get("jabatan") or "") != jabatan:
            continue
        existing = await db.sk_jabatan.find(
            {"dosen.dosen_id": u.get("id", ""), "status": {"$ne": "deleted"}},
            {"_id": 0, "id": 1, "nomor_sk": 1, "status": 1, "jabatan_baru": 1, "tmt": 1},
        ).sort("created_at", -1).to_list(1)
        sk = existing[0] if existing else {}
        result.append(
            {
                **prof,
                "sk_id": sk.get("id", ""),
                "sk_nomor": sk.get("nomor_sk", ""),
                "sk_status": sk.get("status", ""),
                "sk_jabatan_baru": sk.get("jabatan_baru", ""),
                "sk_tmt": sk.get("tmt", ""),
            }
        )

    result.sort(key=lambda r: (r.get("nama") or "").lower())
    return result


# ═════════════════════════════════════════════════════════════════════════════
#  GENERATE SK JABATAN AKADEMIK
#  Satu SK per dosen; idempotent terhadap SK yang sudah ada.
# ═════════════════════════════════════════════════════════════════════════════


@router.post("/generate")
async def generate_sk_jabatan(
    body: SkJabatanGenerateInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    user: Dict[str, Any] = Depends(require_authenticated_admin),
):
    jabatan_baru = (body.jabatan_akademik or "").strip()
    if not jabatan_baru:
        raise HTTPException(status_code=400, detail="Jabatan akademik baru wajib diisi")
    dosen_ids = [d for d in (body.dosen_ids or []) if d]
    if not dosen_ids:
        raise HTTPException(status_code=400, detail="Pilih minimal satu dosen")

    tmt = str(body.tmt or date.today().isoformat()).strip()
    tahun_sk = _year_of(tmt) or str(date.today().year)

    settings = await db.app_settings.find_one({"id": "main"}, {"_id": 0}) or {}
    kop = _kop_from_settings(settings)

    created = []
    skipped = []
    for did in dosen_ids:
        existing = await db.sk_jabatan.find_one(
            {"dosen.dosen_id": did, "status": {"$ne": "deleted"}},
            {"_id": 0, "id": 1, "status": 1, "nomor_sk": 1},
        )
        if existing:
            if existing.get("status") == "draft":
                try:
                    prof_refresh = await _dosen_profile(db, did)
                    penetap, mengetahui = await _resolve_pejabat_blocks(
                        db, settings, user=user, prodi_id=prof_refresh.get("prodi_id", "")
                    )
                    await db.sk_jabatan.update_one(
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

        penetap, mengetahui = await _resolve_pejabat_blocks(
            db, settings, user=user or {}, prodi_id=prof.get("prodi_id", "")
        )
        doc = {
            "id": new_id(),
            "nomor_sk": "",
            "jenis": "penetapan",
            "jabatan_lama": prof.get("jabatan", ""),
            "jabatan_baru": jabatan_baru,
            "pangkat_lama": prof.get("pangkat", ""),
            "golongan_lama": prof.get("golongan", ""),
            "pangkat": (body.pangkat or "").strip(),
            "golongan": (body.golongan or "").strip(),
            "tmt": tmt,
            "tahun_sk": tahun_sk,
            "dosen": prof,
            "prodi": {
                "id": prof["prodi_id"],
                "nama": prof["prodi_nama"],
                "kode": prof["prodi_kode"],
            },
            "kop": kop,
            "penetap": penetap,
            "mengetahui": mengetahui,
            "status": "draft",
            "tanggal_sk": "",
            "created_at": now_iso(),
            "updated_at": now_iso(),
            "created_by": (user or {}).get("name", ""),
        }
        await db.sk_jabatan.insert_one(doc)
        created.append(
            {
                "sk_id": doc["id"],
                "nomor_sk": "",
                "dosen_id": did,
                "dosen_name": prof["nama"],
                "jabatan_baru": jabatan_baru,
                "tmt": tmt,
            }
        )

    return {"ok": True, "created": created, "skipped": skipped}


# ═════════════════════════════════════════════════════════════════════════════
#  DAFTAR & DETAIL SK
# ═════════════════════════════════════════════════════════════════════════════


@router.get("")
async def list_sk_jabatan(
    request: Request,
    tahun_sk: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
    db: PostgresDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_authenticated_admin),
):
    query: Dict[str, Any] = {"status": {"$ne": "deleted"}}
    if tahun_sk:
        query["tahun_sk"] = tahun_sk
    if status:
        query["status"] = status
    docs = await db.sk_jabatan.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    if q and q.strip():
        needle = q.strip().lower()
        docs = [
            d
            for d in docs
            if needle in str(d.get("nomor_sk", "")).lower()
            or needle in str(d.get("dosen", {}).get("nama", "")).lower()
            or needle in str(d.get("jabatan_baru", "")).lower()
        ]
    return [
        {
            "id": d.get("id"),
            "nomor_sk": d.get("nomor_sk", ""),
            "tahun_sk": d.get("tahun_sk", ""),
            "jabatan_lama": d.get("jabatan_lama", ""),
            "jabatan_baru": d.get("jabatan_baru", ""),
            "pangkat": d.get("pangkat", ""),
            "golongan": d.get("golongan", ""),
            "tmt": d.get("tmt", ""),
            "dosen": d.get("dosen", {}),
            "prodi": d.get("prodi", {}),
            "status": d.get("status", ""),
            "tanggal_sk": d.get("tanggal_sk", ""),
            "created_at": d.get("created_at", ""),
        }
        for d in docs
    ]


@router.get("/validasi/{token}")
async def validasi_sk_jabatan(
    token: str,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
):
    """Validasi publik SK via QR. Publik (tanpa login)."""
    doc = await db.sk_jabatan_validations.find_one({"token": token}, {"_id": 0})
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
        "jabatan_baru": doc.get("jabatan_baru", ""),
        "pangkat": doc.get("pangkat", ""),
        "golongan": doc.get("golongan", ""),
        "tmt": doc.get("tmt", ""),
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
          <h1>Validasi Surat Keputusan (SK) Jabatan Akademik</h1>
          <p>{esc(payload.get('message',''))}</p>
          <table class="meta">
            <tr><th>Nomor SK</th><td>{esc(payload.get('nomor_sk',''))}</td></tr>
            <tr><th>Dosen</th><td>{esc(payload.get('dosen_name',''))}</td></tr>
            <tr><th>Jabatan Akademik</th><td>{esc(payload.get('jabatan_baru',''))}</td></tr>
            <tr><th>Pangkat / Golongan</th><td>{esc(payload.get('pangkat',''))} {esc(payload.get('golongan',''))}</td></tr>
            <tr><th>Terhitung Mulai Tanggal</th><td>{esc(payload.get('tmt',''))}</td></tr>
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
<title>Validasi SK Jabatan Akademik</title>
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
<footer>Sistem Informasi Akademik — validasi otomatis hasil cetak SK Jabatan Akademik.</footer>
</main>
</body>
</html>"""


@router.get("/{sk_id}")
async def detail_sk_jabatan(
    sk_id: str,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_authenticated_admin),
):
    doc = await db.sk_jabatan.find_one({"id": sk_id, "status": {"$ne": "deleted"}}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="SK tidak ditemukan")
    return doc


# ═════════════════════════════════════════════════════════════════════════════
#  EDIT DRAFT, FINALISASI, HAPUS & CETAK
# ═════════════════════════════════════════════════════════════════════════════


@router.put("/{sk_id}")
async def update_sk_jabatan_draft(
    sk_id: str,
    body: SkJabatanUpdateInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_authenticated_admin),
):
    """Operator mengisi manual nomor, tanggal, dan rincian jabatan pada draft."""
    doc = await db.sk_jabatan.find_one({"id": sk_id, "status": {"$ne": "deleted"}}, {"_id": 0})
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
    if body.jabatan_akademik is not None:
        if not str(body.jabatan_akademik).strip():
            raise HTTPException(status_code=400, detail="Jabatan akademik tidak boleh kosong")
        updates["jabatan_baru"] = str(body.jabatan_akademik).strip()
    if body.pangkat is not None:
        updates["pangkat"] = str(body.pangkat).strip()
    if body.golongan is not None:
        updates["golongan"] = str(body.golongan).strip()
    if body.tmt is not None:
        tmt = str(body.tmt).strip()
        if not tmt:
            raise HTTPException(status_code=400, detail="TMT tidak boleh kosong")
        updates["tmt"] = tmt
        updates["tahun_sk"] = _year_of(tmt) or updates.get("tahun_sk", "")
    await db.sk_jabatan.update_one({"id": sk_id}, {"$set": updates})
    fresh = await db.sk_jabatan.find_one({"id": sk_id}, {"_id": 0})
    return {"ok": True, "sk": fresh}


@router.put("/{sk_id}/final")
async def finalize_sk_jabatan(
    sk_id: str,
    body: SkJabatanUpdateInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_authenticated_admin),
):
    doc = await db.sk_jabatan.find_one({"id": sk_id, "status": {"$ne": "deleted"}}, {"_id": 0})
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
    await db.sk_jabatan.update_one({"id": sk_id}, {"$set": updates})
    return {"ok": True, "id": sk_id, "status": "final", "nomor_sk": nomor_sk, "tanggal_sk": tanggal_sk}


@router.delete("/{sk_id}")
async def delete_sk_jabatan(
    sk_id: str,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    _: Dict[str, Any] = Depends(require_authenticated_admin),
):
    doc = await db.sk_jabatan.find_one({"id": sk_id, "status": {"$ne": "deleted"}}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="SK tidak ditemukan")
    if doc.get("status") == "final":
        raise HTTPException(status_code=409, detail="SK final tidak dapat dihapus. Batalkan/arsipkan bila tidak terpakai.")
    await db.sk_jabatan.update_one(
        {"id": sk_id},
        {"$set": {"status": "deleted", "deleted_at": now_iso(), "updated_at": now_iso()}},
    )
    return {"ok": True}


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
async def cetak_sk_jabatan(
    sk_id: str,
    body: SkJabatanCetakInput,
    request: Request,
    db: PostgresDatabase = Depends(get_db),
    user: Dict[str, Any] = Depends(require_authenticated_admin),
):
    doc = await db.sk_jabatan.find_one({"id": sk_id, "status": {"$ne": "deleted"}}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="SK tidak ditemukan")
    if not str(doc.get("nomor_sk") or "").strip():
        raise HTTPException(status_code=400, detail="Nomor surat belum diisi. Isi nomor & tanggal pada detail SK sebelum mencetak.")

    # Kop selalu memakai header/footer resmi terbaru dari pengaturan kampus.
    settings = await db.app_settings.find_one({"id": "main"}, {"_id": 0}) or {}
    kop = _kop_from_settings(settings)
    try:
        await db.sk_jabatan.update_one({"id": sk_id}, {"$set": {"kop": kop, "updated_at": now_iso()}})
        doc["kop"] = kop
    except Exception:
        pass

    base = str(body.validate_base_url or request.base_url).rstrip("/")
    common = {
        "sk_id": sk_id,
        "nomor_sk": doc.get("nomor_sk", ""),
        "dosen_name": doc.get("dosen", {}).get("nama", ""),
        "jabatan_lama": doc.get("jabatan_lama", ""),
        "jabatan_baru": doc.get("jabatan_baru", ""),
        "pangkat": doc.get("pangkat", ""),
        "golongan": doc.get("golongan", ""),
        "tmt": doc.get("tmt", ""),
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
        qr_url = f"{base}/api/v1/sk-jabatan/validasi/{token}"
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
        await db.sk_jabatan_validations.insert_one(validation_doc)
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
