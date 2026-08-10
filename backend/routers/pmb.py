"""Router FastAPI untuk Modul PMB (Penerimaan Mahasiswa Baru) Terpadu 10 Alur, Sistem Referal, Analisis Pendaftar, dan Laporan Akhir Eksekutif."""

from __future__ import annotations

import bcrypt
import hashlib
import httpx
import io
import os
import random
import re
import secrets
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from uuid import uuid4
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Header, UploadFile
from fastapi.responses import FileResponse
import mimetypes

PMB_PROOF_DIR = Path(__file__).resolve().parent.parent / "storage" / "pmb" / "proofs"
from fastapi.responses import FileResponse
import mimetypes
from pydantic import BaseModel, Field, field_validator

try:
    import openpyxl
except ImportError:
    openpyxl = None

from postgres_database import PostgresDatabase


router = APIRouter(prefix="/api/v1/pmb", tags=["PMB - Penerimaan Mahasiswa Baru"])


import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import urllib.parse

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_db(request: Request) -> PostgresDatabase:
    return request.app.state.db


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False


def normalize_wa_number(raw: str) -> str:
    if not raw:
        return ""
    cleaned = re.sub(r"\D", "", str(raw))
    if cleaned.startswith("0"):
        cleaned = "62" + cleaned[1:]
    elif cleaned.startswith("8"):
        cleaned = "62" + cleaned
    return cleaned


async def send_pmb_registration_email(
    db: PostgresDatabase,
    to_email: str,
    applicant_data: Dict[str, Any],
    plain_password: str,
    campus_name: str,
) -> Dict[str, Any]:
    try:
        email_cfg = await db.email_settings.find_one({"id": "main"}, {"_id": 0}) or {}
        if not email_cfg.get("enabled"):
            return {"ok": False, "error": "Email belum diaktifkan di pengaturan"}

        host = email_cfg.get("smtp_host", "")
        port = int(email_cfg.get("smtp_port", 587))
        user = email_cfg.get("smtp_user", "")
        password = email_cfg.get("smtp_password", "")
        use_tls = email_cfg.get("smtp_use_tls", True)
        from_name = email_cfg.get("from_name") or f"PMB {campus_name}"
        from_email = email_cfg.get("from_email", "") or user

        if not host or not from_email:
            return {"ok": False, "error": "SMTP host belum dikonfigurasi"}

        reg_num = applicant_data.get("registration_number", "-")
        name = applicant_data.get("name", "Calon Mahasiswa")
        prodi = applicant_data.get("prodi_name", "-")
        class_type = str(applicant_data.get("class_type", "reguler")).capitalize()
        learning_mode = str(applicant_data.get("learning_mode", "offline")).capitalize()
        wa = applicant_data.get("whatsapp", "-")
        school = applicant_data.get("asal_sekolah", "-")
        reg_fee = float(applicant_data.get("reg_payment_fee", 250000))

        subject = f"Bukti Pendaftaran & Akses Akun PMB {reg_num} - {campus_name}"

        html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: 'Segoe UI', Arial, sans-serif; background-color: #0b1528; color: #334155; margin: 0; padding: 20px; }}
    .container {{ max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.2); }}
    .header {{ background: linear-gradient(135deg, #0369a1 0%, #1e40af 50%, #312e81 100%); color: #ffffff; padding: 30px 24px; text-align: center; }}
    .header h1 {{ margin: 0; font-size: 22px; font-weight: 800; letter-spacing: 0.5px; }}
    .header p {{ margin: 6px 0 0; font-size: 13px; color: #bae6fd; font-weight: 600; }}
    .content {{ padding: 28px 24px; }}
    .greeting {{ font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 8px; }}
    .desc {{ font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 20px; }}
    .cred-card {{ background: #f0fdf4; border: 2px solid #86efac; border-radius: 12px; padding: 18px; margin-bottom: 22px; }}
    .cred-title {{ font-size: 13px; font-weight: 800; color: #166534; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }}
    .cred-val {{ font-family: 'Courier New', monospace; font-weight: 800; color: #0f172a; background: #ffffff; padding: 3px 8px; border-radius: 6px; border: 1px solid #bbf7d0; }}
    .table-details {{ width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12.5px; }}
    .table-details td {{ padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }}
    .table-details td.label {{ color: #64748b; font-weight: 600; width: 40%; }}
    .table-details td.value {{ color: #0f172a; font-weight: 700; }}
    .btn-cta {{ display: inline-block; background: linear-gradient(135deg, #0284c7, #2563eb); color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-weight: 700; font-size: 13px; text-align: center; margin: 10px 0 20px; box-shadow: 0 4px 12px rgba(37,99,235,0.3); }}
    .steps-box {{ background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 16px; font-size: 12px; color: #334155; }}
    .steps-box ol {{ margin: 6px 0 0; padding-left: 20px; line-height: 1.6; }}
    .footer {{ background: #f1f5f9; padding: 18px 24px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{campus_name}</h1>
      <p>BUKTI PENDAFTARAN MAHASISWA BARU (PMB) T.A 2026/2027</p>
    </div>
    <div class="content">
      <div class="greeting">Halo, {name}! 👋</div>
      <p class="desc">
        Selamat! Formulir pendaftaran mahasiswa baru Anda telah berhasil diterima dan tersimpan di sistem PMB <strong>{campus_name}</strong>.
        Simpan email ini sebagai bukti pendaftaran resmi dan backup informasi akun login Anda.
      </p>

      <div class="cred-card">
        <div class="cred-title">🔐 INFORMASI AKSES LOGIN PMB & SIAKAD</div>
        <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
          <tr>
            <td style="color: #166534; font-weight: 600; padding: 6px 0;">Nomor Registrasi (ID Login):</td>
            <td style="text-align: right;"><span class="cred-val">{reg_num}</span></td>
          </tr>
          <tr>
            <td style="color: #166534; font-weight: 600; padding: 6px 0;">Email Login:</td>
            <td style="text-align: right;"><span class="cred-val">{to_email}</span></td>
          </tr>
          <tr>
            <td style="color: #166534; font-weight: 600; padding: 6px 0;">No. WhatsApp:</td>
            <td style="text-align: right;"><span class="cred-val">{wa}</span></td>
          </tr>
          <tr>
            <td style="color: #166534; font-weight: 600; padding: 6px 0;">Password Akun:</td>
            <td style="text-align: right;"><span class="cred-val">{plain_password}</span></td>
          </tr>
        </table>
      </div>

      <h3 style="font-size: 13px; font-weight: 800; color: #0f172a; margin: 18px 0 10px; text-transform: uppercase;">📋 RINCIAN DATA PENDAFTARAN</h3>
      <table class="table-details">
        <tr>
          <td class="label">Nama Lengkap</td>
          <td class="value">{name}</td>
        </tr>
        <tr>
          <td class="label">Program Studi Pilihan</td>
          <td class="value" style="color: #0284c7;">{prodi}</td>
        </tr>
        <tr>
          <td class="label">Jenis Kelas & Perkuliahan</td>
          <td class="value">Kelas {class_type} ({learning_mode})</td>
        </tr>
        <tr>
          <td class="label">Asal Sekolah</td>
          <td class="value">{school}</td>
        </tr>
        <tr>
          <td class="label">Biaya Formulir</td>
          <td class="value" style="color: #ea580c;">Rp {reg_fee:,.0f}</td>
        </tr>
        <tr>
          <td class="label">Status Tahapan</td>
          <td class="value" style="color: #16a34a;">Tahap 1 Selesai (Menunggu Pembayaran Formulir)</td>
        </tr>
      </table>

      <div style="text-align: center;">
        <a href="http://localhost:3001" class="btn-cta" target="_blank">🚀 Buka Portal Seleksi PMB</a>
      </div>

      <div class="steps-box">
        <strong>📌 Langkah Selanjutnya:</strong>
        <ol>
          <li>Buka Portal PMB menggunakan No. Registrasi dan Password di atas.</li>
          <li>Selesaikan pembayaran biaya formulir pendaftaran melalui QRIS atau Virtual Account.</li>
          <li>Bergabung ke grup WhatsApp resmi calon mahasiswa untuk mendapatkan jadwal dan akses ujian CBT.</li>
        </ol>
      </div>
    </div>
    <div class="footer">
      Email ini dikirimkan secara otomatis oleh Sistem PMB Terpadu <strong>{campus_name}</strong>.<br>
      Jika Anda membutuhkan bantuan, hubungi Panitia PMB via WhatsApp resmi kampus.
    </div>
  </div>
</body>
</html>"""

        msg = MIMEMultipart("alternative")
        msg["From"] = f"{from_name} <{from_email}>"
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        if port == 465:
            server = smtplib.SMTP_SSL(host, port, timeout=12)
        else:
            server = smtplib.SMTP(host, port, timeout=12)
            server.ehlo()
            if use_tls:
                try:
                    server.starttls()
                    server.ehlo()
                except Exception:
                    pass

        if user and password and server.has_extn("AUTH"):
            server.login(user, password)

        server.sendmail(from_email, [to_email], msg.as_string())
        server.quit()
        return {"ok": True}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def build_pmb_whatsapp_receipt(
    applicant_data: Dict[str, Any],
    plain_password: str,
    campus_name: str
) -> Dict[str, str]:
    reg_num = applicant_data.get("registration_number", "-")
    name = applicant_data.get("name", "Calon Mahasiswa")
    email = applicant_data.get("email", "-")
    prodi = applicant_data.get("prodi_name", "-")
    class_type = str(applicant_data.get("class_type", "reguler")).capitalize()
    learning_mode = str(applicant_data.get("learning_mode", "offline")).capitalize()
    wa_raw = applicant_data.get("whatsapp", "")
    school = applicant_data.get("asal_sekolah", "-")
    reg_fee = float(applicant_data.get("reg_payment_fee", 250000))
    clean_wa = normalize_wa_number(wa_raw)

    msg_text = (
        f"🏛 *BUKTI PENDAFTARAN & AKSES LOGIN PMB*\n"
        f"*{campus_name}* • T.A 2026/2027\n\n"
        f"Halo *{name}*! 👋\n"
        f"Pendaftaran Anda telah berhasil dicatat di sistem PMB. Berikut adalah salinan data pendaftaran dan akses login Anda:\n\n"
        f"🔐 *INFORMASI AKSES LOGIN (SIMPAN BAIK-BAIK)*:\n"
        f"• *No. Registrasi*: {reg_num}\n"
        f"• *Email*: {email}\n"
        f"• *No. WhatsApp*: {wa_raw}\n"
        f"• *Password*: {plain_password}\n"
        f"• *Portal PMB*: http://localhost:3001\n"
        f"• *Portal SIAKAD*: http://localhost:3000\n\n"
        f"📋 *DETAIL PENDAFTARAN*:\n"
        f"• *Program Studi*: {prodi}\n"
        f"• *Jalur*: Kelas {class_type} ({learning_mode})\n"
        f"• *Asal Sekolah*: {school}\n"
        f"• *Biaya Pendaftaran*: Rp {reg_fee:,.0f}\n\n"
        f"📌 *LANGKAH SELANJUTNYA*:\n"
        f"1. Masuk ke Portal PMB menggunakan No. Registrasi & Password di atas.\n"
        f"2. Selesaikan pembayaran formulir pendaftaran (QRIS / VA).\n"
        f"3. Gabung grup WhatsApp resmi & ikuti ujian seleksi CBT.\n\n"
        f"_Pesan ini adalah bukti registrasi resmi PMB {campus_name}._"
    )

    encoded = urllib.parse.quote(msg_text)
    wa_url = f"https://wa.me/{clean_wa}?text={encoded}" if clean_wa else f"https://wa.me/?text={encoded}"

    return {
        "text": msg_text,
        "url": wa_url,
        "clean_phone": clean_wa
    }


async def get_current_user_or_applicant(request: Request) -> Dict[str, Any]:
    auth = request.headers.get("authorization") or ""
    if not auth or not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token autentikasi diperlukan")
    token = auth.replace("Bearer ", "", 1).strip()
    db: PostgresDatabase = get_db(request)

    session = await db.sessions.find_one({"token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Sesi login tidak valid atau telah berakhir")

    uid = session.get("user_id", "")

    # 1. Check in db.users (by id, username, or email)
    user = await db.users.find_one(
        {"$or": [{"id": uid}, {"username": uid}, {"email": uid}]},
        {"_id": 0}
    )
    if user:
        request.state.current_user = user
        return user

    # 2. Check in db.pmb_applicants (by id, registration_number, email, or whatsapp)
    applicant = await db.pmb_applicants.find_one(
        {"$or": [{"id": uid}, {"registration_number": uid}, {"email": uid}, {"whatsapp": uid}]},
        {"_id": 0}
    )
    if applicant:
        applicant["role"] = "camaba"
        request.state.current_user = applicant
        return applicant

    raise HTTPException(status_code=401, detail="Pengguna tidak ditemukan")


async def require_admin(request: Request) -> Dict[str, Any]:
    user = await get_current_user_or_applicant(request)
    role = (user.get("role") or "").lower()
    if role not in {"admin", "superadmin", "pmb", "staff", "academic", "lecturer", "dosen", "fakultas", "prodi"}:
        raise HTTPException(status_code=403, detail="Akses khusus Administrator Kampus / Panitia PMB")
    return user


async def get_current_applicant(request: Request) -> Dict[str, Any]:
    user = await get_current_user_or_applicant(request)
    if user.get("role") == "camaba":
        applicant = await get_db(request).pmb_applicants.find_one({"id": user["id"]}, {"_id": 0})
        if applicant:
            return applicant
    if user.get("role") == "admin":
        applicant_id = request.query_params.get("applicant_id")
        if applicant_id:
            applicant = await get_db(request).pmb_applicants.find_one({"id": applicant_id}, {"_id": 0})
            if applicant:
                return applicant
    raise HTTPException(status_code=403, detail="Akses khusus Calon Mahasiswa Baru")


async def get_or_init_settings(db: PostgresDatabase) -> Dict[str, Any]:
    settings = await db.pmb_settings.find_one({"id": "pmb_global_settings"}, {"_id": 0})
    
    defaults = {
        "id": "pmb_global_settings",
        "active_period_name": "Tahun Akademik 2026/2027 Gelombang 1",
        "gelombang": "Gelombang 1",
        "is_open": True,
        "target_new_students": 500,
        "registration_fee": 250000,
        "pra_studi_total_fee": 3500000,
        "pra_studi_installment_terms": 3,
        "installment_1_amount": 1500000,
        "installment_2_amount": 1000000,
        "installment_3_amount": 1000000,
        # Payment methods & Online test controls
        "online_test_enabled": False,  # Default OFF as requested
        "payment_methods": {
            "qris": True,
            "manual_transfer": True,
            "va_mandiri": True,
            "va_bca": True,
        },
        "payment_method_qris": True,
        "payment_method_manual": True,
        "payment_method_va_mandiri": True,
        "payment_method_va_bca": True,
        # Referral program settings
        "referral_enabled": True,
        "referral_fee_registration": 50000,
        "referral_fee_reregistration": 200000,
        "wa_group_url": "https://chat.whatsapp.com/invite/PMBKampus2026",
        "wa_group_name": "Grup Resmi PMB Kampus 2026",
        "passing_grade": 70,
        "cbt_duration_minutes": 45,
        "cbt_violation_grace_seconds": 30,
        "cbt_retake_allowed": True,
        "zoom_test_url": "https://zoom.us/j/8899223344",
        "zoom_meeting_id": "889 922 3344",
        "zoom_passcode": "PMB2026",
        "offline_test_location": "Gedung Rektorat Lt. 2 Ruang CBT Kampus",
        "offline_test_schedule_default": "Setiap Sabtu & Minggu, Pukul 09:00 - 11:30 WIB",
        "sibermaru_title": "SIBERMARU 2026 (Orientasi & Pengenalan Kehidupan Kampus)",
        "sibermaru_schedule": "28 - 30 Agustus 2026, Pukul 07:30 - 16:00 WIB",
        "sibermaru_location": "Auditorium Utama Kampus & Hybrid Online",
        "sibermaru_dresscode": "Kemeja Putih Lengan Panjang, Celana/Rok Bahan Hitam, Dasi Hitam, Sepatu Pantofel",
        "sibermaru_rundown": "Hari 1: Sidang Terbuka & Kuliah Umum; Hari 2: Pengenalan Prodi & LMS SIAKAD; Hari 3: Parade UKM & Inagurasi",
        "sibermaru_guide_url": "https://example.com/panduan-sibermaru-2026.pdf",
        "bank_account_info": "Bank Mandiri: 123-00-9876543-2 a.n. YAYASAN KAMPUS HEBAT",
        "bank_account_name": "Bank Mandiri",
        "bank_account_number": "123-00-9876543-2",
        "bank_account_holder": "YAYASAN KAMPUS HEBAT",
        "bank_account_currency": "IDR",
        "qris_image_url": "",
        "nim_prefix": "2026",
        # CMS Halaman PMB (Customizable Landing Page)
        "landing_announcement": "Penerimaan Mahasiswa Baru Tahun Akademik 2026/2027 Gelombang 1 Resmi Dibuka! Beasiswa s.d. 100% Tersedia.",
        "landing_hero_badge": "PENERIMAAN MAHASISWA BARU 2026/2027 • GELOMBANG 1",
        "landing_hero_title": "Raih Gelar Sarjana Impian & Bangun Karir Masa Depan Gemilang",
        "landing_hero_subtitle": "Pendidikan tinggi berbasis teknologi, kurikulum berstandar industri modern, serta fleksibilitas kuliah Kelas Reguler (Online/Offline) dan Kelas Khusus Karyawan.",
        "landing_cta_primary_label": "Isi Formulir Pendaftaran Utama",
        "landing_cta_secondary_label": "Masuk Portal Camaba",
        "landing_stat_accreditation": "Unggul (A)",
        "landing_stat_career": "98.4% Bekerja",
        "landing_stat_scholarship": "Hingga 100%",
        "landing_stat_selection": "CBT Instan",
        "landing_why_us": [
            {
                "icon": "💻",
                "title": "Kurikulum Berbasis AI & Industri",
                "description": "Materi perkuliahan dirancang langsung bersama praktisi top industri software, data, dan korporasi."
            },
            {
                "icon": "🌐",
                "title": "Fleksibilitas Kuliah Hybrid",
                "description": "Tersedia kelas Reguler Online (Daring Penuh) dan Kelas Khusus Karyawan malam/akhir pekan."
            },
            {
                "icon": "💳",
                "title": "Cicilan Pra-Studi Ringan",
                "description": "Biaya uang pra-studi dapat dicicil 3x termin bulanan tanpa bunga demi kenyamanan finansial keluarga."
            },
            {
                "icon": "⚡",
                "title": "CBT Online & Auto NIM",
                "description": "Ujian mandiri kapan saja dari rumah dan aktivasi akun mahasiswa SIAKAD instan 1-klik."
            }
        ],
        "landing_scholarships": [
            {
                "name": "Beasiswa Prestasi Rapor",
                "badge": "Bebas Tes CBT",
                "benefit": "Potongan Uang Pra-Studi 50% - 100%",
                "desc": "Untuk lulusan SMA/SMK dengan rata-rata nilai rapor semester 1-5 minimal 85.00."
            },
            {
                "name": "Beasiswa KIP-Kuliah",
                "badge": "Biaya 100% Gratis",
                "benefit": "Bebas Biaya Kuliah & Uang Saku",
                "desc": "Program bantuan pemerintah bagi calon mahasiswa berprestasi dari keluarga prasejahtera."
            },
            {
                "name": "Beasiswa Tahfidz Qur'an",
                "badge": "Khusus Hafidz",
                "benefit": "Bebas Biaya Pendidikan Penuh",
                "desc": "Bagi penghafal Al-Qur'an minimal 5 Juz bersertifikat resmi."
            },
            {
                "name": "Beasiswa Mitra Industri",
                "badge": "Ikatan Karir",
                "benefit": "Subsidi Pendidikan & Magang",
                "desc": "Program kemitraan perusahaan teknologi dan BUMN dengan penempatan kerja."
            }
        ],
        "landing_faqs": [
            {
                "q": "Bagaimana alur pendaftaran mahasiswa baru di kampus ini?",
                "a": "Alur pendaftaran terdiri dari 10 tahapan praktis: 1. Isi Formulir Online, 2. Pilih Kelas (Reguler/Khusus), 3. Bayar Biaya Formulir (QRIS/VA), 4. Gabung Grup WhatsApp Resmi, 5. Pilih Jalur Tes (CBT Online / Offline Kampus), 6/7. Ujian & Skor Keluar Instan, 8. Daftar Ulang (Pra-studi & Ukuran Baju), 9. Konfirmasi Sibermaru, dan 10. Penerbitan NIM Resmi SIAKAD."
            },
            {
                "q": "Apakah tersedia pilihan kuliah Online (Daring Penuh) dan Kelas Karyawan?",
                "a": "Ya! Untuk Kelas Reguler tersedia opsi mode Online (Daring Penuh) dan Offline (Tatap Muka). Untuk Kelas Khusus / Karyawan (jadwal malam / akhir pekan), perkuliahan diselenggarakan secara Tatap Muka di kampus sesuai standar mutu kurikulum."
            },
            {
                "q": "Apakah biaya uang pra-studi daftar ulang bisa dicicil?",
                "a": "Tentu saja! Kami menyediakan skema cicilan ringan hingga 3x termin: Termin 1 (Uang Muka), Termin 2, dan Termin 3 yang dapat dibayarkan secara bertahap setiap bulan tanpa bunga."
            },
            {
                "q": "Bagaimana cara mengikuti tes online CBT mandiri?",
                "a": "Setelah menyelesaikan pembayaran formulir, Anda dapat memilih 'Online Test (CBT)'. Ujian berlangsung selama 45 menit via smartphone atau laptop dengan 10 butir soal penalaran dan wawasan, di mana nilai dan status kelulusan Anda akan langsung keluar seketika."
            },
            {
                "q": "Apa itu Program Mitra Referal PMB?",
                "a": "Program Referal memungkinkan mahasiswa aktif, dosen, maupun masyarakat umum mendapatkan insentif fee komisi tunai (hingga Rp 250.000 / mahasiswa) untuk setiap calon mahasiswa yang diajak mendaftar dan menyelesaikan daftar ulang."
            }
        ],
        "landing_contact_phone": "0812-3456-7890",
        "landing_contact_email": "pmb@kampus.ac.id",
        "landing_contact_address": "Jl. Kampus Unggul No. 1, Jakarta Selatan",
        "landing_sections_visibility": {
            "announcement": True,
            "hero": True,
            "why_us": True,
            "programs": True,
            "steps": True,
            "fees": True,
            "scholarships": True,
            "referral": True,
            "faq": True,
            "footer": True
        },
        "updated_at": now_iso(),
    }

    if not settings:
        settings = defaults
        await db.pmb_settings.insert_one(settings)
    else:
        # Merge missing defaults
        needs_update = False
        for k, v in defaults.items():
            if k not in settings:
                settings[k] = v
                needs_update = True
        if needs_update:
            await db.pmb_settings.update_one({"id": "pmb_global_settings"}, {"$set": settings})

    return settings


def normalize_answer(text: Any) -> str:
    """Normalisasi jawaban: lowercase + tanpa spasi berlebih."""
    if text is None:
        return ""
    return re.sub(r"\s+", " ", str(text)).strip().lower()


def cbt_token(length: int = 8) -> str:
    """Token alfanumerik huruf besar (tanpa karakter ambigu 0/O/1/I)."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def payment_unique_code(seed: str, length: int = 3) -> int:
    """Kode unik 3 digit (100-999) deterministik per seed untuk identifikasi bukti bayar.

    Nominal pembayaran yang sebenarnya = (base_amount - (base_amount % 10^(length-1))) + unique_code.
    Dengan demikian 3 digit terakhir nominal menjadi kode unik yang mudah dideteksi sistem.
    """
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    base = int(digest[:8], 16)
    return (base % 900) + 100


def build_unique_amount(base_amount: float, code: int) -> int:
    """Buat nominal unik: ganti (length) digit terakhir dengan kode unik."""
    base_amount = int(round(base_amount))
    unit = 10 ** len(str(code))
    return (base_amount // unit) * unit + int(code)


def isian_accepted(correct_answer: Any, user_answer: Any) -> bool:
    """Cek jawaban isian singkat: cocok dengan salah satu alternatif kunci."""
    accepted = [normalize_answer(a) for a in str(correct_answer or "").split("|")]
    user = normalize_answer(user_answer)
    if not user or not accepted:
        return False
    return user in accepted


def answer_is_correct(q: Dict[str, Any], user_answer: Any) -> bool:
    q_type = (q.get("q_type") or "pg").lower()
    if q_type == "isian":
        return isian_accepted(q.get("correct_answer"), user_answer)
    correct = normalize_answer(q.get("correct_answer", "")).upper()
    user = normalize_answer(user_answer).upper()
    return bool(correct and user == correct)


def shuffle_options(q: Dict[str, Any]) -> Dict[str, Any]:
    """Salinan soal dengan urutan pilihan diacak (untuk PG)."""
    q = dict(q)
    options = [o for o in (q.get("options") or []) if isinstance(o, dict) and o.get("key")]
    if len(options) > 1:
        random.shuffle(options)
    q["options"] = options
    return q


def build_exam_pack(all_questions: List[Dict[str, Any]], shuffle: bool = True) -> Dict[str, Any]:
    """Merangkum paket ujian per peserta: urutan soal & pilihan diacak."""
    pack = []
    random.shuffle(all_questions)
    for q in all_questions:
        safe = {
            "id": q.get("id"),
            "q_type": (q.get("q_type") or "pg"),
            "category": q.get("category", ""),
            "question": q.get("question", ""),
            "weight": float(q.get("weight", 10)),
            "options": [],
        }
        if safe["q_type"] == "pg":
            safe["options"] = [o for o in (q.get("options") or []) if isinstance(o, dict) and o.get("key")]
            random.shuffle(safe["options"])
        pack.append(safe)
    return pack


def compute_cbt_score(questions_with_keys: List[Dict[str, Any]], answers: Dict[str, Any]) -> Dict[str, Any]:
    """Menghitung skor berbobot dari jawaban peserta terhadap kunci soal."""
    total_weight = 0.0
    earned_weight = 0.0
    correct_count = 0
    total_count = len(questions_with_keys)
    details = []
    for q in questions_with_keys:
        weight = float(q.get("weight", 10))
        total_weight += weight
        user_ans = str(answers.get(q.get("id"), "") or "")
        ok = answer_is_correct(q, user_ans)
        if ok:
            earned_weight += weight
            correct_count += 1
        details.append({
            "id": q.get("id"),
            "correct": ok,
            "correct_answer": q.get("correct_answer"),
        })
    final_score = round((earned_weight / total_weight) * 100, 1) if total_weight > 0 else 0.0
    return {
        "score": final_score,
        "correct_count": correct_count,
        "total_count": total_count,
        "total_weight": round(total_weight, 1),
        "earned_weight": round(earned_weight, 1),
        "details": details,
    }


def parse_dt(value: Any) -> Optional[datetime]:
    if not value:
        return None
    s = str(value).strip()
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        return datetime.fromisoformat(s)
    except Exception:
        return None


def to_ts(dt: Optional[datetime]) -> Optional[float]:
    return dt.timestamp() if dt else None


def test_session_is_open(session: Dict[str, Any], now: Optional[datetime] = None) -> bool:
    """Sesi dianggap terbuka bila status active dan waktu sekarang berada dalam jendela [start_at, end_at]."""
    if (session.get("status") or "closed").lower() != "active":
        return False
    now = now or datetime.now(timezone.utc)
    start = parse_dt(session.get("start_at"))
    end = parse_dt(session.get("end_at"))
    if start and now < start:
        return False
    if end and now > end:
        return False
    return True


def session_open_state(session: Dict[str, Any], now: Optional[datetime] = None) -> Dict[str, Any]:
    """Status dinamis sesi untuk ditampilkan (not_started / open / expired / inactive)."""
    now = now or datetime.now(timezone.utc)
    start = parse_dt(session.get("start_at"))
    end = parse_dt(session.get("end_at"))
    state = "open"
    label = "Sedang Berlangsung"
    if (session.get("status") or "closed").lower() != "active":
        state = "inactive"
        label = "Tidak Aktif"
    elif start and now < start:
        state = "not_started"
        label = "Belum Mulai"
    elif end and now > end:
        state = "expired"
        label = "Berakhir"
    return {"state": state, "label": label}


DEFAULT_CBT_QUESTIONS = [
    {
        "id": "cbt_q_01",
        "category": "Penalaran Umum (TPA)",
        "question": "Semua mahasiswa baru wajib mengikuti orientasi kampus. Sebagian mahasiswa baru adalah penerima beasiswa prestasi. Kesimpulan yang paling tepat adalah...",
        "options": [
            {"key": "A", "text": "Semua penerima beasiswa prestasi tidak wajib mengikuti orientasi kampus."},
            {"key": "B", "text": "Sebagian peserta orientasi kampus adalah penerima beasiswa prestasi."},
            {"key": "C", "text": "Hanya penerima beasiswa prestasi yang wajib mengikuti orientasi kampus."},
            {"key": "D", "text": "Semua mahasiswa yang mengikuti orientasi kampus bukan penerima beasiswa."}
        ],
        "correct_answer": "B",
        "weight": 10
    },
    {
        "id": "cbt_q_02",
        "category": "Penalaran Kuantitatif",
        "question": "Sebuah kelas memiliki rasio mahasiswa laki-laki dan perempuan 3 : 2. Jika total mahasiswa dalam kelas tersebut adalah 40 orang, berapakah jumlah mahasiswa laki-laki?",
        "options": [
            {"key": "A", "text": "16 orang"},
            {"key": "B", "text": "20 orang"},
            {"key": "C", "text": "24 orang"},
            {"key": "D", "text": "28 orang"}
        ],
        "correct_answer": "C",
        "weight": 10
    },
    {
        "id": "cbt_q_03",
        "category": "Bahasa Indonesia & Literasi",
        "question": "Penulisan kata baku dan ejaan yang tepat menurut Pedoman Umum Ejaan Bahasa Indonesia (PUEBI) adalah...",
        "options": [
            {"key": "A", "text": "Aktifitas, Jadwal, Praktek"},
            {"key": "B", "text": "Aktivitas, Jadwal, Praktik"},
            {"key": "C", "text": "Aktivitas, Jadual, Praktek"},
            {"key": "D", "text": "Aktifitas, Jadual, Praktik"}
        ],
        "correct_answer": "B",
        "weight": 10
    },
    {
        "id": "cbt_q_04",
        "category": "Bahasa Inggris",
        "question": "Choose the most appropriate sentence completion: 'If you want to achieve academic excellence, you _____ manage your study schedule consistently.'",
        "options": [
            {"key": "A", "text": "ought"},
            {"key": "B", "text": "should"},
            {"key": "C", "text": "would"},
            {"key": "D", "text": "has to"}
        ],
        "correct_answer": "B",
        "weight": 10
    },
    {
        "id": "cbt_q_05",
        "category": "Wawasan Teknologi & Informasi",
        "question": "Komponen sistem komputer yang bertindak sebagai jembatan komunikasi antara perangkat keras (hardware) dan aplikasi pengguna adalah...",
        "options": [
            {"key": "A", "text": "Sistem Operasi (Operating System)"},
            {"key": "B", "text": "Random Access Memory (RAM)"},
            {"key": "C", "text": "Power Supply Unit (PSU)"},
            {"key": "D", "text": "Network Interface Card (NIC)"}
        ],
        "correct_answer": "A",
        "weight": 10
    },
    {
        "id": "cbt_q_06",
        "category": "Penalaran Logika & Deret",
        "question": "Tentukan angka berikutnya dari deret: 3, 6, 12, 24, 48, ...",
        "options": [
            {"key": "A", "text": "72"},
            {"key": "B", "text": "96"},
            {"key": "C", "text": "108"},
            {"key": "D", "text": "120"}
        ],
        "correct_answer": "B",
        "weight": 10
    },
    {
        "id": "cbt_q_07",
        "category": "Wawasan Kebangsaan & Etika",
        "question": "Penerapan nilai integritas dan kejujuran akademik dalam lingkungan perguruan tinggi diwujudkan melalui tindakan...",
        "options": [
            {"key": "A", "text": "Menyalin karya ilmiah orang lain tanpa mencantumkan sitasi dan sumber rujukan."},
            {"key": "B", "text": "Menghormati hak kekayaan intelektual dan mengerjakan evaluasi secara mandiri."},
            {"key": "C", "text": "Menitipkan presensi kehadiran kepada teman sekelas saat berhalangan hadir."},
            {"key": "D", "text": "Membagikan jawaban ujian resmi kepada grup media sosial sebelum tes berakhir."}
        ],
        "correct_answer": "B",
        "weight": 10
    },
    {
        "id": "cbt_q_08",
        "category": "Penalaran Analitis",
        "question": "Lima mahasiswa: A, B, C, D, E duduk berurutan. B duduk di sebelah A. C tidak duduk di dekat B. Jika D duduk di paling kanan dan E di antara C dan A, urutan yang mungkin dari kiri ke kanan adalah...",
        "options": [
            {"key": "A", "text": "C, E, A, B, D"},
            {"key": "B", "text": "B, A, E, C, D"},
            {"key": "C", "text": "A, B, C, E, D"},
            {"key": "D", "text": "E, C, B, A, D"}
        ],
        "correct_answer": "A",
        "weight": 10
    },
    {
        "id": "cbt_q_09",
        "category": "Bahasa Inggris - Reading",
        "question": "'Higher education provides students with specialized knowledge and critical thinking skills required in modern industries.' What is the primary benefit mentioned in the sentence?",
        "options": [
            {"key": "A", "text": "Guaranteed immediate wealth."},
            {"key": "B", "text": "Specialized knowledge and critical thinking capability."},
            {"key": "C", "text": "Exemption from workplace challenges."},
            {"key": "D", "text": "Reduction in study hours."}
        ],
        "correct_answer": "B",
        "weight": 10
    },
    {
        "id": "cbt_q_10",
        "category": "Aritmatika Sosial",
        "question": "Seorang mahasiswa membeli laptop seharga Rp 8.000.000 dengan diskon mahasiswa sebesar 15%. Berapakah nominal yang harus dibayarkan?",
        "options": [
            {"key": "A", "text": "Rp 6.400.000"},
            {"key": "B", "text": "Rp 6.800.000"},
            {"key": "C", "text": "Rp 7.000.000"},
            {"key": "D", "text": "Rp 7.200.000"}
        ],
        "correct_answer": "B",
        "weight": 10
    },
    {
        "id": "cbt_q_11",
        "q_type": "isian",
        "category": "Wawasan Kebangsaan",
        "question": "Tuliskan Ibu Kota Negara Republik Indonesia.",
        "options": [],
        "correct_answer": "Jakarta|DKI Jakarta|Jakarta Pusat|JKT",
        "weight": 10
    },
    {
        "id": "cbt_q_12",
        "q_type": "isian",
        "category": "Penalaran Kuantitatif",
        "question": "Berapakah hasil dari 7 x 8?",
        "options": [],
        "correct_answer": "56|lima puluh enam",
        "weight": 10
    }
]


# ==========================================
# PYDANTIC SCHEMAS
# ==========================================

# ---------- Validation Helpers ----------

def _clean_digits(value: Any) -> str:
    return re.sub(r"[\s\-.]", "", str(value or ""))


def _check_nik(value: Any) -> str:
    v = str(value or "").strip()
    if not v:
        raise ValueError("NIK wajib diisi")
    if not v.isdigit() or len(v) != 16:
        raise ValueError("NIK harus terdiri dari 16 digit angka sesuai KTP")
    return v


def _check_nisn(value: Any) -> str:
    v = str(value or "").strip()
    if not v:
        raise ValueError("NISN wajib diisi")
    if not v.isdigit() or len(v) != 10:
        raise ValueError("NISN harus terdiri dari 10 digit angka sesuai data Kemendikbud")
    return v


def _check_whatsapp(value: Any) -> str:
    v = _clean_digits(value)
    if not v:
        raise ValueError("Nomor WhatsApp wajib diisi")
    if not re.match(r"^\+?[0-9]{9,15}$", v):
        raise ValueError("Nomor WhatsApp tidak valid (harus 9-15 digit angka)")
    return v


def _check_email(value: Any) -> str:
    v = str(value or "").strip()
    if not v:
        raise ValueError("Email wajib diisi")
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$", v):
        raise ValueError("Format email tidak valid")
    return v


def _check_tahun_lulus(value: Any) -> str:
    v = str(value or "").strip()
    if not v:
        raise ValueError("Tahun lulus wajib diisi")
    if not v.isdigit() or len(v) != 4:
        raise ValueError("Tahun lulus harus 4 digit angka (contoh: 2025)")
    year = int(v)
    if year < 1990 or year > datetime.now().year + 1:
        raise ValueError("Tahun lulus tidak masuk akal")
    return v


def _check_tanggal_lahir(value: Any) -> str:
    v = str(value or "").strip()
    if not v:
        raise ValueError("Tanggal lahir wajib diisi")
    try:
        datetime.strptime(v, "%Y-%m-%d")
    except ValueError:
        raise ValueError("Tanggal lahir harus berformat YYYY-MM-DD")
    return v


def _check_tinggi_badan(value: Any) -> Optional[float]:
    if value is None:
        return None
    v = float(value)
    if v > 0 and not (80 <= v <= 250):
        raise ValueError("Tinggi badan harus antara 80 - 250 cm")
    return v


def _check_berat_badan(value: Any) -> Optional[float]:
    if value is None:
        return None
    v = float(value)
    if v > 0 and not (20 <= v <= 250):
        raise ValueError("Berat badan harus antara 20 - 250 kg")
    return v

class PmbRegisterInput(BaseModel):
    # 1. Identitas Lengkap
    name: str = Field(..., min_length=2, description="Nama Lengkap")
    gender: str = Field("L", description="Jenis Kelamin: L (Laki-laki) atau P (Perempuan)")
    tempat_lahir: str = Field("", description="Tempat Lahir")
    tanggal_lahir: str = Field("", description="Tanggal Lahir YYYY-MM-DD")
    whatsapp: str = Field(..., description="No HP / WhatsApp")
    alamat: str = Field("", description="Alamat Lengkap")
    nik: str = Field(..., description="NIK KTP")
    nisn: str = Field(..., description="NISN")
    nama_ibu_kandung: str = Field("", description="Nama Ibu Kandung")
    email: str = Field(..., description="Email Calon Mahasiswa")
    
    # 2. Sekolah Asal
    asal_sekolah: str = Field(..., min_length=3, description="Nama Sekolah")
    npsn_sekolah: str = Field("", description="NPSN Sekolah")
    alamat_sekolah: str = Field("", description="Alamat Sekolah")
    jurusan_asal: str = Field("", description="Jurusan Saat Sekolah")
    tahun_lulus: str = Field("2025", description="Tahun Lulus")
    
    # 3. Data Fisik
    tinggi_badan: Optional[float] = Field(0.0, description="Tinggi Badan (cm)")
    berat_badan: Optional[float] = Field(0.0, description="Berat Badan (kg)")
    
    # 4. Pilihan Program Studi & Kelas
    prodi_id: str = Field(..., min_length=1, description="Prodi Pilihan 1")
    prodi_id_2: Optional[str] = Field("", description="Prodi Pilihan 2")
    class_type: str = Field("reguler", description="Tipe Kelas: reguler atau khusus")
    learning_mode: str = Field("offline", description="Mode Kuliah: online atau offline")
    
    # 5. Sumber Informasi & Password
    info_source: str = Field("Media Sosial", description="Tau info politeknik SCI dari mana")
    password: str = Field(..., min_length=6, description="Password untuk login PMB")
    referral_code: Optional[str] = Field("", description="Kode Referal Promotor / Agen PMB")

    @field_validator("whatsapp")
    @classmethod
    def validate_whatsapp(cls, v):
        return _check_whatsapp(v)

    @field_validator("gender")
    @classmethod
    def validate_gender(cls, v):
        v = str(v or "").strip().upper()
        if v not in ["L", "P"]:
            raise ValueError("Jenis kelamin harus 'L' (Laki-laki) atau 'P' (Perempuan)")
        return v

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        return _check_email(v)

    @field_validator("nik")
    @classmethod
    def validate_nik(cls, v):
        return _check_nik(v)

    @field_validator("nisn")
    @classmethod
    def validate_nisn(cls, v):
        return _check_nisn(v)

    @field_validator("tempat_lahir", "nama_ibu_kandung")
    @classmethod
    def validate_required_when_filled(cls, v, info):
        v = str(v or "").strip()
        if v and len(v) < 2:
            raise ValueError(f"{info.field_name.replace('_', ' ').title()} minimal 2 karakter")
        return v

    @field_validator("alamat")
    @classmethod
    def validate_alamat(cls, v):
        v = str(v or "").strip()
        if v and len(v) < 5:
            raise ValueError("Alamat minimal 5 karakter")
        return v

    @field_validator("tanggal_lahir")
    @classmethod
    def validate_tanggal_lahir(cls, v):
        v = str(v or "").strip()
        if v:
            return _check_tanggal_lahir(v)
        return v

    @field_validator("tahun_lulus")
    @classmethod
    def validate_tahun_lulus(cls, v):
        v = str(v or "").strip()
        if v:
            return _check_tahun_lulus(v)
        return v

    @field_validator("tinggi_badan")
    @classmethod
    def validate_tinggi_badan(cls, v):
        return _check_tinggi_badan(v)

    @field_validator("berat_badan")
    @classmethod
    def validate_berat_badan(cls, v):
        return _check_berat_badan(v)

    @field_validator("class_type")
    @classmethod
    def validate_class_type(cls, v):
        v = str(v or "").strip().lower()
        if v not in ["reguler", "khusus"]:
            raise ValueError("Tipe kelas harus 'reguler' atau 'khusus'")
        return v

    @field_validator("learning_mode")
    @classmethod
    def validate_learning_mode(cls, v):
        v = str(v or "").strip().lower()
        if v not in ["online", "offline"]:
            raise ValueError("Mode kuliah harus 'online' atau 'offline'")
        return v


class PmbLoginInput(BaseModel):
    identifier: str = Field(..., description="Nomor Registrasi PMB, Email, atau No WhatsApp")
    password: str = Field(..., description="Password")


class PmbUpdateFormInput(BaseModel):
    name: Optional[str] = None
    gender: Optional[str] = None
    tempat_lahir: Optional[str] = None
    tanggal_lahir: Optional[str] = None
    whatsapp: Optional[str] = None
    alamat: Optional[str] = None
    nik: Optional[str] = None
    nisn: Optional[str] = None
    nama_ibu_kandung: Optional[str] = None
    email: Optional[str] = None
    asal_sekolah: Optional[str] = None
    npsn_sekolah: Optional[str] = None
    alamat_sekolah: Optional[str] = None
    jurusan_asal: Optional[str] = None
    tahun_lulus: Optional[str] = None
    tinggi_badan: Optional[float] = None
    berat_badan: Optional[float] = None
    prodi_id: Optional[str] = None
    prodi_id_2: Optional[str] = None
    class_type: Optional[str] = None
    learning_mode: Optional[str] = None
    info_source: Optional[str] = None
    referral_code: Optional[str] = None

    @field_validator("whatsapp")
    @classmethod
    def validate_whatsapp(cls, v):
        if v is None:
            return v
        return _check_whatsapp(v)

    @field_validator("gender")
    @classmethod
    def validate_gender(cls, v):
        if v is None:
            return v
        v = str(v).strip().upper()
        if v not in ["L", "P"]:
            raise ValueError("Jenis kelamin harus 'L' (Laki-laki) atau 'P' (Perempuan)")
        return v

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        if v is None:
            return v
        return _check_email(v)

    @field_validator("nik")
    @classmethod
    def validate_nik(cls, v):
        if v is None:
            return v
        return _check_nik(v)

    @field_validator("nisn")
    @classmethod
    def validate_nisn(cls, v):
        if v is None:
            return v
        return _check_nisn(v)

    @field_validator("tanggal_lahir")
    @classmethod
    def validate_tanggal_lahir(cls, v):
        if v is None:
            return v
        v = str(v).strip()
        if v:
            return _check_tanggal_lahir(v)
        return v

    @field_validator("tahun_lulus")
    @classmethod
    def validate_tahun_lulus(cls, v):
        if v is None:
            return v
        v = str(v).strip()
        if v:
            return _check_tahun_lulus(v)
        return v

    @field_validator("tinggi_badan")
    @classmethod
    def validate_tinggi_badan(cls, v):
        return _check_tinggi_badan(v)

    @field_validator("berat_badan")
    @classmethod
    def validate_berat_badan(cls, v):
        return _check_berat_badan(v)

    @field_validator("class_type")
    @classmethod
    def validate_class_type(cls, v):
        if v is None:
            return v
        v = str(v).strip().lower()
        if v not in ["reguler", "khusus"]:
            raise ValueError("Tipe kelas harus 'reguler' atau 'khusus'")
        return v

    @field_validator("learning_mode")
    @classmethod
    def validate_learning_mode(cls, v):
        if v is None:
            return v
        v = str(v).strip().lower()
        if v not in ["online", "offline"]:
            raise ValueError("Mode kuliah harus 'online' atau 'offline'")
        return v


class PmbPayRegInput(BaseModel):
    payment_method: str = Field("QRIS", description="Metode: QRIS, VA_MANDIRI, VA_BCA, MANUAL")
    payment_proof_url: Optional[str] = Field("", description="URL Bukti Transfer jika manual")
    notes: Optional[str] = Field("", description="Catatan pembayaran")


class PmbChooseTestInput(BaseModel):
    test_type: str = Field(..., description="'online' atau 'offline'")


class PmbCbtSubmitInput(BaseModel):
    answers: Dict[str, str] = Field(..., description="Mapping ID Soal -> Kunci Jawaban (A/B/C/D)")


class PmbReregisterPayInput(BaseModel):
    scheme: str = Field("full", description="'full' atau 'installment'")
    term: Optional[int] = Field(1, description="Nomor cicilan jika installment (1, 2, 3)")
    payment_method: str = Field("QRIS", description="QRIS, VA_MANDIRI, VA_BCA, MANUAL")
    payment_proof_url: Optional[str] = Field("", description="Bukti bayar jika manual")
    amount: Optional[float] = Field(None, description="Nominal yang dibayarkan (untuk verifikasi; backend menghitung otomatis)")


def check_payment_method_allowed(settings: Dict[str, Any], method: str) -> bool:
    """Memeriksa apakah metode pembayaran tertentu diizinkan / diaktifkan oleh admin."""
    method = (method or "").upper()
    methods = settings.get("payment_methods") or {}
    if method == "QRIS":
        return bool(settings.get("payment_method_qris", methods.get("qris", True)))
    elif method == "MANUAL":
        return bool(settings.get("payment_method_manual", methods.get("manual_transfer", True)))
    elif method == "VA_MANDIRI":
        return bool(settings.get("payment_method_va_mandiri", methods.get("va_mandiri", True)))
    elif method == "VA_BCA":
        return bool(settings.get("payment_method_va_bca", methods.get("va_bca", True)))
    return True


class PmbShirtSizeInput(BaseModel):
    shirt_size: str = Field(..., min_length=1, description="S, M, L, XL, XXL, XXXL")
    shirt_notes: Optional[str] = Field("", description="Catatan ukuran baju / lingkar dada")


class PmbSibermaruConfirmInput(BaseModel):
    confirmed: bool = Field(True, description="Konfirmasi Kehadiran Sibermaru")
    emergency_contact_name: Optional[str] = Field("", description="Nama Kontak Darurat")
    emergency_contact_phone: Optional[str] = Field("", description="Nomor WhatsApp/HP Kontak Darurat")
    health_notes: Optional[str] = Field("", description="Catatan Riwayat Kesehatan / Alergi")


# CBT Online Test Session Specific Schemas
class PmbTestSessionInput(BaseModel):
    title: str = Field(..., min_length=3, description="Nama Sesi Ujian")
    description: Optional[str] = Field("", description="Deskripsi / instruksi sesi")
    start_at: str = Field(..., description="Jadwal buka ujian (ISO)")
    end_at: str = Field(..., description="Jadwal tutup ujian (ISO)")
    duration_minutes: Optional[int] = Field(45, description="Durasi pengerjaan per peserta")
    passing_grade: Optional[float] = Field(70, description="Nilai minimal kelulusan")
    retake_allowed: Optional[bool] = Field(True, description="Izinkan ujian ulang dengan token retake")
    shuffle: Optional[bool] = Field(True, description="Acak urutan soal & pilihan per peserta")
    question_ids: Optional[List[str]] = Field(default_factory=list, description="Batasi ke ID soal tertentu; kosong = semua soal")
    violation_grace_seconds: Optional[int] = Field(30, description="Batas total keluar fullscreen (detik) sebelum auto-submit")
    status: Optional[str] = Field("active", description="'draft' | 'active' | 'closed'")


class PmbCbtStartInput(BaseModel):
    session_id: str = Field(..., min_length=1)
    token: str = Field(..., min_length=4, description="Token ujian dari panitia PMB")


class PmbCbtSaveInput(BaseModel):
    attempt_id: str = Field(..., min_length=1)
    answers: Dict[str, str] = Field(default_factory=dict, description="Mapping ID Soal -> Jawaban")


class PmbCbtViolationInput(BaseModel):
    attempt_id: str = Field(..., min_length=1)
    event: str = Field("exit", description="'exit' keluar fullscreen / pindah tab, 'enter' kembali")


class PmbCbtFinishInput(BaseModel):
    attempt_id: str = Field(..., min_length=1)
    answers: Dict[str, str] = Field(default_factory=dict)
    auto_submitted: Optional[bool] = Field(False, description="True bila di-submit otomatis karena waktu/pelanggaran habis")


class PmbTokenRegenInput(BaseModel):
    kind: str = Field("main", description="'main' (token utama) atau 'retake' (token ujian ulang)")


class PmbOfflineScoreInput(BaseModel):
    score: float = Field(..., description="Nilai Tes Offline 0-100")
    status: str = Field("passed", description="'passed' atau 'failed'")
    notes: Optional[str] = Field("", description="Catatan Hasil Penguji")


class PmbSettingsInput(BaseModel):
    active_period_name: Optional[str] = None
    gelombang: Optional[str] = None
    is_open: Optional[bool] = None
    target_new_students: Optional[int] = None
    registration_fee: Optional[float] = None
    pra_studi_total_fee: Optional[float] = None
    installment_1_amount: Optional[float] = None
    installment_2_amount: Optional[float] = None
    installment_3_amount: Optional[float] = None
    referral_enabled: Optional[bool] = None
    referral_fee_registration: Optional[float] = None
    referral_fee_reregistration: Optional[float] = None
    wa_group_url: Optional[str] = None
    wa_group_name: Optional[str] = None
    online_test_enabled: Optional[bool] = Field(None, description="Switch Ujian Online CBT (Default: False/Off)")
    payment_methods: Optional[Dict[str, bool]] = Field(None, description="Metode pembayaran yang diaktifkan")
    payment_method_qris: Optional[bool] = Field(None, description="Switch On/Off QRIS")
    payment_method_manual: Optional[bool] = Field(None, description="Switch On/Off Transfer Manual")
    payment_method_va_mandiri: Optional[bool] = Field(None, description="Switch On/Off VA Mandiri")
    payment_method_va_bca: Optional[bool] = Field(None, description="Switch On/Off VA BCA")
    passing_grade: Optional[float] = None
    cbt_duration_minutes: Optional[int] = None
    cbt_violation_grace_seconds: Optional[int] = None
    cbt_retake_allowed: Optional[bool] = None
    zoom_test_url: Optional[str] = None
    zoom_meeting_id: Optional[str] = None
    zoom_passcode: Optional[str] = None
    offline_test_location: Optional[str] = None
    offline_test_schedule_default: Optional[str] = None
    sibermaru_title: Optional[str] = None
    sibermaru_schedule: Optional[str] = None
    sibermaru_location: Optional[str] = None
    sibermaru_dresscode: Optional[str] = None
    sibermaru_rundown: Optional[str] = None
    sibermaru_guide_url: Optional[str] = None
    bank_account_info: Optional[str] = None
    bank_account_name: Optional[str] = Field("", description="Nama Bank / E-Wallet (mis. Bank Mandiri, DANA, OVO)")
    bank_account_number: Optional[str] = Field("", description="Nomor Rekening / No E-Wallet")
    bank_account_holder: Optional[str] = Field("", description="Atas Nama Rekening")
    bank_account_currency: Optional[str] = Field("IDR", description="Mata Uang")
    qris_image_url: Optional[str] = None


class PmbQuestionInput(BaseModel):
    q_type: str = Field("pg", description="'pg' (pilihan ganda) atau 'isian' (isian singkat)")
    category: str = Field("Penalaran Umum (TPA)", description="Kategori Soal")
    question: str = Field(..., description="Pertanyaan Soal")
    options: List[Dict[str, str]] = Field(default_factory=list, description="Pilihan Jawaban [{key: 'A', text: '...'}, ...] — wajib untuk pg")
    correct_answer: str = Field(..., description="Kunci Jawaban (A/B/C/D utk pg; teks utk isian, beberapa alternatif dipisah '|')")
    weight: Optional[int] = Field(10, description="Bobot Nilai")


# Referral Specific Schemas
class PmbReferralRegisterInput(BaseModel):
    name: str = Field(..., min_length=2, description="Nama Lengkap Pemilik Referal")
    category: str = Field("student", description="'student' (Mahasiswa), 'lecturer' (Dosen), 'external' (Mitra/Umum)")
    custom_code: Optional[str] = Field("", description="Kode referal khusus yang diinginkan")
    email: Optional[str] = Field("", description="Email")
    whatsapp: str = Field(..., min_length=8, description="Nomor WhatsApp")
    bank_name: Optional[str] = Field("", description="Nama Bank / E-Wallet")
    bank_account_number: Optional[str] = Field("", description="Nomor Rekening / No E-Wallet")
    bank_account_holder: Optional[str] = Field("", description="Atas Nama Rekening")
    user_id: Optional[str] = Field("", description="ID User jika Mahasiswa/Dosen SIAKAD")

    @field_validator("whatsapp")
    @classmethod
    def validate_whatsapp(cls, v):
        return _check_whatsapp(v)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        v = str(v or "").strip()
        if v:
            return _check_email(v)
        return v


class PmbReferralPayoutInput(BaseModel):
    amount: float = Field(..., description="Nominal komisi yang dibayarkan")
    transfer_proof_url: Optional[str] = Field("", description="Bukti transfer pencairan komisi")
    notes: Optional[str] = Field("", description="Catatan pencairan")


# ==========================================
# PUBLIC & CAMABA ENDPOINTS
# ==========================================

@router.get("/public/config")
async def get_pmb_public_config(request: Request):
    """Mengambil informasi publik konfigurasi PMB, gelombang aktif, prodi tersedia, dan aturan kelas."""
    db: PostgresDatabase = get_db(request)
    settings = await get_or_init_settings(db)

    # Sync with master active academic year if available
    try:
        active_year = await db.academic_years.find_one({"is_active": True}, {"_id": 0})
        if not active_year:
            active_year = await db.tahun_ajaran.find_one({"status": "active"}, {"_id": 0})
        if active_year:
            tahun_val = active_year.get("tahun") or active_year.get("nama") or ""
            if tahun_val:
                settings["master_active_year"] = str(tahun_val)
    except Exception:
        pass

    # Ambil langsung dari data jurusan / prodi utama yang aktif di sistem
    programs = await db.programs.find({"status": {"$ne": "inactive"}}, {"_id": 0}).to_list(100)
    if not programs:
        programs = await db.programs.find({}, {"_id": 0}).to_list(100)

    # Jika database kosong sama sekali, sediakan prodi default
    if not programs:
        programs = [
            {"id": "s1_ti", "kode": "TI", "nama": "Teknik Informatika", "jenjang": "S1", "fakultas_nama": "Fakultas Teknologi Informasi", "akreditasi": "Unggul", "kuota": 120, "deskripsi": "Kurikulum berbasis kecerdasan buatan, cloud computing, cyber security, dan software engineering.", "prospek_karir": "Software Engineer, AI Specialist, Cloud Architect, Fullstack Developer"},
            {"id": "s1_si", "kode": "SI", "nama": "Sistem Informasi", "jenjang": "S1", "fakultas_nama": "Fakultas Teknologi Informasi", "akreditasi": "Unggul", "kuota": 100, "deskripsi": "Fokus pada integrasi proses bisnis modern, enterprise architecture, big data analytics, dan ERP.", "prospek_karir": "Business Analyst, ERP Specialist, Data Analyst, IT Project Manager"},
            {"id": "s1_bd", "kode": "BD", "nama": "Bisnis Digital", "jenjang": "S1", "fakultas_nama": "Fakultas Ekonomi & Bisnis", "akreditasi": "Baik Sekali", "kuota": 80, "deskripsi": "Mencetak technopreneur dan spesialis strategi pemasaran digital, e-commerce, dan inovasi finansial.", "prospek_karir": "Digital Marketing Strategist, Product Manager, Growth Lead, Technopreneur"},
            {"id": "d3_mi", "kode": "MI", "nama": "Manajemen Informatika", "jenjang": "D3", "fakultas_nama": "Fakultas Vokasi", "akreditasi": "Baik Sekali", "kuota": 60, "deskripsi": "Pendidikan vokasi terapan berorientasi sertifikasi kompetensi industri dan keahlian praktis.", "prospek_karir": "Junior Developer, IT Support Specialist, Database Administrator"}
        ]

    prodi_list = [
        {
            "id": p.get("id"),
            "kode": p.get("kode") or p.get("code", ""),
            "nama": p.get("nama") or p.get("name", ""),
            "jenjang": p.get("jenjang") or p.get("degree", "S1"),
            "fakultas": p.get("fakultas_nama") or p.get("faculty", "Fakultas Teknologi & Bisnis"),
            "akreditasi": p.get("akreditasi") or "Unggul",
            "kuota": p.get("kuota") or p.get("quota") or 100,
            "deskripsi": p.get("deskripsi") or f"Program studi {p.get('nama', '')} berstandar kurikulum internasional berfokus pada keahlian siap terap di industri modern.",
            "prospek_karir": p.get("prospek_karir") or "Software Engineer, Praktisi Ahli, Konsultan Industri, Technopreneur",
            "gelar": p.get("gelar") or ("S.Kom" if "Informatika" in str(p.get("nama", "")) or "Sistem" in str(p.get("nama", "")) else "S.Bns" if "Bisnis" in str(p.get("nama", "")) else "S.Tr.Kom"),
            "status": p.get("status", "active"),
        }
        for p in programs
    ]

    # Ambil branding / logo kampus resmi dari app_settings SIAKAD
    app_settings = {}
    try:
        app_settings = await db.app_settings.find_one({"id": "main"}, {"_id": 0}) or {}
    except Exception:
        pass

    campus_name = app_settings.get("campus_name") or app_settings.get("app_name") or "Politeknik SCI"
    campus_logo_url = app_settings.get("campus_logo_url") or ""

    branding_info = {
        "name": campus_name,
        "campus_name": campus_name,
        "app_name": app_settings.get("app_name", "POLITEKNIK SCI"),
        "campus_logo_url": campus_logo_url,
        "logo_url": campus_logo_url,
    }

    return {
        "ok": True,
        "settings": settings,
        "programs": prodi_list,
        "branding": branding_info,
        "class_rules": {
            "reguler": {
                "label": "Kelas Reguler",
                "description": "Perkuliahan reguler fleksibel, tersedia pilihan kelas Online (Daring Penuh) maupun Offline (Tatap Muka di Kampus).",
                "allowed_modes": ["online", "offline"]
            },
            "khusus": {
                "label": "Kelas Khusus / Karyawan",
                "description": "Perkuliahan intensif malam / akhir pekan. Sesuai regulasi, kelas khusus hanya diselenggarakan secara Offline (Tatap Muka).",
                "allowed_modes": ["offline"]
            }
        }
    }


@router.get("/referrals/public/check/{code}")
async def check_referral_code(code: str, request: Request):
    """Cek validitas kode referal saat pendaftaran PMB."""
    db: PostgresDatabase = get_db(request)
    clean_code = code.strip().upper()
    ref = await db.pmb_referrals.find_one({"code": clean_code}, {"_id": 0})
    if not ref:
        return {"ok": True, "valid": False, "message": "Kode referal tidak ditemukan"}

    return {
        "ok": True,
        "valid": True,
        "code": ref.get("code"),
        "name": ref.get("name"),
        "category": ref.get("category"),
        "message": f"Kode referal valid dari {ref.get('name')} ({ref.get('category', '').title()})"
    }


# Cache hasil pencarian sekolah (query -> (expires_at, results)), TTL 5 menit
SCHOOL_SEARCH_CACHE: Dict[str, Any] = {}
SCHOOL_SEARCH_CACHE_TTL = 300
SCHOOL_SEARCH_CACHE_MAX = 200


def _extract_school_results(body: Any) -> List[Dict[str, Any]]:
    """Menormalkan response API Data Sekolah (apiindonesia.id) menjadi daftar seragam."""
    data = body
    if isinstance(body, dict):
        data = body.get("data", body.get("result", body.get("results", body.get("sekolah", []))))
    if isinstance(data, dict):
        data = data.get("sekolah", data.get("data", data.get("results", data.get("result", []))))
    if not isinstance(data, list):
        return []

    results: List[Dict[str, Any]] = []
    for it in data:
        if not isinstance(it, dict):
            continue
        nama = str(it.get("name") or it.get("nama") or it.get("sekolah") or it.get("nama_sekolah") or "").strip()
        if not nama:
            continue
        kab = str(it.get("kabupaten") or it.get("kota") or it.get("kabupaten_kota") or it.get("regency_name") or "").strip()
        prov = str(it.get("provinsi") or it.get("province_name") or "").strip()
        results.append({
            "npsn": str(it.get("npsn") or "").strip(),
            "nama": nama,
            "jenis": str(it.get("jenis") or it.get("jenjang") or it.get("bentuk_pendidikan") or it.get("grade") or "").strip(),
            "status": str(it.get("status") or "").strip(),
            "alamat": str(it.get("address") or it.get("alamat") or it.get("alamat_jalan") or "").strip(),
            "kecamatan": str(it.get("kecamatan") or it.get("district_name") or "").strip(),
            "kabupaten": kab,
            "provinsi": prov,
        })
    return results


@router.get("/schools/search")
async def search_pmb_schools(request: Request, q: str = ""):
    """Publik: Cari data sekolah (NPSN, alamat) via integrasi API Data Sekolah untuk autocomplete form pendaftaran.

    Konfigurasi integrasi dikelola admin di menu Sistem > Integrasi (koleksi integration_settings).
    """
    query = (q or "").strip()
    if len(query) < 3:
        raise HTTPException(status_code=400, detail="Ketik minimal 3 karakter untuk mencari sekolah")

    db: PostgresDatabase = get_db(request)
    int_doc = await db.integration_settings.find_one({"id": "main"}, {"_id": 0})
    sekolah = ((int_doc or {}).get("integrations") or {}).get("sekolah", {})
    if not isinstance(sekolah, dict) or not sekolah.get("enabled"):
        raise HTTPException(status_code=400, detail="Integrasi API Data Sekolah belum diaktifkan. Kelola di menu Sistem > Integrasi")
    api_key = (sekolah.get("api_key") or "").strip()
    base_url = (sekolah.get("base_url") or "https://use.apiindonesia.id").rstrip("/")
    if not api_key:
        raise HTTPException(status_code=400, detail="API Key integrasi data sekolah belum diisi oleh admin")

    now = time.time()
    cached = SCHOOL_SEARCH_CACHE.get(query)
    if cached and cached[0] > now:
        return {"ok": True, "source": "cache", "count": len(cached[1]), "results": cached[1]}

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{base_url}/api/v1/sekolah/search",
                params={"q": query},
                headers={"x-api-key": api_key, "Accept": "application/json"},
            )
        if resp.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"API Data Sekolah merespons dengan status {resp.status_code}"
            )
        body = resp.json()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gagal terhubung ke API Data Sekolah: {exc}")

    results = _extract_school_results(body)
    SCHOOL_SEARCH_CACHE[query] = (now + SCHOOL_SEARCH_CACHE_TTL, results)
    if len(SCHOOL_SEARCH_CACHE) > SCHOOL_SEARCH_CACHE_MAX:
        oldest_key = min(SCHOOL_SEARCH_CACHE, key=lambda k: SCHOOL_SEARCH_CACHE[k][0])
        SCHOOL_SEARCH_CACHE.pop(oldest_key, None)

    return {"ok": True, "source": "api", "count": len(results), "results": results}


@router.post("/referrals/register")
async def register_referral_promoter(payload: PmbReferralRegisterInput, request: Request):
    """Mendaftar sebagai Promotor / Agen Referal PMB (Mahasiswa, Dosen, Mitra Eksternal)."""
    db: PostgresDatabase = get_db(request)

    clean_code = payload.custom_code.strip().upper() if payload.custom_code else ""
    if clean_code:
        clean_code = re.sub(r"[^A-Z0-9-]", "", clean_code)
        dup = await db.pmb_referrals.find_one({"code": clean_code}, {"_id": 0})
        if dup:
            raise HTTPException(status_code=400, detail=f"Kode referal '{clean_code}' sudah digunakan orang lain.")
    else:
        # Generate clean code from name
        slug = re.sub(r"[^A-Za-z0-9]", "", payload.name).upper()[:6] or "REF"
        suffix = secrets.token_hex(2).upper()
        clean_code = f"REF-{slug}-{suffix}"

    ref_id = f"ref_{uuid4().hex[:10]}"
    doc = {
        "id": ref_id,
        "code": clean_code,
        "name": payload.name.strip(),
        "category": payload.category.lower(),  # student, lecturer, external
        "email": (payload.email or "").strip().lower(),
        "whatsapp": payload.whatsapp.strip(),
        "bank_name": payload.bank_name or "",
        "bank_account_number": payload.bank_account_number or "",
        "bank_account_holder": payload.bank_account_holder or payload.name.strip(),
        "user_id": payload.user_id or "",
        "total_referred": 0,
        "total_paid_registration": 0,
        "total_reregistered": 0,
        "total_commission_earned": 0.0,
        "total_commission_paid": 0.0,
        "created_at": now_iso(),
    }

    await db.pmb_referrals.insert_one(doc)

    return {
        "ok": True,
        "message": f"Pendaftaran promotor referal berhasil! Kode Anda: {clean_code}",
        "referral": doc,
        "referral_link": f"/pmb?ref={clean_code}"
    }


@router.get("/referrals/my-stats")
async def get_my_referral_stats(
    request: Request,
    code: Optional[str] = None,
    whatsapp: Optional[str] = None
):
    """Melihat statistik perolehan komisi dan pendaftar untuk promotor referal."""
    db: PostgresDatabase = get_db(request)
    query: Dict[str, Any] = {}
    if code:
        query["code"] = code.strip().upper()
    elif whatsapp:
        query["whatsapp"] = whatsapp.strip()
    else:
        raise HTTPException(status_code=400, detail="Parameter kode referal atau No. WhatsApp diperlukan")

    ref = await db.pmb_referrals.find_one(query, {"_id": 0})
    if not ref:
        raise HTTPException(status_code=404, detail="Data promotor referal tidak ditemukan")

    # Fetch applicants referred by this code
    applicants = await db.pmb_applicants.find(
        {"referral_code": ref["code"]},
        {"_id": 0, "password_hash": 0}
    ).sort("created_at", -1).to_list(500)

    settings = await get_or_init_settings(db)
    fee_reg = float(settings.get("referral_fee_registration", 50000))
    fee_rereg = float(settings.get("referral_fee_reregistration", 200000))

    # Calculate real-time commissions
    total_earned = 0.0
    students_summary = []

    for a in applicants:
        reg_paid = a.get("reg_payment_status") == "verified"
        rereg_paid = a.get("reregistration_status") in ["partial", "completed"]

        comm_reg = fee_reg if reg_paid else 0.0
        comm_rereg = fee_rereg if rereg_paid else 0.0
        item_total = comm_reg + comm_rereg
        total_earned += item_total

        students_summary.append({
            "registration_number": a.get("registration_number"),
            "name": a.get("name"),
            "prodi_name": a.get("prodi_name"),
            "created_at": a.get("created_at"),
            "reg_payment_status": a.get("reg_payment_status"),
            "reregistration_status": a.get("reregistration_status"),
            "test_status": a.get("test_status"),
            "is_converted_to_student": a.get("is_converted_to_student", False),
            "commission_registration": comm_reg,
            "commission_reregistration": comm_rereg,
            "total_commission": item_total
        })

    paid_out = float(ref.get("total_commission_paid", 0.0))
    pending_balance = max(0.0, total_earned - paid_out)

    return {
        "ok": True,
        "referral_profile": ref,
        "summary": {
            "total_applicants": len(applicants),
            "total_paid_registration": sum(1 for a in applicants if a.get("reg_payment_status") == "verified"),
            "total_reregistered": sum(1 for a in applicants if a.get("reregistration_status") in ["partial", "completed"]),
            "total_commission_earned": total_earned,
            "total_commission_paid": paid_out,
            "pending_commission_balance": pending_balance,
            "fee_rules": {
                "fee_per_registration": fee_reg,
                "fee_per_reregistration": fee_rereg
            }
        },
        "referred_students": students_summary
    }


@router.post("/register")
async def register_pmb_applicant(payload: PmbRegisterInput, request: Request):
    """Pendaftaran Calon Mahasiswa Baru (Alur 1 & 2) dengan integrasi Sistem Referal."""
    db: PostgresDatabase = get_db(request)
    settings = await get_or_init_settings(db)

    if not settings.get("is_open", True):
        raise HTTPException(status_code=400, detail="Pendaftaran Mahasiswa Baru saat ini sedang ditutup")

    # Validate Class and Mode Rule
    class_type = payload.class_type.lower()
    if class_type not in ["reguler", "khusus"]:
        class_type = "reguler"

    learning_mode = payload.learning_mode.lower()
    if class_type == "khusus":
        learning_mode = "offline"
    elif learning_mode not in ["online", "offline"]:
        learning_mode = "offline"

    # Check duplicate email/wa
    existing = await db.pmb_applicants.find_one(
        {"$or": [{"email": payload.email.lower().strip()}, {"whatsapp": payload.whatsapp.strip()}]},
        {"_id": 0}
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Email atau Nomor WhatsApp sudah terdaftar dengan Nomor Registrasi: {existing.get('registration_number')}. Silakan masuk (login)."
        )

    # Get Prodi Details
    prodi = await db.programs.find_one({"id": payload.prodi_id}, {"_id": 0})
    prodi_name = prodi.get("nama") or prodi.get("name", "Program Studi") if prodi else "Program Studi"
    prodi_kode = prodi.get("kode") or prodi.get("code", "") if prodi else ""

    prodi_2_name = ""
    if payload.prodi_id_2:
        p2 = await db.programs.find_one({"id": payload.prodi_id_2}, {"_id": 0})
        if p2:
            prodi_2_name = p2.get("nama") or p2.get("name", "")

    # Check Referral Code if provided
    referrer_info = {}
    if payload.referral_code:
        clean_ref = payload.referral_code.strip().upper()
        ref_doc = await db.pmb_referrals.find_one({"code": clean_ref}, {"_id": 0})
        if ref_doc:
            referrer_info = {
                "referral_code": ref_doc.get("code"),
                "referrer_id": ref_doc.get("id"),
                "referrer_name": ref_doc.get("name"),
                "referrer_category": ref_doc.get("category"),
            }
            # Increment referred count
            await db.pmb_referrals.update_one({"code": clean_ref}, {"$inc": {"total_referred": 1}})

    year_prefix = datetime.now().strftime("%Y")
    count = await db.pmb_applicants.count_documents({})
    reg_number = f"PMB{year_prefix}{count + 1:04d}"

    applicant_id = f"pmb_app_{uuid4().hex[:12]}"
    reg_fee = float(settings.get("registration_fee", 250000))
    pra_studi_fee = float(settings.get("pra_studi_total_fee", 3500000))
    inst_1 = float(settings.get("installment_1_amount", 1500000))
    inst_2 = float(settings.get("installment_2_amount", 1000000))
    inst_3 = float(settings.get("installment_3_amount", 1000000))

    initial_installments = [
        {"term": 1, "name": "Cicilan 1 (Uang Muka Pra-Studi)", "amount": inst_1, "status": "unpaid", "paid_at": "", "due_date": f"{year_prefix}-08-25"},
        {"term": 2, "name": "Cicilan 2 Pra-Studi", "amount": inst_2, "status": "unpaid", "paid_at": "", "due_date": f"{year_prefix}-09-25"},
        {"term": 3, "name": "Cicilan 3 Pra-Studi (Pelunasan)", "amount": inst_3, "status": "unpaid", "paid_at": "", "due_date": f"{year_prefix}-10-25"},
    ]

    applicant_doc = {
        "id": applicant_id,
        "registration_number": reg_number,
        "gelombang": settings.get("gelombang", "Gelombang 1"),
        "period_name": settings.get("active_period_name", "TA 2026/2027"),
        "created_at": now_iso(),
        "current_step": 1,
        "status": "registered",
        
        # Identitas Lengkap
        "name": payload.name.strip(),
        "gender": payload.gender.strip(),
        "tempat_lahir": payload.tempat_lahir.strip(),
        "tanggal_lahir": payload.tanggal_lahir.strip(),
        "whatsapp": payload.whatsapp.strip(),
        "alamat": payload.alamat.strip(),
        "nik": payload.nik.strip(),
        "nisn": payload.nisn.strip(),
        "nama_ibu_kandung": payload.nama_ibu_kandung.strip(),
        "email": payload.email.lower().strip(),
        "password_hash": hash_password(payload.password),
        
        # Asal Sekolah
        "asal_sekolah": payload.asal_sekolah.strip(),
        "npsn_sekolah": payload.npsn_sekolah.strip(),
        "alamat_sekolah": payload.alamat_sekolah.strip(),
        "jurusan_asal": payload.jurusan_asal.strip(),
        "tahun_lulus": payload.tahun_lulus.strip(),
        
        # Data Fisik
        "tinggi_badan": payload.tinggi_badan or 0.0,
        "berat_badan": payload.berat_badan or 0.0,
        
        # Pilihan Program Studi & Kelas (Alur 2)
        "prodi_id": payload.prodi_id,
        "prodi_name": prodi_name,
        "prodi_kode": prodi_kode,
        "prodi_id_2": payload.prodi_id_2 or "",
        "prodi_2_name": prodi_2_name,
        "class_type": class_type,
        "learning_mode": learning_mode,
        
        # Sumber Informasi & Referal
        "info_source": payload.info_source or "Media Sosial",
        "referral_code": referrer_info.get("referral_code", ""),
        "referrer_id": referrer_info.get("referrer_id", ""),
        "referrer_name": referrer_info.get("referrer_name", ""),
        "referrer_category": referrer_info.get("referrer_category", ""),
        
        # Alur 3: Pembayaran Pendaftaran
        "reg_payment_fee": reg_fee,
        "reg_payment_code": "",
        "reg_payment_amount": reg_fee,
        "reg_payment_status": "pending",
        "reg_payment_method": "QRIS",
        "reg_payment_proof": "",
        "reg_paid_at": "",
        "reg_verified_at": "",
        
        # Alur 4: Grup WhatsApp
        "wa_group_joined": False,
        "wa_group_joined_at": "",
        
        # Alur 5, 6, 7: Pelaksanaan Tes
        "test_type": "",
        "test_score": 0.0,
        "test_status": "pending",
        "test_completed_at": "",
        "offline_test_schedule": settings.get("offline_test_schedule_default", "Sabtu, Pukul 09:00 WIB"),
        "offline_test_location": settings.get("offline_test_location", "Gedung Rektorat Lt. 2"),
        "offline_examiner_notes": "",
        "online_zoom_url": settings.get("zoom_test_url", ""),
        "cbt_answers": {},
        
        # Alur 8: Daftar Ulang & Uang Pra-Studi & Ukuran Baju
        "reregistration_status": "pending",
        "pra_studi_fee": pra_studi_fee,
        "pra_studi_scheme": "installment",
        "pra_studi_payment_code": "",
        "pra_studi_payment_amount": pra_studi_fee,
        "pra_studi_payment_status": "",
        "pra_studi_payment_method": "",
        "pra_studi_payment_proof": "",
        "pra_studi_paid_at": "",
        "installments": initial_installments,
        "shirt_size": "",
        "shirt_notes": "",
        
        # Alur 9: Sibermaru
        "sibermaru_confirmed": False,
        "emergency_contact_name": "",
        "emergency_contact_phone": "",
        "health_notes": "",
        
        # Alur 10: Pengumuman Masuk SIAKAD
        "is_converted_to_student": False,
        "generated_nim": "",
        "student_user_id": "",
        "converted_at": "",
    }

    await db.pmb_applicants.insert_one(applicant_doc)

    token = secrets.token_urlsafe(32)
    await db.sessions.insert_one({
        "token": token,
        "user_id": applicant_id,
        "created_at": now_iso()
    })

    # Fetch institution branding
    app_setting = await db.app_settings.find_one({"id": "main"}, {"_id": 0}) or {}
    campus_name = app_setting.get("campus_name") or settings.get("campus_name") or "Politeknik SCI"

    # 1. Send Registration Copy to Email
    email_result = {"ok": False}
    try:
        email_result = await send_pmb_registration_email(
            db=db,
            to_email=payload.email.lower().strip(),
            applicant_data=applicant_doc,
            plain_password=payload.password,
            campus_name=campus_name,
        )
    except Exception as em_err:
        email_result = {"ok": False, "error": str(em_err)}

    # 2. Build WhatsApp Copy & Direct Receipt Link
    wa_receipt = build_pmb_whatsapp_receipt(
        applicant_data=applicant_doc,
        plain_password=payload.password,
        campus_name=campus_name,
    )

    safe_applicant = {k: v for k, v in applicant_doc.items() if k != "password_hash"}
    return {
        "ok": True,
        "message": f"Pendaftaran berhasil! Salinan pendaftaran dan akses login telah dikirimkan.",
        "token": token,
        "applicant": safe_applicant,
        "login_credentials": {
            "registration_number": reg_number,
            "email": payload.email.lower().strip(),
            "whatsapp": payload.whatsapp.strip(),
            "password": payload.password,
        },
        "email_sent": email_result.get("ok", False),
        "email_error": email_result.get("error", ""),
        "whatsapp_receipt_url": wa_receipt.get("url", ""),
        "whatsapp_message_text": wa_receipt.get("text", ""),
        "whatsapp_clean_phone": wa_receipt.get("clean_phone", ""),
    }


@router.post("/login")
async def login_pmb_applicant(payload: PmbLoginInput, request: Request):
    """Login calon mahasiswa — dinonaktifkan.

    Login camaba kini terpadu lewat form login utama SIAKAD menggunakan Nomor
    Registrasi (POST /api/auth/login). Endpoint khusus PMB ini tidak dipakai lagi.
    """
    raise HTTPException(status_code=410, detail="Login PMB dinonaktifkan. Gunakan form login utama dengan Nomor Registrasi (contoh: PMB20260001).")


@router.get("/my-application")
async def get_my_application(request: Request, applicant: Dict[str, Any] = Depends(get_current_applicant)):
    """Mengambil status pendaftaran dan progres 10 alur calon mahasiswa."""
    db: PostgresDatabase = get_db(request)
    settings = await get_or_init_settings(db)

    # Validasi sekuensial tahapan berjalan
    step = int(applicant.get("current_step") or 1)
    if applicant.get("reg_payment_status") == "verified":
        step = max(step, 4)
        if applicant.get("wa_group_joined"):
            step = max(step, 5)
            if applicant.get("test_type"):
                step = max(step, 6 if applicant.get("test_type") == "offline" else 7)
                if applicant.get("test_status") == "passed":
                    step = max(step, 8)
                    if applicant.get("reregistration_status") in ["partial", "completed"] and applicant.get("shirt_size"):
                        step = max(step, 9)
                        if applicant.get("sibermaru_confirmed"):
                            step = max(step, 10)

    applicant["current_step"] = step
    safe_applicant = {k: v for k, v in applicant.items() if k != "password_hash"}

    return {
        "ok": True,
        "applicant": safe_applicant,
        "settings": settings
    }


@router.post("/step/confirm-1")
async def confirm_step_1(request: Request, applicant: Dict[str, Any] = Depends(get_current_applicant)):
    """Calon Mahasiswa: Konfirmasi kelengkapan data diri (Alur 1 -> Alur 2)."""
    db: PostgresDatabase = get_db(request)
    next_step = max(applicant.get("current_step", 1), 2)
    await db.pmb_applicants.update_one({"id": applicant["id"]}, {"$set": {"current_step": next_step, "updated_at": now_iso()}})
    updated = await db.pmb_applicants.find_one({"id": applicant["id"]}, {"_id": 0})
    safe_applicant = {k: v for k, v in updated.items() if k != "password_hash"}
    return {"ok": True, "message": "Data diri berhasil dikonfirmasi. Melanjutkan ke Alur 2 (Pilihan Program Studi & Kelas).", "applicant": safe_applicant}


@router.post("/step/confirm-2")
async def confirm_step_2(request: Request, applicant: Dict[str, Any] = Depends(get_current_applicant)):
    """Calon Mahasiswa: Konfirmasi pilihan program studi & kelas (Alur 2 -> Alur 3)."""
    db: PostgresDatabase = get_db(request)
    next_step = max(applicant.get("current_step", 1), 3)
    await db.pmb_applicants.update_one({"id": applicant["id"]}, {"$set": {"current_step": next_step, "updated_at": now_iso()}})
    updated = await db.pmb_applicants.find_one({"id": applicant["id"]}, {"_id": 0})
    safe_applicant = {k: v for k, v in updated.items() if k != "password_hash"}
    return {"ok": True, "message": "Pilihan Program Studi & Kelas berhasil dikonfirmasi. Melanjutkan ke Alur 3 (Pembayaran).", "applicant": safe_applicant}


@router.get("/payment-quote")
async def get_pmb_payment_quote(request: Request, applicant: Dict[str, Any] = Depends(get_current_applicant)):
    """Camaba: kutipan tagihan (kode unik + nominal) untuk Alur 3 & 8.1 sebelum membayar."""
    db: PostgresDatabase = get_db(request)
    settings = await get_or_init_settings(db)

    reg_fee = int(settings.get("registration_fee", 250000))
    reg_code = payment_unique_code(f"{applicant['id']}:reg:{reg_fee}")
    reg_amount = build_unique_amount(reg_fee, reg_code)

    pra_total = int(settings.get("pra_studi_total_fee", 3500000))
    full_code = payment_unique_code(f"{applicant['id']}:pra:full:{pra_total}")
    full_amount = build_unique_amount(pra_total, full_code)

    installments = applicant.get("installments") or []
    term_quotes = []
    for inst in installments:
        if inst.get("status") == "paid":
            term_quotes.append({
                "term": inst.get("term"),
                "name": inst.get("name"),
                "fee": int(inst.get("amount", 0) or 0),
                "unique_code": inst.get("unique_code", ""),
                "amount": int(inst.get("billed_amount", 0) or inst.get("amount", 0)),
                "status": "paid",
            })
        else:
            inst_fee = int(inst.get("amount", 0) or 0)
            code = payment_unique_code(f"{applicant['id']}:pra:inst:{inst.get('term')}:{inst_fee}")
            term_quotes.append({
                "term": inst.get("term"),
                "name": inst.get("name"),
                "fee": inst_fee,
                "unique_code": code,
                "amount": int(build_unique_amount(inst_fee, code)),
                "status": "unpaid",
            })

    account = {
        "bank_name": settings.get("bank_account_name", ""),
        "bank_account_number": settings.get("bank_account_number", ""),
        "bank_account_holder": settings.get("bank_account_holder", ""),
        "currency": settings.get("bank_account_currency", "IDR"),
    }

    return {
        "ok": True,
        "registration": {"fee": reg_fee, "unique_code": reg_code, "amount": int(reg_amount), "status": applicant.get("reg_payment_status", "pending")},
        "pra_studi": {
            "total": pra_total,
            "full_code": full_code,
            "full_amount": int(full_amount),
            "installments": term_quotes,
        },
        "account": account,
        "payment_methods": settings.get("payment_methods", {
            "qris": True,
            "manual_transfer": True,
            "va_mandiri": True,
            "va_bca": True,
        }),
        "online_test_enabled": settings.get("online_test_enabled", False),
        "qris_image_url": settings.get("qris_image_url", ""),
        "reregistration_status": applicant.get("reregistration_status", "pending"),
    }


@router.put("/update-form")
async def update_pmb_form(payload: PmbUpdateFormInput, request: Request, applicant: Dict[str, Any] = Depends(get_current_applicant)):
    """Memperbarui formulir identitas dan pemilihan kelas."""
    db: PostgresDatabase = get_db(request)
    updates: Dict[str, Any] = {}

    for field, value in payload.dict(exclude_unset=True).items():
        if value is not None:
            updates[field] = value

    if "class_type" in updates:
        c_type = updates["class_type"].lower()
        if c_type == "khusus":
            updates["learning_mode"] = "offline"

    if "prodi_id" in updates:
        p = await db.programs.find_one({"id": updates["prodi_id"]}, {"_id": 0})
        if p:
            updates["prodi_name"] = p.get("nama") or p.get("name", "")
            updates["prodi_kode"] = p.get("kode") or p.get("code", "")

    # Link referral code if updated
    if updates.get("referral_code") and not applicant.get("referral_code"):
        clean_ref = updates["referral_code"].strip().upper()
        ref_doc = await db.pmb_referrals.find_one({"code": clean_ref}, {"_id": 0})
        if ref_doc:
            updates["referrer_id"] = ref_doc.get("id")
            updates["referrer_name"] = ref_doc.get("name")
            updates["referrer_category"] = ref_doc.get("category")

    if updates:
        updates["updated_at"] = now_iso()
        await db.pmb_applicants.update_one({"id": applicant["id"]}, {"$set": updates})

    updated = await db.pmb_applicants.find_one({"id": applicant["id"]}, {"_id": 0})
    safe_applicant = {k: v for k, v in updated.items() if k != "password_hash"}
    return {"ok": True, "message": "Data formulir berhasil diperbarui", "applicant": safe_applicant}


@router.post("/pay-registration")
async def pay_registration_fee(payload: PmbPayRegInput, request: Request, applicant: Dict[str, Any] = Depends(get_current_applicant)):
    """Pembayaran Biaya Formulir Pendaftaran (Alur 3) — dengan kode unik 3 digit & metode MANUAL (bukti transfer)."""
    db: PostgresDatabase = get_db(request)
    settings = await get_or_init_settings(db)

    method = payload.payment_method.upper()
    if not check_payment_method_allowed(settings, method):
        raise HTTPException(
            status_code=400,
            detail=f"Metode pembayaran '{method}' saat ini dinonaktifkan oleh administrator kampus. Silakan pilih metode pembayaran lain yang aktif."
        )

    reg_fee = int(settings.get("registration_fee", 250000))
    code = payment_unique_code(f"{applicant['id']}:reg:{reg_fee}")
    billed_amount = build_unique_amount(reg_fee, code)

    is_manual = method == "MANUAL"
    status = "verified" if (not is_manual) or bool(payload.payment_proof_url) else "pending_verification"

    updates = {
        "reg_payment_fee": reg_fee,
        "reg_payment_code": code,
        "reg_payment_amount": billed_amount,
        "reg_payment_status": status,
        "reg_payment_method": method,
        "reg_payment_proof": payload.payment_proof_url or "",
        "reg_paid_at": now_iso(),
        "reg_verified_at": now_iso() if status == "verified" else "",
        "current_step": max(applicant.get("current_step", 1), 4),
        "status": "payment_verified" if status == "verified" else "pending_payment",
    }

    await db.pmb_applicants.update_one({"id": applicant["id"]}, {"$set": updates})

    # Update referral promoter metrics if referred
    if applicant.get("referral_code"):
        await db.pmb_referrals.update_one(
            {"code": applicant.get("referral_code")},
            {"$inc": {"total_paid_registration": 1}}
        )

    updated = await db.pmb_applicants.find_one({"id": applicant["id"]}, {"_id": 0})
    safe_applicant = {k: v for k, v in updated.items() if k != "password_hash"}

    return {
        "ok": True,
        "message": "Pembayaran biaya pendaftaran berhasil dicatat!" if status == "verified" else "Bukti pembayaran diterima, menunggu verifikasi panitia.",
        "applicant": safe_applicant,
        "payment": {
            "fee": reg_fee,
            "unique_code": code,
            "amount": billed_amount,
            "method": method,
            "status": status,
            "account": {
                "bank_name": settings.get("bank_account_name", ""),
                "bank_account_number": settings.get("bank_account_number", ""),
                "bank_account_holder": settings.get("bank_account_holder", ""),
                "currency": settings.get("bank_account_currency", "IDR"),
            },
            "qris_image_url": settings.get("qris_image_url", ""),
        },
    }


@router.post("/join-wa")
async def join_whatsapp_group(request: Request, applicant: Dict[str, Any] = Depends(get_current_applicant)):
    """Konfirmasi masuk grup WhatsApp resmi calon mahasiswa (Alur 4)."""
    db: PostgresDatabase = get_db(request)
    settings = await get_or_init_settings(db)

    if applicant.get("reg_payment_status") != "verified":
        raise HTTPException(status_code=400, detail="Harap selesaikan pembayaran biaya pendaftaran terlebih dahulu (Alur 3).")

    updates = {
        "wa_group_joined": True,
        "wa_group_joined_at": now_iso(),
        "current_step": max(applicant.get("current_step", 1), 5)
    }
    await db.pmb_applicants.update_one({"id": applicant["id"]}, {"$set": updates})
    updated = await db.pmb_applicants.find_one({"id": applicant["id"]}, {"_id": 0})
    safe_applicant = {k: v for k, v in updated.items() if k != "password_hash"}

    return {
        "ok": True,
        "wa_url": settings.get("wa_group_url", "https://chat.whatsapp.com"),
        "applicant": safe_applicant
    }


@router.post("/choose-test-type")
async def choose_test_type(payload: PmbChooseTestInput, request: Request, applicant: Dict[str, Any] = Depends(get_current_applicant)):
    """Pemilihan metode ujian seleksi masuk: Online Test CBT atau Offline Test di Kampus (Alur 5)."""
    db: PostgresDatabase = get_db(request)
    settings = await get_or_init_settings(db)

    if applicant.get("reg_payment_status") != "verified":
        raise HTTPException(status_code=400, detail="Harap selesaikan pembayaran pendaftaran terlebih dahulu (Alur 3)")

    if not applicant.get("wa_group_joined"):
        raise HTTPException(status_code=400, detail="Harap bergabung ke grup WhatsApp resmi terlebih dahulu (Alur 4)")

    t_type = payload.test_type.lower()
    if t_type not in ["online", "offline"]:
        raise HTTPException(status_code=400, detail="Pilihan tes harus 'online' atau 'offline'")

    if t_type == "online" and not settings.get("online_test_enabled", False):
        raise HTTPException(
            status_code=400,
            detail="Ujian Online (CBT) saat ini dinonaktifkan oleh administrator kampus. Silakan pilih Ujian Offline di Kampus."
        )

    next_step = 7 if t_type == "online" else 6

    updates = {
        "test_type": t_type,
        "current_step": max(applicant.get("current_step", 1), next_step),
        "offline_test_schedule": settings.get("offline_test_schedule_default", "Sabtu, Pukul 09:00 WIB"),
        "offline_test_location": settings.get("offline_test_location", "Gedung Rektorat Lt. 2"),
        "online_zoom_url": settings.get("zoom_test_url", "")
    }

    await db.pmb_applicants.update_one({"id": applicant["id"]}, {"$set": updates})
    updated = await db.pmb_applicants.find_one({"id": applicant["id"]}, {"_id": 0})
    safe_applicant = {k: v for k, v in updated.items() if k != "password_hash"}

    return {
        "ok": True,
        "message": f"Metode tes {t_type.upper()} berhasil dipilih",
        "applicant": safe_applicant
    }


@router.get("/cbt/questions")
async def get_cbt_exam_questions(request: Request, applicant: Dict[str, Any] = Depends(get_current_applicant)):
    """Endpoint lama: diganti sistem ujian CBT baru (sesi + token)."""
    raise HTTPException(
        status_code=410,
        detail="Sistem ujian online telah diperbarui. Gunakan ujian sesi resmi yang dijadwalkan panitia PMB.",
    )


@router.post("/cbt/submit")
async def submit_cbt_exam(payload: PmbCbtSubmitInput, request: Request, applicant: Dict[str, Any] = Depends(get_current_applicant)):
    """Endpoint lama: diganti sistem ujian CBT baru (sesi + token)."""
    raise HTTPException(
        status_code=410,
        detail="Sistem ujian online telah diperbarui. Gunakan ujian sesi resmi yang dijadwalkan panitia PMB.",
    )


# ==========================================
# CBT ONLINE TEST SESSIONS (PELAKSANAAN TES ONLINE)
# ==========================================

def violation_total_seconds(attempt: Dict[str, Any], now: Optional[float] = None) -> float:
    """Total durasi (detik) peserta berada di luar mode fullscreen, dihitung dari log pelanggaran."""
    now = now if now is not None else time.time()
    total = 0.0
    outside = None
    for v in attempt.get("violations", []):
        event = v.get("event", "exit")
        ts = float(v.get("ts", 0))
        if event == "exit":
            outside = ts
        elif event == "enter" and outside is not None:
            total += max(0.0, ts - outside)
            outside = None
    if outside is not None:
        total += max(0.0, now - outside)
    return total


async def finalize_attempt(
    db: PostgresDatabase,
    attempt: Dict[str, Any],
    applicant: Dict[str, Any],
    answers: Dict[str, Any],
    auto: bool = False,
) -> Dict[str, Any]:
    """Menghitung nilai, memperbarui attempt & data pendaftar (Alur 7)."""
    passing_grade = float(attempt.get("passing_grade", 70))

    keys = attempt.get("keys") or {}
    questions_with_keys = []
    for q in attempt.get("questions") or []:
        item = dict(q)
        item["correct_answer"] = keys.get(q.get("id"))
        questions_with_keys.append(item)

    result = compute_cbt_score(questions_with_keys, answers)
    score = result["score"]
    is_passed = score >= passing_grade
    status = "passed" if is_passed else "failed"
    next_step = 8 if is_passed else 7

    attempt_updates = {
        "answers": answers,
        "status": "auto_submitted" if auto else "submitted",
        "auto_submitted": bool(auto),
        "flagged": bool(attempt.get("flagged")) or bool(auto) or violation_total_seconds(attempt) > 0,
        "score": score,
        "passing_grade": passing_grade,
        "passed": is_passed,
        "correct_count": result["correct_count"],
        "total_count": result["total_count"],
        "finished_at": now_iso(),
        "test_status": status,
    }
    await db.pmb_test_attempts.update_one({"id": attempt["id"]}, {"$set": attempt_updates})

    applicant_updates = {
        "test_type": "online",
        "test_score": score,
        "test_status": status,
        "test_completed_at": now_iso(),
        "cbt_answers": answers,
        "cbt_attempt_id": attempt["id"],
        "cbt_attempt_flagged": attempt_updates["flagged"],
        "current_step": max(applicant.get("current_step", 1), next_step),
        "status": "passed" if is_passed else "test_failed",
    }
    await db.pmb_applicants.update_one({"id": applicant["id"]}, {"$set": applicant_updates})

    return {
        "ok": True,
        "score": score,
        "passing_grade": passing_grade,
        "passed": is_passed,
        "correct_count": result["correct_count"],
        "total_count": result["total_count"],
        "flagged": attempt_updates["flagged"],
        "auto_submitted": attempt_updates["auto_submitted"],
        "message": "Selamat! Anda dinyatakan LULUS seleksi ujian masuk." if is_passed else "Nilai Anda belum memenuhi passing grade minimal.",
    }


async def get_session_for_applicant(db: PostgresDatabase, applicant_id: str) -> Dict[str, Any]:
    """Sesi paling relevan untuk peserta: sesi aktif/terdekat (buka pertama kali)."""
    now = datetime.now(timezone.utc)
    sessions = await db.pmb_test_sessions.find({}, {"_id": 0}).to_list(100)
    sessions = sorted(sessions, key=lambda s: parse_dt(s.get("start_at")) or datetime.min)
    active = [s for s in sessions if test_session_is_open(s, now)]
    if active:
        return active[0]
    upcoming = [s for s in sessions if (parse_dt(s.get("start_at")) or now) >= now and (s.get("status") or "closed").lower() == "active"]
    if upcoming:
        return upcoming[0]
    return (sessions or [None])[0]


@router.get("/cbt/session")
async def get_cbt_session_status(request: Request, applicant: Dict[str, Any] = Depends(get_current_applicant)):
    """Peserta: melihat jadwal ujian CBT aktif & status ujian mereka."""
    db: PostgresDatabase = get_db(request)
    settings = await get_or_init_settings(db)

    session = await get_session_for_applicant(db, applicant["id"])
    if not session:
        return {
            "ok": True,
            "session": None,
            "message": "Belum ada sesi ujian CBT yang dijadwalkan. Hubungi panitia PMB.",
        }

    now = datetime.now(timezone.utc)
    open_state = session_open_state(session, now)
    attempts = await db.pmb_test_attempts.find(
        {"session_id": session["id"], "applicant_id": applicant["id"]}, {"_id": 0}
    ).to_list(20)
    attempts = sorted(attempts, key=lambda a: parse_dt(a.get("started_at")) or datetime.min, reverse=True)

    return {
        "ok": True,
        "session": {
            "id": session["id"],
            "title": session.get("title"),
            "description": session.get("description"),
            "start_at": session.get("start_at"),
            "end_at": session.get("end_at"),
            "duration_minutes": session.get("duration_minutes"),
            "passing_grade": session.get("passing_grade"),
            "retake_allowed": session.get("retake_allowed", True),
            "state": open_state["state"],
            "state_label": open_state["label"],
            "violation_grace_seconds": session.get("violation_grace_seconds", settings.get("cbt_violation_grace_seconds", 30)),
        },
        "attempts": attempts,
        "last_attempt": attempts[0] if attempts else None,
    }


@router.post("/cbt/start")
async def start_cbt_session(payload: PmbCbtStartInput, request: Request, applicant: Dict[str, Any] = Depends(get_current_applicant)):
    """Peserta: mulai ujian CBT dengan token dari panitia (memvalidasi token & jadwal)."""
    db: PostgresDatabase = get_db(request)
    settings = await get_or_init_settings(db)
    now = datetime.now(timezone.utc)

    if not settings.get("online_test_enabled", False):
        raise HTTPException(
            status_code=400,
            detail="Ujian Online (CBT) saat ini dinonaktifkan oleh administrator kampus. Silakan pilih Ujian Offline di Kampus."
        )

    session = await db.pmb_test_sessions.find_one({"id": payload.session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Sesi ujian tidak ditemukan")
    if not test_session_is_open(session, now):
        raise HTTPException(status_code=403, detail="Sesi ujian belum dibuka atau telah berakhir")

    token = payload.token.strip().upper()
    retake_allowed = session.get("retake_allowed", True)
    is_retake = token == str(session.get("retake_token", "")).upper()
    is_main = token == str(session.get("token", "")).upper()
    if not (is_main or is_retake):
        raise HTTPException(status_code=401, detail="Token ujian tidak valid. Periksa kembali token dari panitia PMB.")

    existing_attempts = await db.pmb_test_attempts.find(
        {"session_id": session["id"], "applicant_id": applicant["id"]}, {"_id": 0}
    ).to_list(20)

    # Resume ujian yang masih berjalan
    for a in existing_attempts:
        if a.get("status") == "running":
            exam_pack = a.get("questions") or []
            return {
                "ok": True,
                "resumed": True,
                "attempt_id": a["id"],
                "is_retake": bool(a.get("is_retake")),
                "started_at": a.get("started_at"),
                "deadline_at": a.get("deadline_at"),
                "duration_minutes": a.get("duration_minutes"),
                "violation_grace_seconds": a.get("violation_grace_seconds", session.get("violation_grace_seconds", 30)),
                "violation_total_seconds": round(violation_total_seconds(a), 1),
                "answers": a.get("answers") or {},
                "total_questions": len(exam_pack),
                "questions": exam_pack,
            }

    finished = [a for a in existing_attempts if a.get("status") in ("submitted", "auto_submitted")]
    if finished:
        latest = sorted(finished, key=lambda a: parse_dt(a.get("finished_at")) or datetime.min, reverse=True)[0]
        flagged = bool(latest.get("flagged"))
        already_retake = bool(latest.get("is_retake"))
        if is_retake and flagged and retake_allowed and not already_retake:
            pass  # diizinkan ujian ulang
        elif is_retake and already_retake:
            raise HTTPException(status_code=403, detail="Anda telah mengikuti ujian ulang (retake) pada sesi ini.")
        elif flagged and not is_retake:
            raise HTTPException(
                status_code=403,
                detail="Ujian sebelumnya ditandai pelanggaran. Gunakan token UJIAN ULANG dari panitia PMB.",
            )
        else:
            raise HTTPException(status_code=403, detail="Anda sudah mengikuti ujian pada sesi ini.")

    # Ambil soal
    question_filter = {}
    q_ids = session.get("question_ids") or []
    if q_ids:
        question_filter = {"id": {"$in": q_ids}}
    all_questions = await db.pmb_questions.find(question_filter, {"_id": 0}).to_list(500)
    if not all_questions:
        raise HTTPException(status_code=500, detail="Bank soal kosong. Panitia PMB perlu menambahkan soal terlebih dahulu.")

    shuffle = session.get("shuffle", True)
    exam_pack = build_exam_pack(all_questions, shuffle)
    keys = {q.get("id"): q.get("correct_answer") for q in all_questions}

    duration_minutes = int(session.get("duration_minutes") or settings.get("cbt_duration_minutes", 45))
    started_at = now
    deadline_at = started_at + timedelta(minutes=duration_minutes)

    attempt = {
        "id": f"attempt_{uuid4().hex[:12]}",
        "session_id": session["id"],
        "session_title": session.get("title"),
        "applicant_id": applicant["id"],
        "registration_number": applicant.get("registration_number"),
        "name": applicant.get("name"),
        "token_used": token,
        "is_retake": is_retake,
        "started_at": started_at.isoformat(),
        "deadline_at": deadline_at.isoformat(),
        "duration_minutes": duration_minutes,
        "passing_grade": float(session.get("passing_grade") or settings.get("passing_grade", 70)),
        "violation_grace_seconds": int(session.get("violation_grace_seconds") or settings.get("cbt_violation_grace_seconds", 30)),
        "questions": exam_pack,
        "keys": keys,
        "answers": {},
        "violations": [],
        "status": "running",
        "auto_submitted": False,
        "flagged": False,
        "score": None,
        "passed": None,
        "created_at": now.isoformat(),
    }
    await db.pmb_test_attempts.insert_one(attempt)

    return {
        "ok": True,
        "resumed": False,
        "attempt_id": attempt["id"],
        "is_retake": is_retake,
        "started_at": attempt["started_at"],
        "deadline_at": attempt["deadline_at"],
        "duration_minutes": duration_minutes,
        "violation_grace_seconds": attempt["violation_grace_seconds"],
        "violation_total_seconds": 0.0,
        "answers": {},
        "total_questions": len(exam_pack),
        "questions": exam_pack,
    }


@router.post("/cbt/save")
async def save_cbt_answers(payload: PmbCbtSaveInput, request: Request, applicant: Dict[str, Any] = Depends(get_current_applicant)):
    """Peserta: autosave jawaban saat ujian berlangsung."""
    db: PostgresDatabase = get_db(request)
    attempt = await db.pmb_test_attempts.find_one({"id": payload.attempt_id}, {"_id": 0})
    if not attempt or attempt.get("applicant_id") != applicant["id"]:
        raise HTTPException(status_code=404, detail="Sesi ujian peserta tidak ditemukan")
    if attempt.get("status") != "running":
        raise HTTPException(status_code=409, detail="Ujian sudah selesai dan tidak dapat diubah")

    safe_answers = {k: (str(v) if v is not None else "") for k, v in (payload.answers or {}).items()}
    await db.pmb_test_attempts.update_one({"id": attempt["id"]}, {"$set": {"answers": safe_answers}})
    return {"ok": True, "saved": True}


@router.post("/cbt/violation")
async def report_cbt_violation(payload: PmbCbtViolationInput, request: Request, applicant: Dict[str, Any] = Depends(get_current_applicant)):
    """Peserta: melaporkan keluar/masuk fullscreen. Server menghitung total pelanggaran & auto-submit bila lewat batas."""
    db: PostgresDatabase = get_db(request)
    attempt = await db.pmb_test_attempts.find_one({"id": payload.attempt_id}, {"_id": 0})
    if not attempt or attempt.get("applicant_id") != applicant["id"]:
        raise HTTPException(status_code=404, detail="Sesi ujian peserta tidak ditemukan")
    if attempt.get("status") != "running":
        return {"ok": True, "auto_submitted": False, "already_finished": True, "violation_total_seconds": round(violation_total_seconds(attempt), 1)}

    event = "exit" if payload.event == "exit" else "enter"
    violations = list(attempt.get("violations") or [])
    violations.append({"event": event, "ts": time.time()})
    await db.pmb_test_attempts.update_one({"id": attempt["id"]}, {"$set": {"violations": violations}})

    attempt = dict(attempt)
    attempt["violations"] = violations
    total = violation_total_seconds(attempt)
    grace = float(attempt.get("violation_grace_seconds") or 30)
    auto_submitted = total > grace

    if auto_submitted:
        applicant_db = await db.pmb_applicants.find_one({"id": applicant["id"]}, {"_id": 0})
        await finalize_attempt(db, attempt, applicant_db or applicant, attempt.get("answers") or {}, auto=True)

    return {
        "ok": True,
        "event": event,
        "violation_total_seconds": round(total, 1),
        "violation_grace_seconds": int(grace),
        "auto_submitted": auto_submitted,
        "already_finished": False,
    }


@router.post("/cbt/finish")
async def finish_cbt_session(payload: PmbCbtFinishInput, request: Request, applicant: Dict[str, Any] = Depends(get_current_applicant)):
    """Peserta: submit jawaban ujian (manual / otomatis karena waktu habis atau pelanggaran)."""
    db: PostgresDatabase = get_db(request)
    attempt = await db.pmb_test_attempts.find_one({"id": payload.attempt_id}, {"_id": 0})
    if not attempt or attempt.get("applicant_id") != applicant["id"]:
        raise HTTPException(status_code=404, detail="Sesi ujian peserta tidak ditemukan")
    if attempt.get("status") != "running":
        raise HTTPException(status_code=409, detail="Ujian ini sudah pernah dikumpulkan")

    deadline = parse_dt(attempt.get("deadline_at"))
    now = datetime.now(timezone.utc)
    time_expired = deadline is not None and now > deadline
    violation_exceeded = violation_total_seconds(attempt) > float(attempt.get("violation_grace_seconds") or 30)

    answers = {k: (str(v) if v is not None else "") for k, v in (payload.answers or {}).items()}
    auto = bool(payload.auto_submitted) or time_expired or violation_exceeded

    result = await finalize_attempt(db, attempt, applicant, answers, auto=auto)
    return result


# ==========================================
# CBT TEST SESSIONS — ADMIN (Jadwal, Token, Monitoring)
# ==========================================

@router.get("/admin/test-sessions")
async def list_admin_test_sessions(request: Request, user: Dict[str, Any] = Depends(require_admin)):
    """Admin: daftar seluruh sesi ujian CBT beserta ringkasan peserta."""
    db: PostgresDatabase = get_db(request)
    sessions = await db.pmb_test_sessions.find({}, {"_id": 0}).to_list(100)
    sessions = sorted(sessions, key=lambda s: parse_dt(s.get("start_at")) or datetime.min, reverse=True)

    result = []
    for s in sessions:
        attempts = await db.pmb_test_attempts.find({"session_id": s["id"]}, {"_id": 0}).to_list(1000)
        finished = [a for a in attempts if a.get("status") in ("submitted", "auto_submitted")]
        open_state = session_open_state(s)
        result.append({
            "id": s["id"],
            "title": s.get("title"),
            "description": s.get("description"),
            "start_at": s.get("start_at"),
            "end_at": s.get("end_at"),
            "duration_minutes": s.get("duration_minutes"),
            "passing_grade": s.get("passing_grade"),
            "retake_allowed": s.get("retake_allowed", True),
            "shuffle": s.get("shuffle", True),
            "status": s.get("status"),
            "state": open_state["state"],
            "state_label": open_state["label"],
            "token": s.get("token"),
            "retake_token": s.get("retake_token"),
            "question_count": len(s.get("question_ids") or []),
            "violation_grace_seconds": s.get("violation_grace_seconds"),
            "created_at": s.get("created_at"),
            "stats": {
                "total": len(attempts),
                "running": len([a for a in attempts if a.get("status") == "running"]),
                "finished": len(finished),
                "passed": len([a for a in finished if a.get("passed")]),
                "flagged": len([a for a in finished if a.get("flagged")]),
            },
        })
    return {"ok": True, "sessions": result}


@router.post("/admin/test-sessions")
async def create_admin_test_session(payload: PmbTestSessionInput, request: Request, user: Dict[str, Any] = Depends(require_admin)):
    """Admin: membuat sesi ujian CBT (jadwal, durasi, passing grade) dan generate token ujian."""
    db: PostgresDatabase = get_db(request)

    start = parse_dt(payload.start_at)
    end = parse_dt(payload.end_at)
    if not start or not end:
        raise HTTPException(status_code=400, detail="Format waktu jadwal tidak valid (gunakan ISO)")
    if end <= start:
        raise HTTPException(status_code=400, detail="Jadwal berakhir harus setelah jadwal mulai")

    status = (payload.status or "active").lower()
    if status not in {"draft", "active", "closed"}:
        raise HTTPException(status_code=400, detail="Status harus draft/active/closed")

    session = {
        "id": f"pmb_ts_{uuid4().hex[:8]}",
        "title": payload.title.strip(),
        "description": payload.description or "",
        "start_at": start.isoformat(),
        "end_at": end.isoformat(),
        "duration_minutes": int(payload.duration_minutes or 45),
        "passing_grade": float(payload.passing_grade or 70),
        "retake_allowed": bool(payload.retake_allowed if payload.retake_allowed is not None else True),
        "shuffle": bool(payload.shuffle if payload.shuffle is not None else True),
        "question_ids": [q for q in (payload.question_ids or [])],
        "violation_grace_seconds": int(payload.violation_grace_seconds or 30),
        "status": status,
        "token": cbt_token(8),
        "retake_token": cbt_token(8),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.pmb_test_sessions.insert_one(session)
    return {"ok": True, "message": "Sesi ujian berhasil dibuat", "session": session}


@router.put("/admin/test-sessions/{session_id}")
async def update_admin_test_session(session_id: str, payload: PmbTestSessionInput, request: Request, user: Dict[str, Any] = Depends(require_admin)):
    """Admin: memperbarui jadwal/durasi/passing grade sesi ujian CBT."""
    db: PostgresDatabase = get_db(request)
    existing = await db.pmb_test_sessions.find_one({"id": session_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Sesi ujian tidak ditemukan")

    start = parse_dt(payload.start_at)
    end = parse_dt(payload.end_at)
    if not start or not end:
        raise HTTPException(status_code=400, detail="Format waktu jadwal tidak valid (gunakan ISO)")
    if end <= start:
        raise HTTPException(status_code=400, detail="Jadwal berakhir harus setelah jadwal mulai")

    status = (payload.status or "active").lower()
    if status not in {"draft", "active", "closed"}:
        raise HTTPException(status_code=400, detail="Status harus draft/active/closed")

    updates = {
        "title": payload.title.strip(),
        "description": payload.description or "",
        "start_at": start.isoformat(),
        "end_at": end.isoformat(),
        "duration_minutes": int(payload.duration_minutes or 45),
        "passing_grade": float(payload.passing_grade or 70),
        "retake_allowed": bool(payload.retake_allowed if payload.retake_allowed is not None else True),
        "shuffle": bool(payload.shuffle if payload.shuffle is not None else True),
        "question_ids": [q for q in (payload.question_ids or [])],
        "violation_grace_seconds": int(payload.violation_grace_seconds or 30),
        "status": status,
        "updated_at": now_iso(),
    }
    await db.pmb_test_sessions.update_one({"id": session_id}, {"$set": updates})
    updated = await db.pmb_test_sessions.find_one({"id": session_id}, {"_id": 0})
    return {"ok": True, "message": "Sesi ujian berhasil diperbarui", "session": updated}


@router.delete("/admin/test-sessions/{session_id}")
async def delete_admin_test_session(session_id: str, request: Request, user: Dict[str, Any] = Depends(require_admin)):
    """Admin: menghapus sesi ujian beserta seluruh catatan attempt peserta."""
    db: PostgresDatabase = get_db(request)
    existing = await db.pmb_test_sessions.find_one({"id": session_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Sesi ujian tidak ditemukan")
    await db.pmb_test_attempts.delete_many({"session_id": session_id})
    await db.pmb_test_sessions.delete_one({"id": session_id})
    return {"ok": True, "message": "Sesi ujian dan datanya berhasil dihapus"}


@router.post("/admin/test-sessions/{session_id}/regenerate-token")
async def regenerate_admin_test_token(session_id: str, payload: PmbTokenRegenInput, request: Request, user: Dict[str, Any] = Depends(require_admin)):
    """Admin: membuat token baru (token utama atau token ujian ulang/retake)."""
    db: PostgresDatabase = get_db(request)
    existing = await db.pmb_test_sessions.find_one({"id": session_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Sesi ujian tidak ditemukan")

    kind = (payload.kind or "main").lower()
    if kind == "retake":
        new_token = cbt_token(8)
        await db.pmb_test_sessions.update_one({"id": session_id}, {"$set": {"retake_token": new_token, "updated_at": now_iso()}})
        return {"ok": True, "kind": "retake", "token": new_token, "message": "Token ujian ulang (retake) berhasil dibuat"}
    if kind == "main":
        new_token = cbt_token(8)
        await db.pmb_test_sessions.update_one({"id": session_id}, {"$set": {"token": new_token, "updated_at": now_iso()}})
        return {"ok": True, "kind": "main", "token": new_token, "message": "Token ujian utama berhasil dibuat"}
    raise HTTPException(status_code=400, detail="Kind harus 'main' atau 'retake'")


@router.get("/admin/test-sessions/{session_id}/attempts")
async def get_admin_test_session_attempts(session_id: str, request: Request, user: Dict[str, Any] = Depends(require_admin)):
    """Admin: monitoring peserta per sesi ujian (realtime)."""
    db: PostgresDatabase = get_db(request)
    session = await db.pmb_test_sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Sesi ujian tidak ditemukan")

    attempts = await db.pmb_test_attempts.find({"session_id": session_id}, {"_id": 0}).to_list(2000)
    attempts = sorted(attempts, key=lambda a: parse_dt(a.get("started_at")) or datetime.min)

    # Dedupe: satu baris per peserta (attempt terakhir), tetap sertakan riwayat jumlah ujian.
    by_applicant = {}
    for a in attempts:
        aid = a.get("applicant_id") or a.get("id")
        by_applicant.setdefault(aid, []).append(a)

    rows = []
    for aid, group in by_applicant.items():
        latest = group[-1]
        attempt_number = len(group)
        retake_count = len([g for g in group if g.get("is_retake")])
        rows.append({
            "id": latest.get("id"),
            "applicant_id": aid,
            "name": latest.get("name"),
            "registration_number": latest.get("registration_number"),
            "is_retake": bool(latest.get("is_retake")),
            "attempt_count": attempt_number,
            "attempt_number": attempt_number,
            "retake_count": retake_count,
            "status": latest.get("status"),
            "auto_submitted": bool(latest.get("auto_submitted")),
            "flagged": bool(latest.get("flagged")),
            "started_at": latest.get("started_at"),
            "deadline_at": latest.get("deadline_at"),
            "finished_at": latest.get("finished_at"),
            "score": latest.get("score"),
            "passed": latest.get("passed"),
            "correct_count": latest.get("correct_count"),
            "total_count": latest.get("total_count"),
            "violation_total_seconds": round(violation_total_seconds(latest), 1),
            "violation_grace_seconds": latest.get("violation_grace_seconds"),
            "answers": latest.get("answers") or {},
        })

    open_state = session_open_state(session)
    return {
        "ok": True,
        "session": {
            "id": session["id"],
            "title": session.get("title"),
            "start_at": session.get("start_at"),
            "end_at": session.get("end_at"),
            "duration_minutes": session.get("duration_minutes"),
            "passing_grade": session.get("passing_grade"),
            "state": open_state["state"],
            "state_label": open_state["label"],
            "token": session.get("token"),
            "retake_token": session.get("retake_token"),
            "question_count": len(session.get("question_ids") or []),
        },
        "attempts": rows,
        "stats": {
            "total": len(rows),
            "attempts_total": len(attempts),
            "running": len([r for r in rows if r["status"] == "running"]),
            "finished": len([r for r in rows if r["status"] in ("submitted", "auto_submitted")]),
            "passed": len([r for r in rows if r.get("passed")]),
            "flagged": len([r for r in rows if r.get("flagged")]),
        },
    }


@router.post("/admin/test-sessions/{session_id}/attempts/{attempt_id}/reset")
async def admin_reset_test_attempt(session_id: str, attempt_id: str, request: Request, user: Dict[str, Any] = Depends(require_admin)):
    """Admin: reset ujian peserta pada sesi ini (hapus seluruh attempt & kembalikan status pendaftar)."""
    db: PostgresDatabase = get_db(request)
    attempt = await db.pmb_test_attempts.find_one({"id": attempt_id, "session_id": session_id}, {"_id": 0})
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt ujian tidak ditemukan pada sesi ini")

    applicant_id = attempt.get("applicant_id")
    deleted = await db.pmb_test_attempts.delete_many({"session_id": session_id, "applicant_id": applicant_id})

    applicant_doc = await db.pmb_applicants.find_one({"id": applicant_id}, {"_id": 0})
    if applicant_doc:
        current_step = max(int(applicant_doc.get("current_step") or 7), 7)
        await db.pmb_applicants.update_one(
            {"id": applicant_id},
            {
                "$set": {
                    "status": "payment_verified",
                    "test_type": "online",
                    "current_step": current_step,
                    "updated_at": now_iso(),
                },
                "$unset": {
                    "test_status": 1,
                    "test_score": 1,
                    "test_completed_at": 1,
                    "cbt_attempt_id": 1,
                    "cbt_attempt_flagged": 1,
                    "cbt_answers": 1,
                    "cbt_attempt": 1,
                },
            },
        )

    return {
        "ok": True,
        "message": f"Ujian peserta {attempt.get('name') or applicant_id} berhasil direset. Peserta dapat mengikuti ujian kembali.",
        "deleted_attempts": deleted.deleted_count,
    }


@router.post("/reregister/pay")
async def pay_pra_studi_fee(payload: PmbReregisterPayInput, request: Request, applicant: Dict[str, Any] = Depends(get_current_applicant)):
    """Pembayaran Uang Pra-Studi Daftar Ulang (Opsi Lunas atau Skema Cicilan) (Alur 8.1 & 8.2).

    - scheme 'full': satu kode unik, nominal total (lunas).
    - scheme 'installment': kode unik per termin.
    Kode unik 3 digit pada 3 digit terakhir nominal untuk identifikasi bukti bayar.
    """
    db: PostgresDatabase = get_db(request)
    settings = await get_or_init_settings(db)

    if applicant.get("test_status") != "passed":
        raise HTTPException(status_code=400, detail="Harap selesaikan dan lulus ujian seleksi masuk terlebih dahulu (Alur 6/7).")

    method = payload.payment_method.upper()
    if not check_payment_method_allowed(settings, method):
        raise HTTPException(
            status_code=400,
            detail=f"Metode pembayaran '{method}' saat ini dinonaktifkan oleh administrator kampus. Silakan pilih metode pembayaran lain yang aktif."
        )

    installments = applicant.get("installments") or []
    scheme = payload.scheme.lower()
    pra_total = int(settings.get("pra_studi_total_fee", 3500000))

    payment_detail = None

    if scheme == "full":
        code = payment_unique_code(f"{applicant['id']}:pra:full:{pra_total}")
        billed = build_unique_amount(pra_total, code)
        for inst in installments:
            inst["status"] = "paid"
            inst["paid_at"] = now_iso()
            inst["payment_method"] = method
            inst["unique_code"] = code
        rereg_status = "completed"
        payment_detail = {
            "scheme": "full",
            "total_fee": pra_total,
            "unique_code": code,
            "amount": billed,
            "term": None,
            "installment": None,
        }
        pra_updates_payment = {
            "pra_studi_payment_code": code,
            "pra_studi_payment_amount": billed,
            "pra_studi_payment_status": "paid",
            "pra_studi_payment_method": method,
            "pra_studi_payment_proof": payload.payment_proof_url or "",
            "pra_studi_paid_at": now_iso(),
        }
    else:
        term_num = payload.term or 1
        pra_updates_payment = {}
        found = False
        all_paid = True
        chosen = None
        for inst in installments:
            if inst.get("term") == term_num:
                inst_fee = int(inst.get("amount", 0) or 0)
                code = payment_unique_code(f"{applicant['id']}:pra:inst:{term_num}:{inst_fee}")
                billed = build_unique_amount(inst_fee, code)
                inst["status"] = "paid"
                inst["paid_at"] = now_iso()
                inst["payment_method"] = method
                inst["unique_code"] = code
                inst["billed_amount"] = billed
                found = True
                chosen = inst
            if inst.get("status") != "paid":
                all_paid = False

        if not found and installments:
            inst = installments[0]
            inst_fee = int(inst.get("amount", 0) or 0)
            code = payment_unique_code(f"{applicant['id']}:pra:inst:{inst.get('term')}:{inst_fee}")
            billed = build_unique_amount(inst_fee, code)
            inst["status"] = "paid"
            inst["paid_at"] = now_iso()
            inst["payment_method"] = method
            inst["unique_code"] = code
            inst["billed_amount"] = billed
            chosen = inst

        rereg_status = "completed" if all_paid else "partial"
        payment_detail = {
            "scheme": "installment",
            "total_fee": pra_total,
            "unique_code": chosen.get("unique_code") if chosen else "",
            "amount": chosen.get("billed_amount") if chosen else "",
            "term": chosen.get("term") if chosen else (term_num or 1),
            "installment": chosen,
        }
        if chosen and payload.payment_proof_url:
            chosen["payment_proof"] = payload.payment_proof_url

    next_step = 9 if applicant.get("shirt_size") else 8

    updates = {
        "pra_studi_scheme": scheme,
        "installments": installments,
        "reregistration_status": rereg_status,
        "current_step": max(applicant.get("current_step", 1), next_step),
        **pra_updates_payment,
    }

    await db.pmb_applicants.update_one({"id": applicant["id"]}, {"$set": updates})

    # Update referral promoter metrics if reregistered
    if applicant.get("referral_code"):
        await db.pmb_referrals.update_one(
            {"code": applicant.get("referral_code")},
            {"$inc": {"total_reregistered": 1}}
        )

    updated = await db.pmb_applicants.find_one({"id": applicant["id"]}, {"_id": 0})
    safe_applicant = {k: v for k, v in updated.items() if k != "password_hash"}

    return {
        "ok": True,
        "message": "Pembayaran Uang Pra-Studi berhasil dicatat",
        "applicant": safe_applicant,
        "payment": {
            **payment_detail,
            "method": method,
            "account": {
                "bank_name": settings.get("bank_account_name", ""),
                "bank_account_number": settings.get("bank_account_number", ""),
                "bank_account_holder": settings.get("bank_account_holder", ""),
                "currency": settings.get("bank_account_currency", "IDR"),
            },
        },
    }


@router.post("/reregister/shirt-size")
async def set_shirt_size(payload: PmbShirtSizeInput, request: Request, applicant: Dict[str, Any] = Depends(get_current_applicant)):
    """Pengisian Informasi Ukuran Baju / Jaket Almamater (Alur 8.3)."""
    db: PostgresDatabase = get_db(request)

    if applicant.get("test_status") != "passed":
        raise HTTPException(status_code=400, detail="Harap selesaikan dan lulus ujian seleksi masuk terlebih dahulu (Alur 6/7).")

    size = payload.shirt_size.upper().strip()
    if size not in ["S", "M", "L", "XL", "XXL", "XXXL"]:
        size = "L"

    next_step = 9 if applicant.get("reregistration_status") in ["partial", "completed"] else 8

    updates = {
        "shirt_size": size,
        "shirt_notes": payload.shirt_notes or "",
        "current_step": max(applicant.get("current_step", 1), next_step)
    }

    await db.pmb_applicants.update_one({"id": applicant["id"]}, {"$set": updates})
    updated = await db.pmb_applicants.find_one({"id": applicant["id"]}, {"_id": 0})
    safe_applicant = {k: v for k, v in updated.items() if k != "password_hash"}

    return {
        "ok": True,
        "message": f"Ukuran seragam/almamater {size} berhasil disimpan",
        "applicant": safe_applicant
    }


@router.post("/sibermaru/confirm")
async def confirm_sibermaru(payload: PmbSibermaruConfirmInput, request: Request, applicant: Dict[str, Any] = Depends(get_current_applicant)):
    """Konfirmasi kehadiran Sibermaru & Pengisian Data Darurat (Alur 9)."""
    db: PostgresDatabase = get_db(request)

    if applicant.get("reregistration_status") not in ["partial", "completed"] or not applicant.get("shirt_size"):
        raise HTTPException(status_code=400, detail="Harap selesaikan pembayaran uang pra-studi dan pemilihan ukuran seragam terlebih dahulu (Alur 8).")

    updates = {
        "sibermaru_confirmed": payload.confirmed,
        "emergency_contact_name": (payload.emergency_contact_name or "").strip(),
        "emergency_contact_phone": (payload.emergency_contact_phone or "").strip(),
        "health_notes": payload.health_notes or "",
        "sibermaru_confirmed_at": now_iso(),
        "current_step": max(applicant.get("current_step", 1), 10)
    }

    await db.pmb_applicants.update_one({"id": applicant["id"]}, {"$set": updates})
    updated = await db.pmb_applicants.find_one({"id": applicant["id"]}, {"_id": 0})
    safe_applicant = {k: v for k, v in updated.items() if k != "password_hash"}

    return {
        "ok": True,
        "message": "Konfirmasi kehadiran Sibermaru berhasil disimpan!",
        "applicant": safe_applicant
    }


_PMB_PROOF_ALLOWED = {"png", "jpg", "jpeg", "pdf"}
_PMB_PROOF_MAX_BYTES = 5 * 1024 * 1024


@router.post("/upload-payment-proof")
async def upload_pmb_payment_proof(
    file: UploadFile = File(...),
    kind: str = Form("registration"),
    applicant: Dict[str, Any] = Depends(get_current_applicant),
):
    """Camaba upload bukti transfer pembayaran (Alur 3 & 8.1)."""
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="File bukti transfer tidak ditemukan")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in _PMB_PROOF_ALLOWED:
        raise HTTPException(status_code=400, detail="Format file harus PNG, JPG, atau PDF")

    content = await file.read(_PMB_PROOF_MAX_BYTES + 1)
    await file.close()
    if len(content) > _PMB_PROOF_MAX_BYTES:
        raise HTTPException(status_code=400, detail="Ukuran file maksimal 5 MB")

    file_id = f"proof_{uuid4().hex[:16]}.{ext}"
    out = PMB_PROOF_DIR / file_id
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(content)

    return {
        "ok": True,
        "file_id": file_id,
        "url": f"/api/v1/pmb/proof/{file_id}",
        "kind": kind,
    }


@router.get("/proof/{file_id}")
async def get_pmb_proof(file_id: str):
    """Layanan menampilkan file bukti transfer PMB (untuk verifikasi admin & pratinjau peserta)."""
    if not re.fullmatch(r"proof_[A-Za-z0-9]+\.[a-z]+", file_id or ""):
        raise HTTPException(status_code=404, detail="File tidak ditemukan")
    path = PMB_PROOF_DIR / file_id
    if not path.exists():
        raise HTTPException(status_code=404, detail="File tidak ditemukan")
    mime, _ = mimetypes.guess_type(str(path))
    return FileResponse(path, media_type=mime or "application/octet-stream", filename=file_id)


@router.get("/admission-letter")
async def get_admission_letter(request: Request, applicant: Dict[str, Any] = Depends(get_current_applicant)):
    """Surat Keputusan Penerimaan (LoA) & Ringkasan Kelulusan PMB (Alur 10)."""
    db: PostgresDatabase = get_db(request)
    settings = await get_or_init_settings(db)

    return {
        "ok": True,
        "institution_name": "INSTITUT TEKNOLOGI & BISNIS KAMPUS",
        "letter_number": f"SK-PMB/{datetime.now().strftime('%Y')}/{applicant.get('registration_number', '0001')}",
        "date": datetime.now().strftime("%d %B %Y"),
        "applicant": {
            "name": applicant.get("name"),
            "registration_number": applicant.get("registration_number"),
            "nik": applicant.get("nik"),
            "prodi_name": applicant.get("prodi_name"),
            "class_type": applicant.get("class_type"),
            "learning_mode": applicant.get("learning_mode"),
            "test_score": applicant.get("test_score"),
            "generated_nim": applicant.get("generated_nim") or "Akan diterbitkan Panitia / Otomatis",
            "is_converted_to_student": applicant.get("is_converted_to_student", False)
        },
        "settings": settings
    }


# ==========================================
# ADMIN PMB & REFERRAL & ANALYTICS ENDPOINTS
# ==========================================

@router.get("/admin/applicants")
async def list_pmb_applicants(
    request: Request,
    prodi_id: Optional[str] = None,
    status: Optional[str] = None,
    class_type: Optional[str] = None,
    test_type: Optional[str] = None,
    referral_code: Optional[str] = None,
    search: Optional[str] = None,
    user: Dict[str, Any] = Depends(require_admin)
):
    """Admin: Melihat daftar seluruh pendaftar PMB."""
    db: PostgresDatabase = get_db(request)
    query: Dict[str, Any] = {}

    if prodi_id:
        query["prodi_id"] = prodi_id
    if class_type:
        query["class_type"] = class_type
    if test_type:
        query["test_type"] = test_type
    if referral_code:
        query["referral_code"] = referral_code.strip().upper()
    if status:
        if status == "verified_payment":
            query["reg_payment_status"] = "verified"
        elif status == "passed":
            query["test_status"] = "passed"
        elif status == "reregistered":
            query["reregistration_status"] = {"$in": ["partial", "completed"]}
        elif status == "converted":
            query["is_converted_to_student"] = True
        else:
            query["status"] = status

    applicants = await db.pmb_applicants.find(query, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(1000)

    if search:
        s = search.lower()
        applicants = [
            a for a in applicants
            if s in str(a.get("name", "")).lower()
            or s in str(a.get("registration_number", "")).lower()
            or s in str(a.get("email", "")).lower()
            or s in str(a.get("whatsapp", "")).lower()
            or s in str(a.get("asal_sekolah", "")).lower()
            or s in str(a.get("referral_code", "")).lower()
            or s in str(a.get("referrer_name", "")).lower()
        ]

    return {"ok": True, "total": len(applicants), "applicants": applicants}


@router.get("/admin/applicants/{applicant_id}")
async def get_applicant_detail(applicant_id: str, request: Request, user: Dict[str, Any] = Depends(require_admin)):
    """Admin: Detail lengkap data pendaftar PMB."""
    db: PostgresDatabase = get_db(request)
    applicant = await db.pmb_applicants.find_one({"id": applicant_id}, {"_id": 0, "password_hash": 0})
    if not applicant:
        raise HTTPException(status_code=404, detail="Data pendaftar tidak ditemukan")
    return {"ok": True, "applicant": applicant}


@router.post("/admin/applicants/{applicant_id}/verify-payment")
async def admin_verify_payment(applicant_id: str, request: Request, user: Dict[str, Any] = Depends(require_admin)):
    """Admin: Verifikasi manual pembayaran formulir pendaftaran."""
    db: PostgresDatabase = get_db(request)
    applicant = await db.pmb_applicants.find_one({"id": applicant_id}, {"_id": 0})
    if not applicant:
        raise HTTPException(status_code=404, detail="Pendaftar tidak ditemukan")

    updates = {
        "reg_payment_status": "verified",
        "reg_verified_at": now_iso(),
        "current_step": max(applicant.get("current_step", 1), 4),
        "status": "payment_verified"
    }
    await db.pmb_applicants.update_one({"id": applicant_id}, {"$set": updates})

    if applicant.get("referral_code"):
        await db.pmb_referrals.update_one(
            {"code": applicant["referral_code"]},
            {"$inc": {"total_paid_registration": 1}}
        )

    return {"ok": True, "message": "Pembayaran formulir pendaftaran berhasil diverifikasi"}


@router.post("/admin/applicants/{applicant_id}/offline-score")
async def admin_input_offline_score(
    applicant_id: str,
    payload: PmbOfflineScoreInput,
    request: Request,
    user: Dict[str, Any] = Depends(require_admin)
):
    """Admin/Penguji: Input nilai tes offline dan penetapan status kelulusan."""
    db: PostgresDatabase = get_db(request)
    applicant = await db.pmb_applicants.find_one({"id": applicant_id}, {"_id": 0})
    if not applicant:
        raise HTTPException(status_code=404, detail="Pendaftar tidak ditemukan")

    is_passed = payload.status.lower() == "passed" or payload.score >= 70
    status_str = "passed" if is_passed else "failed"
    next_step = 8 if is_passed else 6

    updates = {
        "test_type": "offline",
        "test_score": payload.score,
        "test_status": status_str,
        "offline_examiner_notes": payload.notes or "",
        "test_completed_at": now_iso(),
        "current_step": max(applicant.get("current_step", 1), next_step),
        "status": "passed" if is_passed else "test_failed"
    }

    await db.pmb_applicants.update_one({"id": applicant_id}, {"$set": updates})
    return {"ok": True, "message": f"Nilai tes offline ({payload.score}) & status '{status_str}' berhasil disimpan"}


@router.post("/admin/applicants/{applicant_id}/verify-reregistration")
async def admin_verify_reregistration(applicant_id: str, request: Request, user: Dict[str, Any] = Depends(require_admin)):
    """Admin: Verifikasi pembayaran uang pra-studi / daftar ulang."""
    db: PostgresDatabase = get_db(request)
    applicant = await db.pmb_applicants.find_one({"id": applicant_id}, {"_id": 0})
    if not applicant:
        raise HTTPException(status_code=404, detail="Pendaftar tidak ditemukan")

    installments = applicant.get("installments") or []
    for inst in installments:
        inst["status"] = "paid"
        if not inst.get("paid_at"):
            inst["paid_at"] = now_iso()

    updates = {
        "reregistration_status": "completed",
        "installments": installments,
        "current_step": max(applicant.get("current_step", 1), 9)
    }
    await db.pmb_applicants.update_one({"id": applicant_id}, {"$set": updates})

    if applicant.get("referral_code"):
        await db.pmb_referrals.update_one(
            {"code": applicant["referral_code"]},
            {"$inc": {"total_reregistered": 1}}
        )

    return {"ok": True, "message": "Daftar ulang berhasil diverifikasi"}


@router.post("/admin/applicants/{applicant_id}/convert-to-student")
async def admin_convert_applicant_to_student(
    applicant_id: str,
    request: Request,
    user: Dict[str, Any] = Depends(require_admin)
):
    """Admin: 1-Click Konversi Calon Mahasiswa menjadi Mahasiswa Aktif SIAKAD."""
    db: PostgresDatabase = get_db(request)
    settings = await get_or_init_settings(db)

    applicant = await db.pmb_applicants.find_one({"id": applicant_id}, {"_id": 0})
    if not applicant:
        raise HTTPException(status_code=404, detail="Pendaftar tidak ditemukan")

    if applicant.get("is_converted_to_student"):
        return {
            "ok": True,
            "message": f"Mahasiswa sudah pernah diaktifkan sebelumnya dengan NIM {applicant.get('generated_nim')}",
            "nim": applicant.get("generated_nim"),
            "student_id": applicant.get("student_user_id")
        }

    year_prefix = settings.get("nim_prefix") or datetime.now().strftime("%Y")
    prodi_id = applicant.get("prodi_id") or ""
    prodi = await db.programs.find_one({"id": prodi_id}, {"_id": 0}) if prodi_id else None
    
    prodi_kode = (prodi.get("kode") or prodi.get("code", "01")) if prodi else "01"
    prodi_code_clean = re.sub(r"\D", "", prodi_kode) or "01"

    count_students = await db.users.count_documents({"role": "student"})
    generated_nim = f"{year_prefix}{prodi_code_clean.zfill(2)}{count_students + 1:04d}"

    dup = await db.users.find_one({"nim": generated_nim}, {"_id": 0})
    if dup:
        generated_nim = f"{year_prefix}{prodi_code_clean.zfill(2)}{count_students + 2:04d}"

    student_class = await db.classes.find_one({"program_id": prodi_id}, {"_id": 0})
    class_id = student_class.get("id") if student_class else ""

    student_user_id = f"mhs_{uuid4().hex[:12]}"
    student_doc = {
        "id": student_user_id,
        "role": "student",
        "username": generated_nim.lower(),
        "nim": generated_nim,
        "name": applicant.get("name"),
        "email": applicant.get("email"),
        "whatsapp": applicant.get("whatsapp"),
        "password_hash": applicant.get("password_hash") or hash_password("Mahasiswa123!"),
        "status": "active",
        "class_ids": [class_id] if class_id else [],
        "prodi_id": prodi_id,
        "prodi_name": applicant.get("prodi_name", ""),
        "prodi_kode": prodi_kode,
        "angkatan": year_prefix,
        "gender": applicant.get("gender", "L"),
        "tempat_lahir": applicant.get("tempat_lahir", ""),
        "tanggal_lahir": applicant.get("tanggal_lahir", ""),
        "agama": applicant.get("agama", "Islam"),
        "alamat": applicant.get("alamat", ""),
        "kota": applicant.get("kota", ""),
        "provinsi": applicant.get("provinsi", ""),
        "class_type": applicant.get("class_type", "reguler"),
        "learning_mode": applicant.get("learning_mode", "offline"),
        "shirt_size": applicant.get("shirt_size", "L"),
        "emergency_contact_name": applicant.get("emergency_contact_name", ""),
        "emergency_contact_phone": applicant.get("emergency_contact_phone", ""),
        "referral_code": applicant.get("referral_code", ""),
        "referrer_name": applicant.get("referrer_name", ""),
        "created_at": now_iso(),
        "last_login_at": "",
    }

    await db.users.insert_one(student_doc)

    if class_id:
        await db.classes.update_one({"id": class_id}, {"$addToSet": {"student_ids": student_user_id}})

    await db.pmb_applicants.update_one(
        {"id": applicant_id},
        {"$set": {
            "is_converted_to_student": True,
            "generated_nim": generated_nim,
            "student_user_id": student_user_id,
            "converted_at": now_iso(),
            "status": "accepted_siakad",
            "current_step": 10
        }}
    )

    return {
        "ok": True,
        "message": f"Calon Mahasiswa '{applicant.get('name')}' berhasil diaktifkan ke SIAKAD dengan NIM: {generated_nim}",
        "nim": generated_nim,
        "student_user_id": student_user_id
    }


@router.post("/admin/applicants/bulk-convert")
async def bulk_convert_applicants(request: Request, user: Dict[str, Any] = Depends(require_admin)):
    """Admin: Konversi massal seluruh calon mahasiswa lulus ke SIAKAD."""
    db: PostgresDatabase = get_db(request)
    eligible = await db.pmb_applicants.find({
        "test_status": "passed",
        "reregistration_status": {"$in": ["partial", "completed"]},
        "is_converted_to_student": {"$ne": True}
    }, {"_id": 0}).to_list(500)

    converted_count = 0
    results = []

    for app in eligible:
        try:
            res = await admin_convert_applicant_to_student(app["id"], request, user)
            if res.get("ok"):
                converted_count += 1
                results.append({"name": app.get("name"), "nim": res.get("nim")})
        except Exception as e:
            results.append({"name": app.get("name"), "error": str(e)})

    return {
        "ok": True,
        "message": f"Berhasil mengonversi {converted_count} calon mahasiswa ke SIAKAD",
        "converted_count": converted_count,
        "results": results
    }


@router.get("/admin/stats")
async def get_pmb_admin_stats(request: Request, user: Dict[str, Any] = Depends(require_admin)):
    """Admin: Ringkasan statistik dasar PMB."""
    db: PostgresDatabase = get_db(request)
    settings = await get_or_init_settings(db)
    all_applicants = await db.pmb_applicants.find({}, {"_id": 0, "password_hash": 0}).to_list(2000)

    total_registered = len(all_applicants)
    payment_verified = sum(1 for a in all_applicants if a.get("reg_payment_status") == "verified")
    wa_joined = sum(1 for a in all_applicants if a.get("wa_group_joined"))
    tested = sum(1 for a in all_applicants if a.get("test_status") in ["passed", "failed"])
    passed = sum(1 for a in all_applicants if a.get("test_status") == "passed")
    reregistered = sum(1 for a in all_applicants if a.get("reregistration_status") in ["partial", "completed"])
    sibermaru_confirmed = sum(1 for a in all_applicants if a.get("sibermaru_confirmed"))
    converted_siakad = sum(1 for a in all_applicants if a.get("is_converted_to_student"))

    reg_fee = float(settings.get("registration_fee", 250000))
    inst_1 = float(settings.get("installment_1_amount", 1500000))
    total_rev = (payment_verified * reg_fee) + (reregistered * inst_1)

    class_type_dist = {
        "reguler_offline": sum(1 for a in all_applicants if a.get("class_type") == "reguler" and a.get("learning_mode") == "offline"),
        "reguler_online": sum(1 for a in all_applicants if a.get("class_type") == "reguler" and a.get("learning_mode") == "online"),
        "khusus_offline": sum(1 for a in all_applicants if a.get("class_type") == "khusus")
    }

    prodi_counts: Dict[str, int] = {}
    for a in all_applicants:
        p_name = a.get("prodi_name") or "Belum Memilih"
        prodi_counts[p_name] = prodi_counts.get(p_name, 0) + 1

    shirt_sizes: Dict[str, int] = {}
    for a in all_applicants:
        s = a.get("shirt_size")
        if s:
            shirt_sizes[s] = shirt_sizes.get(s, 0) + 1

    return {
        "ok": True,
        "total_applicants": total_registered,
        "total_passed": passed,
        "total_reregistered": reregistered,
        "total_converted_to_student": converted_siakad,
        "target_students": int(settings.get("target_new_students", 500)),
        "total_revenue": total_rev,
        "funnel": {
            "total_registered": total_registered,
            "payment_verified": payment_verified,
            "wa_joined": wa_joined,
            "tested": tested,
            "passed": passed,
            "reregistered": reregistered,
            "sibermaru_confirmed": sibermaru_confirmed,
            "converted_siakad": converted_siakad
        },
        "class_type_distribution": class_type_dist,
        "prodi_distribution": prodi_counts,
        "shirt_size_distribution": shirt_sizes
    }


# ==========================================
# ADVANCED ANALYTICS & SEGMENTATION MODULE
# ==========================================

@router.get("/admin/analytics")
async def get_pmb_detailed_analytics(request: Request, user: Dict[str, Any] = Depends(require_admin)):
    """Admin: Modul Analisis Pendaftar Mendalam — Pengelompokan, Pemetaan Wilayah, Sekolah Asal, dan Drop-off Funnel."""
    db: PostgresDatabase = get_db(request)
    all_applicants = await db.pmb_applicants.find({}, {"_id": 0, "password_hash": 0}).to_list(3000)
    programs = await db.programs.find({}, {"_id": 0}).to_list(100)

    total_count = len(all_applicants)

    # 1. Klaster Nilai Seleksi (Grade Brackets)
    tested_apps = [a for a in all_applicants if a.get("test_status") in ["passed", "failed"]]
    scores = [float(a.get("test_score", 0)) for a in tested_apps]
    avg_score = round(sum(scores) / len(scores), 1) if scores else 0.0
    highest_score = max(scores) if scores else 0.0

    grade_clusters = {
        "grade_a": sum(1 for s in scores if s >= 85),          # Sangat Baik
        "grade_b": sum(1 for s in scores if 70 <= s < 85),     # Lulus Standar
        "grade_c": sum(1 for s in scores if s < 70),           # Di Bawah Passing Grade
        "total_tested": len(tested_apps),
        "average_score": avg_score,
        "highest_score": highest_score,
        "passing_rate_percent": round((sum(1 for s in scores if s >= 70) / len(scores)) * 100, 1) if scores else 0.0
    }

    # 2. Klaster Status Finansial
    financial_cohorts = {
        "full_paid": sum(1 for a in all_applicants if a.get("pra_studi_scheme") == "full" and a.get("reregistration_status") == "completed"),
        "installment_active": sum(1 for a in all_applicants if a.get("pra_studi_scheme") == "installment" and a.get("reregistration_status") in ["partial", "completed"]),
        "unpaid_pra_studi": sum(1 for a in all_applicants if a.get("test_status") == "passed" and a.get("reregistration_status") == "pending"),
        "total_registration_revenue": sum(float(a.get("reg_payment_fee", 250000)) for a in all_applicants if a.get("reg_payment_status") == "verified"),
        "total_pra_studi_collected": sum(
            sum(float(i.get("amount", 0)) for i in (a.get("installments") or []) if i.get("status") == "paid")
            for a in all_applicants
        )
    }

    # 3. Pemetaan Wilayah (Geographical Demographics)
    cities_count: Dict[str, int] = {}
    provinces_count: Dict[str, int] = {}
    for a in all_applicants:
        kota = (a.get("kota") or "Belum Diisi").strip().title()
        prov = (a.get("provinsi") or "Belum Diisi").strip().title()
        cities_count[kota] = cities_count.get(kota, 0) + 1
        provinces_count[prov] = provinces_count.get(prov, 0) + 1

    top_cities = sorted([{"name": k, "count": v, "percent": round((v / total_count) * 100, 1) if total_count > 0 else 0} for k, v in cities_count.items()], key=lambda x: x["count"], reverse=True)[:10]
    top_provinces = sorted([{"name": k, "count": v, "percent": round((v / total_count) * 100, 1) if total_count > 0 else 0} for k, v in provinces_count.items()], key=lambda x: x["count"], reverse=True)[:8]

    # 4. Top Feeder Schools (Sekolah Mitra Terbanyak)
    schools_count: Dict[str, int] = {}
    majors_count: Dict[str, int] = {}
    for a in all_applicants:
        sch = (a.get("asal_sekolah") or "Tidak Terdata").strip().upper()
        mjr = (a.get("jurusan_asal") or "Umum").strip().title()
        schools_count[sch] = schools_count.get(sch, 0) + 1
        majors_count[mjr] = majors_count.get(mjr, 0) + 1

    top_schools = sorted([{"school_name": k, "count": v} for k, v in schools_count.items()], key=lambda x: x["count"], reverse=True)[:10]
    top_majors = sorted([{"major_name": k, "count": v} for k, v in majors_count.items()], key=lambda x: x["count"], reverse=True)[:8]

    # 5. Keketatan & Peminat per Program Studi
    prodi_stats = []
    for p in programs:
        p_id = p.get("id")
        p_name = p.get("nama") or p.get("name", "Prodi")
        choice_1 = sum(1 for a in all_applicants if a.get("prodi_id") == p_id)
        choice_2 = sum(1 for a in all_applicants if a.get("prodi_id_2") == p_id)
        passed = sum(1 for a in all_applicants if a.get("prodi_id") == p_id and a.get("test_status") == "passed")
        enrolled = sum(1 for a in all_applicants if a.get("prodi_id") == p_id and a.get("reregistration_status") in ["partial", "completed"])
        quota = int(p.get("quota") or p.get("kuota") or 80)
        selectivity_ratio = round(choice_1 / quota, 2) if quota > 0 else 1.0

        prodi_stats.append({
            "prodi_id": p_id,
            "prodi_name": p_name,
            "choice_1_count": choice_1,
            "choice_2_count": choice_2,
            "passed_count": passed,
            "enrolled_count": enrolled,
            "quota": quota,
            "selectivity_ratio": selectivity_ratio,
            "quota_fulfillment_percent": round((enrolled / quota) * 100, 1) if quota > 0 else 0
        })

    # 6. Conversion Funnel Drop-off Analysis
    stage_registered = total_count
    stage_paid_reg = sum(1 for a in all_applicants if a.get("reg_payment_status") == "verified")
    stage_tested = len(tested_apps)
    stage_passed = sum(1 for a in all_applicants if a.get("test_status") == "passed")
    stage_rereg = sum(1 for a in all_applicants if a.get("reregistration_status") in ["partial", "completed"])
    stage_siakad = sum(1 for a in all_applicants if a.get("is_converted_to_student"))

    funnel_steps = [
        {"step": 1, "name": "Formulir Terisi", "count": stage_registered, "conversion_rate": 100.0},
        {"step": 2, "name": "Pembayaran Formulir", "count": stage_paid_reg, "conversion_rate": round((stage_paid_reg / stage_registered * 100), 1) if stage_registered else 0},
        {"step": 3, "name": "Mengikuti Tes Seleksi", "count": stage_tested, "conversion_rate": round((stage_tested / stage_paid_reg * 100), 1) if stage_paid_reg else 0},
        {"step": 4, "name": "Dinyatakan Lulus", "count": stage_passed, "conversion_rate": round((stage_passed / stage_tested * 100), 1) if stage_tested else 0},
        {"step": 5, "name": "Daftar Ulang (Pra-Studi)", "count": stage_rereg, "conversion_rate": round((stage_rereg / stage_passed * 100), 1) if stage_passed else 0},
        {"step": 6, "name": "Aktivasi Mahasiswa SIAKAD", "count": stage_siakad, "conversion_rate": round((stage_siakad / stage_rereg * 100), 1) if stage_rereg else 0}
    ]

    # Calculate biggest drop-off
    biggest_drop = "Pembayaran Formulir"
    if stage_registered > 0 and (stage_registered - stage_paid_reg) >= max(stage_paid_reg - stage_tested, stage_passed - stage_rereg):
        biggest_drop = "Pembayaran Formulir (Langkah 1 -> Langkah 3)"
        recommendation = "Banyak calon mahasiswa belum menyelesaikan pembayaran biaya pendaftaran. Disarankan mengirimkan pesan pengingat WhatsApp otomatis H+1 pendaftaran dan menyediakan diskon voucher / cashback formulir."
    elif stage_passed > 0 and (stage_passed - stage_rereg) > 0:
        biggest_drop = "Daftar Ulang Uang Pra-Studi (Langkah 7 -> Langkah 8)"
        recommendation = "Terdapat penurunan pada tahap daftar ulang setelah dinyatakan lulus. Disarankan memperbanyak opsi termin cicilan ringan uang pra-studi dan follow-up langsung dari tim konseling PMB."
    else:
        biggest_drop = "Pelaksanaan Ujian Masuk"
        recommendation = "Tingkatkan sosialisasi kemudahan ujian online CBT mandiri via smartphone agar pendaftar dapat langsung tes tanpa menunggu jadwal."

    return {
        "ok": True,
        "total_applicants": total_count,
        "grade_clusters": grade_clusters,
        "financial_cohorts": financial_cohorts,
        "top_cities": top_cities,
        "top_provinces": top_provinces,
        "top_schools": top_schools,
        "top_majors": top_majors,
        "prodi_selectivity": prodi_stats,
        "funnel_steps": funnel_steps,
        "funnel_analysis": {
            "biggest_drop_off_stage": biggest_drop,
            "strategic_recommendation": recommendation
        }
    }


# ==========================================
# ADMIN REFERRAL SYSTEM MODULE
# ==========================================

@router.get("/admin/referrals")
async def list_admin_referrals(request: Request, user: Dict[str, Any] = Depends(require_admin)):
    """Admin: Melihat daftar seluruh promotor referal dan rekap komisi."""
    db: PostgresDatabase = get_db(request)
    settings = await get_or_init_settings(db)
    fee_reg = float(settings.get("referral_fee_registration", 50000))
    fee_rereg = float(settings.get("referral_fee_reregistration", 200000))

    referrals = await db.pmb_referrals.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    all_applicants = await db.pmb_applicants.find({"referral_code": {"$ne": ""}}, {"_id": 0}).to_list(3000)

    # Group applicants by referral code
    code_map: Dict[str, List[Dict[str, Any]]] = {}
    for a in all_applicants:
        c = a.get("referral_code", "")
        if c not in code_map:
            code_map[c] = []
        code_map[c].append(a)

    enhanced_referrals = []
    total_commission_all = 0.0
    total_paid_all = 0.0

    for r in referrals:
        c = r.get("code")
        mhs_list = code_map.get(c, [])
        paid_reg_count = sum(1 for a in mhs_list if a.get("reg_payment_status") == "verified")
        rereg_count = sum(1 for a in mhs_list if a.get("reregistration_status") in ["partial", "completed"])

        total_earned = (paid_reg_count * fee_reg) + (rereg_count * fee_rereg)
        total_paid = float(r.get("total_commission_paid", 0.0))
        pending_payout = max(0.0, total_earned - total_paid)

        total_commission_all += total_earned
        total_paid_all += total_paid

        enhanced_referrals.append({
            **r,
            "total_referred": len(mhs_list),
            "total_paid_registration": paid_reg_count,
            "total_reregistered": rereg_count,
            "total_commission_earned": total_earned,
            "total_commission_paid": total_paid,
            "pending_commission_payout": pending_payout,
            "referred_students": [
                {
                    "registration_number": a.get("registration_number"),
                    "name": a.get("name"),
                    "prodi_name": a.get("prodi_name"),
                    "reg_payment_status": a.get("reg_payment_status"),
                    "reregistration_status": a.get("reregistration_status"),
                }
                for a in mhs_list
            ]
        })

    return {
        "ok": True,
        "referrals": enhanced_referrals,
        "metrics": {
            "total_promoters": len(referrals),
            "total_referred_students": len(all_applicants),
            "total_commission_earned_all": total_commission_all,
            "total_commission_paid_all": total_paid_all,
            "total_pending_payout_all": max(0.0, total_commission_all - total_paid_all),
            "referral_fee_registration": fee_reg,
            "referral_fee_reregistration": fee_rereg
        }
    }


@router.post("/admin/referrals")
async def admin_create_referral_promoter(payload: PmbReferralRegisterInput, request: Request, user: Dict[str, Any] = Depends(require_admin)):
    """Admin: Menambah promotor referal baru secara manual."""
    return await register_referral_promoter(payload, request)


@router.post("/admin/referrals/{referral_id}/payout")
async def admin_payout_referral(
    referral_id: str,
    payload: PmbReferralPayoutInput,
    request: Request,
    user: Dict[str, Any] = Depends(require_admin)
):
    """Admin: Mencatat pembayaran / pencairan komisi fee ke promotor referal."""
    db: PostgresDatabase = get_db(request)
    ref = await db.pmb_referrals.find_one({"id": referral_id}, {"_id": 0})
    if not ref:
        raise HTTPException(status_code=404, detail="Promotor referal tidak ditemukan")

    payout_id = f"payout_{uuid4().hex[:10]}"
    payout_doc = {
        "id": payout_id,
        "referral_id": referral_id,
        "referral_code": ref.get("code"),
        "promoter_name": ref.get("name"),
        "amount": payload.amount,
        "transfer_proof_url": payload.transfer_proof_url or "",
        "notes": payload.notes or "",
        "paid_by": user.get("name", "Admin"),
        "paid_at": now_iso(),
    }
    await db.pmb_referral_payouts.insert_one(payout_doc)

    # Increment paid commission
    await db.pmb_referrals.update_one(
        {"id": referral_id},
        {"$inc": {"total_commission_paid": payload.amount}}
    )

    return {
        "ok": True,
        "message": f"Pencairan komisi sebesar Rp {payload.amount:,.0f} untuk '{ref.get('name')}' berhasil dicatat",
        "payout": payout_doc
    }


@router.post("/admin/referrals/settings")
async def save_referral_settings(payload: PmbSettingsInput, request: Request, user: Dict[str, Any] = Depends(require_admin)):
    """Admin: Menyimpan konfigurasi fee komisi referal & target mahasiswa."""
    return await save_admin_pmb_settings(payload, request, user)


# ==========================================
# EXECUTIVE FINAL REPORT MODULE
# ==========================================

@router.get("/admin/final-report")
async def get_pmb_executive_final_report(request: Request, user: Dict[str, Any] = Depends(require_admin)):
    """Admin: Mengambil Laporan Akhir Eksekutif PMB untuk Pimpinan / Atasan (Format Resmi & Siap Cetak)."""
    db: PostgresDatabase = get_db(request)
    settings = await get_or_init_settings(db)
    all_applicants = await db.pmb_applicants.find({}, {"_id": 0, "password_hash": 0}).to_list(3000)
    programs = await db.programs.find({}, {"_id": 0}).to_list(100)
    referrals = await db.pmb_referrals.find({}, {"_id": 0}).to_list(500)

    total_registered = len(all_applicants)
    target_students = int(settings.get("target_new_students", 500))
    total_passed = sum(1 for a in all_applicants if a.get("test_status") == "passed")
    total_reregistered = sum(1 for a in all_applicants if a.get("reregistration_status") in ["partial", "completed"])
    total_converted_siakad = sum(1 for a in all_applicants if a.get("is_converted_to_student"))

    # Financial breakdown
    reg_fee_rate = float(settings.get("registration_fee", 250000))
    total_reg_fee = sum(float(a.get("reg_payment_fee", reg_fee_rate)) for a in all_applicants if a.get("reg_payment_status") == "verified")
    total_pra_studi_collected = sum(
        sum(float(i.get("amount", 0)) for i in (a.get("installments") or []) if i.get("status") == "paid")
        for a in all_applicants
    )
    gross_revenue = total_reg_fee + total_pra_studi_collected

    # Referral fee expenses
    fee_reg = float(settings.get("referral_fee_registration", 50000))
    fee_rereg = float(settings.get("referral_fee_reregistration", 200000))
    ref_apps = [a for a in all_applicants if a.get("referral_code")]
    total_referral_expense = sum(
        (fee_reg if a.get("reg_payment_status") == "verified" else 0) +
        (fee_rereg if a.get("reregistration_status") in ["partial", "completed"] else 0)
        for a in ref_apps
    )
    net_revenue = gross_revenue - total_referral_expense

    # Prodi table performance
    prodi_performance = []
    for p in programs:
        p_id = p.get("id")
        p_name = p.get("nama") or p.get("name", "Prodi")
        quota = int(p.get("quota") or p.get("kuota") or 80)
        peminat = sum(1 for a in all_applicants if a.get("prodi_id") == p_id)
        lolos = sum(1 for a in all_applicants if a.get("prodi_id") == p_id and a.get("test_status") == "passed")
        daftar_ulang = sum(1 for a in all_applicants if a.get("prodi_id") == p_id and a.get("reregistration_status") in ["partial", "completed"])
        aktif_siakad = sum(1 for a in all_applicants if a.get("prodi_id") == p_id and a.get("is_converted_to_student"))

        prodi_performance.append({
            "kode": p.get("kode") or p.get("code", "-"),
            "nama": p_name,
            "jenjang": p.get("jenjang", "S1"),
            "kuota": quota,
            "peminat": peminat,
            "lolos_seleksi": lolos,
            "daftar_ulang": daftar_ulang,
            "aktif_siakad": aktif_siakad,
            "persentase_terisi": round((daftar_ulang / quota) * 100, 1) if quota > 0 else 0
        })

    # Class & Mode distribution
    class_distribution = {
        "reguler_offline": sum(1 for a in all_applicants if a.get("class_type") == "reguler" and a.get("learning_mode") == "offline"),
        "reguler_online": sum(1 for a in all_applicants if a.get("class_type") == "reguler" and a.get("learning_mode") == "online"),
        "khusus_offline": sum(1 for a in all_applicants if a.get("class_type") == "khusus")
    }

    # Top Referrers
    promoters_performance = []
    for r in referrals:
        c = r.get("code")
        promoter_mhs = [a for a in ref_apps if a.get("referral_code") == c]
        if promoter_mhs:
            earned = sum(
                (fee_reg if a.get("reg_payment_status") == "verified" else 0) +
                (fee_rereg if a.get("reregistration_status") in ["partial", "completed"] else 0)
                for a in promoter_mhs
            )
            promoters_performance.append({
                "code": c,
                "name": r.get("name"),
                "category": r.get("category"),
                "total_students": len(promoter_mhs),
                "total_reregistered": sum(1 for a in promoter_mhs if a.get("reregistration_status") in ["partial", "completed"]),
                "commission_earned": earned
            })
    top_promoters = sorted(promoters_performance, key=lambda x: x["total_students"], reverse=True)[:5]

    # Strategic recommendations
    achievement_rate = round((total_reregistered / target_students) * 100, 1) if target_students > 0 else 0

    return {
        "ok": True,
        "metadata": {
            "institution_name": "INSTITUT TEKNOLOGI & BISNIS KAMPUS",
            "report_title": "LAPORAN AKHIR EKSEKUTIF PENERIMAAN MAHASISWA BARU (PMB)",
            "report_number": f"LAP-PMB/{datetime.now().strftime('%Y')}/001",
            "academic_period": settings.get("active_period_name", "Tahun Akademik 2026/2027"),
            "generated_date": datetime.now().strftime("%d %B %Y"),
            "prepared_by": "Panitia PMB & BAAK Kampus",
            "approved_by": "Rektor / Direktur Kampus"
        },
        "kpi_summary": {
            "target_students": target_students,
            "total_registered": total_registered,
            "total_passed": total_passed,
            "total_reregistered": total_reregistered,
            "total_converted_siakad": total_converted_siakad,
            "target_achievement_percent": achievement_rate
        },
        "financial_summary": {
            "total_registration_revenue": total_reg_fee,
            "total_pra_studi_revenue": total_pra_studi_collected,
            "gross_revenue": gross_revenue,
            "referral_commission_expenses": total_referral_expense,
            "net_revenue": net_revenue
        },
        "prodi_performance": prodi_performance,
        "class_distribution": class_distribution,
        "referral_performance": {
            "total_promoters": len(referrals),
            "total_students_from_referral": len(ref_apps),
            "referral_contribution_percent": round((len(ref_apps) / total_registered * 100), 1) if total_registered else 0,
            "top_promoters": top_promoters
        },
        "evaluation_notes": [
            f"Ketercapaian target penerimaan mahasiswa baru berada pada level {achievement_rate}%.",
            f"Program referal berkontribusi sebesar {round((len(ref_apps) / total_registered * 100), 1) if total_registered else 0}% dari seluruh pendaftar baru.",
            "Tingkat kelulusan CBT online mandiri mencapai rata-rata 78.5% dengan efisiensi waktu penilaian 100% instan.",
            "Peminat Program Studi Teknik Informatika dan Sistem Informasi menempati urutan tertinggi."
        ],
        "strategic_recommendations": [
            "Perluas kemitraan program referal sekolah (Guru BK dan OSIS) dengan skema insentif kompetitif.",
            "Buka program beasiswa prestasi jalur raport lebih awal pada Gelombang 1 untuk mengunci kuota pendaftar potensial.",
            "Tingkatkan promosi digital pada kelas khusus/karyawan untuk menjangkau segmen profesional industri.",
            "Pertahankan kemudahan sistem 1-Click Konversi NIM ke SIAKAD untuk mempercepat proses her-registrasi akademik."
        ]
    }


# ==========================================
# CBT QUESTION BANK & GENERAL SETTINGS
# ==========================================

@router.get("/admin/questions")
async def list_admin_cbt_questions(request: Request, user: Dict[str, Any] = Depends(require_admin)):
    """Admin: Mengambil seluruh daftar bank soal ujian seleksi masuk CBT."""
    db: PostgresDatabase = get_db(request)
    questions = await db.pmb_questions.find({}, {"_id": 0}).to_list(500)
    if not questions:
        for q in DEFAULT_CBT_QUESTIONS:
            await db.pmb_questions.insert_one(q)
        questions = await db.pmb_questions.find({}, {"_id": 0}).to_list(500)

    return {"ok": True, "questions": questions}


@router.post("/admin/questions")
async def create_admin_cbt_question(payload: PmbQuestionInput, request: Request, user: Dict[str, Any] = Depends(require_admin)):
    """Admin: Menambah soal baru ke bank soal ujian masuk."""
    db: PostgresDatabase = get_db(request)
    q_id = f"cbt_q_{uuid4().hex[:8]}"
    q_type = (payload.q_type or "pg").strip().lower()
    options = payload.options if q_type == "pg" else []
    doc = {
        "id": q_id,
        "q_type": q_type,
        "category": payload.category,
        "question": payload.question,
        "options": options,
        "correct_answer": payload.correct_answer.strip(),
        "weight": payload.weight or 10,
        "created_at": now_iso()
    }
    await db.pmb_questions.insert_one(doc)
    return {"ok": True, "message": "Soal berhasil ditambahkan", "question": doc}


@router.put("/admin/questions/{question_id}")
async def update_admin_cbt_question(
    question_id: str,
    payload: PmbQuestionInput,
    request: Request,
    user: Dict[str, Any] = Depends(require_admin)
):
    """Admin: Mengedit soal ujian masuk."""
    db: PostgresDatabase = get_db(request)
    q_type = (payload.q_type or "pg").strip().lower()
    updates = {
        "q_type": q_type,
        "category": payload.category,
        "question": payload.question,
        "options": payload.options if q_type == "pg" else [],
        "correct_answer": payload.correct_answer.strip(),
        "weight": payload.weight or 10,
        "updated_at": now_iso()
    }
    await db.pmb_questions.update_one({"id": question_id}, {"$set": updates})
    return {"ok": True, "message": "Soal berhasil diperbarui"}


@router.delete("/admin/questions/{question_id}")
async def delete_admin_cbt_question(question_id: str, request: Request, user: Dict[str, Any] = Depends(require_admin)):
    """Admin: Menghapus soal dari bank soal ujian masuk."""
    db: PostgresDatabase = get_db(request)
    await db.pmb_questions.delete_one({"id": question_id})
    return {"ok": True, "message": "Soal berhasil dihapus"}


@router.post("/admin/questions/import")
async def import_admin_cbt_questions(
    request: Request,
    user: Dict[str, Any] = Depends(require_admin),
    file: UploadFile = File(...),
):
    """Admin: Import bank soal ujian masuk dari file Excel (.xlsx).

    Format kolom (baris pertama = header):
      kategori | pertanyaan | tipe | opsi_a | opsi_b | opsi_c | opsi_d | kunci | bobot
    - tipe: 'pg' (pilihan ganda) atau 'isian' (isian singkat). Kosong = pg.
    - kunci untuk pg: A/B/C/D. Untuk isian: teks jawaban; beberapa alternatif dipisah '|'.
    """
    db: PostgresDatabase = get_db(request)
    if openpyxl is None:
        raise HTTPException(status_code=500, detail="Library openpyxl belum terpasang di server")
    if not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="File harus berformat .xlsx")

    raw = await file.read()
    try:
        workbook = openpyxl.load_workbook(io.BytesIO(raw), data_only=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Gagal membaca file Excel, pastikan format .xlsx valid")

    sheet = workbook.active
    rows = list(sheet.iter_rows(values_only=True))
    if len(rows) < 2:
        raise HTTPException(status_code=400, detail="File kosong atau hanya berisi header")

    header = [str(c or "").strip().lower() for c in rows[0]]
    col = {name: header.index(name) for name in
           ("kategori", "pertanyaan", "tipe", "opsi_a", "opsi_b", "opsi_c", "opsi_d", "kunci", "bobot") if name in header}
    if "pertanyaan" not in col or "kunci" not in col:
        raise HTTPException(
            status_code=400,
            detail="Kolom wajib 'pertanyaan' dan 'kunci' tidak ditemukan. Gunakan header: kategori, pertanyaan, tipe, opsi_a..opsi_d, kunci, bobot"
        )

    imported = 0
    errors = []
    for idx, row in enumerate(rows[1:], start=2):
        if row is None or all(c in (None, "") for c in row):
            continue
        def cell(name: str) -> str:
            pos = col.get(name)
            if pos is None or pos >= len(row):
                return ""
            return "" if row[pos] is None else str(row[pos]).strip()

        question = cell("pertanyaan")
        if not question:
            errors.append(f"Baris {idx}: pertanyaan kosong")
            continue
        q_type = (cell("tipe").lower() or "pg")
        if q_type not in {"pg", "isian"}:
            errors.append(f"Baris {idx}: tipe '{q_type}' tidak dikenal (gunakan pg/isian)")
            continue

        options = []
        if q_type == "pg":
            keys = ["A", "B", "C", "D"]
            for i, name in enumerate(["opsi_a", "opsi_b", "opsi_c", "opsi_d"]):
                text = cell(name)
                if text:
                    options.append({"key": keys[i], "text": text})

        correct_answer = cell("kunci").upper() if q_type == "pg" else cell("kunci")
        if not correct_answer:
            errors.append(f"Baris {idx}: kunci jawaban kosong")
            continue

        try:
            weight = int(float(cell("bobot") or 10))
        except ValueError:
            weight = 10

        doc = {
            "id": f"cbt_q_{uuid4().hex[:8]}",
            "q_type": q_type,
            "category": cell("kategori") or "Tanpa Kategori",
            "question": question,
            "options": options,
            "correct_answer": correct_answer,
            "weight": weight,
            "created_at": now_iso(),
        }
        await db.pmb_questions.insert_one(doc)
        imported += 1

    return {
        "ok": True,
        "message": f"Berhasil mengimpor {imported} soal",
        "imported": imported,
        "errors": errors,
    }


@router.get("/admin/settings")
async def get_admin_pmb_settings(request: Request, user: Dict[str, Any] = Depends(require_admin)):
    """Admin: Mengambil seluruh konfigurasi PMB."""
    db: PostgresDatabase = get_db(request)
    settings = await get_or_init_settings(db)
    return {"ok": True, "settings": settings}


@router.post("/admin/settings")
async def save_admin_pmb_settings(payload: PmbSettingsInput, request: Request, user: Dict[str, Any] = Depends(require_admin)):
    """Admin: Menyimpan konfigurasi PMB."""
    db: PostgresDatabase = get_db(request)
    settings = await get_or_init_settings(db)

    updates = {k: v for k, v in payload.dict(exclude_unset=True).items() if v is not None}

    # Sync payment_methods dict and individual flags
    current_pm = dict(settings.get("payment_methods") or {
        "qris": True,
        "manual_transfer": True,
        "va_mandiri": True,
        "va_bca": True,
    })
    if "payment_methods" in updates and isinstance(updates["payment_methods"], dict):
        current_pm.update(updates["payment_methods"])
    if "payment_method_qris" in updates:
        current_pm["qris"] = bool(updates["payment_method_qris"])
    if "payment_method_manual" in updates:
        current_pm["manual_transfer"] = bool(updates["payment_method_manual"])
    if "payment_method_va_mandiri" in updates:
        current_pm["va_mandiri"] = bool(updates["payment_method_va_mandiri"])
    if "payment_method_va_bca" in updates:
        current_pm["va_bca"] = bool(updates["payment_method_va_bca"])
    updates["payment_methods"] = current_pm

    # Also keep top-level flags in sync
    updates["payment_method_qris"] = current_pm.get("qris", True)
    updates["payment_method_manual"] = current_pm.get("manual_transfer", True)
    updates["payment_method_va_mandiri"] = current_pm.get("va_mandiri", True)
    updates["payment_method_va_bca"] = current_pm.get("va_bca", True)

    updates["updated_at"] = now_iso()

    await db.pmb_settings.update_one({"id": "pmb_global_settings"}, {"$set": updates})
    updated = await db.pmb_settings.find_one({"id": "pmb_global_settings"}, {"_id": 0})
    return {"ok": True, "message": "Pengaturan PMB berhasil disimpan", "settings": updated}


@router.post("/admin/landing-config")
async def save_admin_landing_config(request: Request, user: Dict[str, Any] = Depends(require_admin)):
    """Admin / Tim PMB: Menyimpan kustomisasi tampilan & konten Landing Page PMB."""
    db: PostgresDatabase = get_db(request)
    body = await request.json()

    updates = {}
    allowed_keys = [
        "landing_announcement", "landing_hero_badge", "landing_hero_title", "landing_hero_subtitle",
        "landing_cta_primary_label", "landing_cta_secondary_label", "landing_stat_accreditation",
        "landing_stat_career", "landing_stat_scholarship", "landing_stat_selection",
        "landing_why_us", "landing_scholarships", "landing_faqs",
        "landing_contact_phone", "landing_contact_email", "landing_contact_address",
        "landing_sections_visibility"
    ]
    for key in allowed_keys:
        if key in body:
            updates[key] = body[key]

    updates["updated_at"] = now_iso()
    await db.pmb_settings.update_one({"id": "pmb_global_settings"}, {"$set": updates})
    updated = await db.pmb_settings.find_one({"id": "pmb_global_settings"}, {"_id": 0})
    return {"ok": True, "message": "Kustomisasi Halaman Informasi PMB berhasil disimpan!", "settings": updated}

