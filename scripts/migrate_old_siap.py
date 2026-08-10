#!/usr/bin/env python3
"""
Script Migrasi Data dari OLD-SIAP (siap_siakad.json) ke Sistem Baru (Nugas-lagi PostgreSQL).

Penggunaan:
  python scripts/migrate_old_siap.py --check     # Dry-run (hanya memeriksa dan menghitung data)
  python scripts/migrate_old_siap.py --execute   # Mengeksekusi migrasi ke database PostgreSQL
"""

import sys
import os
import json
import asyncio
from datetime import datetime, timezone
from pathlib import Path
import bcrypt

# Ensure backend directory is in path for imports
ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
load_dotenv(BACKEND_DIR / ".env")

from postgres_database import PostgresDatabase

OLD_SIAP_JSON = Path("/Users/syahrulanwar/Documents/Project Web/OLD-SIAP/siap_siakad.json")

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def parse_siap_json(file_path):
    with open(file_path, "r", encoding="utf-8") as f:
        raw_data = json.load(f)
    
    tables = {}
    if isinstance(raw_data, list):
        for item in raw_data:
            if isinstance(item, dict) and item.get("type") == "table":
                tname = item.get("name")
                tables[tname] = item.get("data", [])
    return tables

def parse_tahun_label(tahun_id, nama=""):
    """Contoh: 20231 -> 2023/2024 Ganjil, 20232 -> 2023/2024 Genap"""
    if nama and " " in nama:
        return nama
    if len(str(tahun_id)) >= 5:
        year = str(tahun_id)[:4]
        term = str(tahun_id)[4]
        next_year = int(year) + 1
        term_str = "Ganjil" if term == "1" else ("Genap" if term == "2" else "Pendek")
        return f"{year}/{next_year} {term_str}"
    return str(tahun_id)

async def run_migration(file_path=None, execute=False):
    target_json = Path(file_path) if file_path else OLD_SIAP_JSON
    if not target_json.exists():
        print(f"ERROR: File {target_json} tidak ditemukan!")
        sys.exit(1)

    print(f"Membaca data dari {target_json}...")
    tables = parse_siap_json(target_json)

    print(f"Ditemukan {len(tables)} tabel di OLD-SIAP.\n")

    # Extract source data
    raw_fakultas = tables.get("fakultas", [])
    raw_prodi = tables.get("prodi", [])
    raw_tahun = tables.get("tahun", [])
    raw_pegawai = tables.get("pegawai", [])
    raw_mhsw = tables.get("mhsw", [])
    raw_mk = tables.get("mk", [])
    raw_jadwal = tables.get("jadwal", [])
    raw_kelas = tables.get("kelas", [])
    raw_krs = tables.get("krs", [])
    raw_khs = tables.get("khs", [])
    raw_ruang = tables.get("ruang", [])

    raw_nilai = tables.get("nilai", [])

    raw_kurikulum = tables.get("kurikulum", [])

    # Periode yang sedang berjalan di sumber (opsional diubah lewat --active-period)
    active_period = None
    if "--active-period" in sys.argv:
        idx = sys.argv.index("--active-period")
        if idx + 1 < len(sys.argv):
            active_period = str(sys.argv[idx + 1]).strip()
    if not active_period:
        active_period = max(
            (str(j.get("TahunID") or "") for j in raw_jadwal if str(j.get("TahunID") or "").strip()),
            default="20252",
        )
    print(f"Periode aktif yang digunakan: {active_period}\n")

    print("=== SUMMARY DATA OLD-SIAP ===")
    print(f"  Fakultas      : {len(raw_fakultas)} record")
    print(f"  Prodi         : {len(raw_prodi)} record")
    print(f"  Rombel (kelas): {len(raw_kelas)} record")
    print(f"  Kurikulum     : {len(raw_kurikulum)} record")
    print(f"  Tahun Ajaran  : {len(raw_tahun)} record")
    print(f"  Pegawai/Dosen : {len(raw_pegawai)} record")
    print(f"  Mahasiswa     : {len(raw_mhsw)} record")
    print(f"  Mata Kuliah   : {len(raw_mk)} record")
    print(f"  Jadwal/Kelas  : {len(raw_jadwal)} record")
    print(f"  KRS           : {len(raw_krs)} record")
    print(f"  KHS           : {len(raw_khs)} record")
    print(f"  Predikat Nilai: {len(raw_nilai)} record")
    print(f"  Ruang         : {len(raw_ruang)} record")
    print("===============================\n")

    if not execute:
        print("Mode --check (Dry-Run). Tidak ada perubahan yang disimpan ke database.")
        print("Gunakan '--execute' untuk menjalankan migrasi sesungguhnya.")
        return

    # Database connection
    db_url = os.environ.get("DATABASE_URL", "postgresql://nugaslagi:nugaslagi@127.0.0.1:5434/elearning_dosen")
    print(f"Menghubungkan ke PostgreSQL: {db_url}")
    db = PostgresDatabase(db_url)
    await db.connect()

    default_password_hash = hash_password("Dosen123!")
    default_mhs_password_hash = hash_password("Mahasiswa123!")

    # 1. MIGRASI FAKULTAS
    print("\n[1/7] Memigrasikan Fakultas...")
    fakultas_count = 0
    for f in raw_fakultas:
        fid = f.get("FakultasID") or "default-fakultas"
        nama = f.get("Nama") or f.get("NamaIns") or "Fakultas Utama"
        kode = f.get("KodePTI") or f.get("KodeID") or "FT"
        
        ex = await db.fakultas.find_one({"id": fid}, {"_id": 0})
        doc = {
            "id": fid,
            "kode": kode,
            "nama": nama,
            "status": "active" if f.get("NA") != "Y" else "inactive",
            "created_at": now_iso(),
        }
        if not ex:
            await db.fakultas.insert_one(doc)
            fakultas_count += 1
        else:
            await db.fakultas.update_one({"id": fid}, {"$set": doc})

    print(f"  -> {fakultas_count} fakultas dimasukkan.")

    # 2. MIGRASI PRODI
    print("\n[2/7] Memigrasikan Program Studi (Prodi)...")
    prodi_map = {}
    prodi_count = 0
    for p in raw_prodi:
        pid = p.get("ProdiID")
        nama = p.get("Nama", "")
        kode = pid
        jenjang = p.get("NamaJenjang") or "S1"
        akreditasi = p.get("Akreditasi") or "B"
        kaprodi = p.get("Pejabat") or ""

        prodi_map[pid] = {"id": pid, "nama": nama, "kode": kode}

        ex = await db.programs.find_one({"id": pid}, {"_id": 0})
        doc = {
            "id": pid,
            "code": kode,
            "kode": kode,
            "name": nama,
            "nama": nama,
            "description": f"Program Studi {nama} ({jenjang})",
            "status": "active" if p.get("NA") != "Y" else "inactive",
            "jenjang": jenjang,
            "akreditasi": akreditasi,
            "kaprodi": kaprodi,
            "created_at": now_iso(),
        }
        if not ex:
            await db.programs.insert_one(doc)
            prodi_count += 1
        else:
            await db.programs.update_one({"id": pid}, {"$set": doc})

    print(f"  -> {prodi_count} prodi dimasukkan.")

    # 2b. MIGRASI ROMBELL (KELAS DALAM OLD-SIAP)
    # Tabel "kelas" memegang rombel per prodi+angkatan, mis. 25BD-A, 25BD-B, 25BD-C.
    # Mahasiswa dihubungkan lewat mhsw.KelasID dan jadwal lewat jadwal.KelasEID.
    print("\n[2b] Memigrasikan Rombel (Kelas per Angkatan)...")
    rombel_map = {}
    rombel_count = 0
    raw_angkatan = {}  # mhsw.KelasID -> rombel id

    mhsw_kelas_map = {}
    for m in raw_mhsw:
        kid = str(m.get("KelasID") or "").strip()
        mhs_id = str(m.get("MhswID") or "").strip().upper()
        if kid and kid != "0" and mhs_id:
            mhsw_kelas_map.setdefault(kid, set()).add(mhs_id)

    for k in raw_kelas:
        kid = str(k.get("KelasID") or "").strip()
        if not kid:
            continue
        nama_full = str(k.get("Nama") or "").strip()
        prodi_id = str(k.get("ProdiID") or "").strip()
        prodi_obj = prodi_map.get(prodi_id, {})
        prodi_nama = prodi_obj.get("nama", "")
        tahun_id = str(k.get("TahunID") or "").strip()
        angkatan = tahun_id[:4] if len(tahun_id) >= 4 else ""

        # Nama rombel: ambil huruf/rombongan terakhir jika ada tanda "-"
        rombel_letter = nama_full
        if "-" in nama_full:
            rombel_letter = nama_full.split("-")[-1].strip() or rombel_letter

        rombel_id = f"RLM-{kid}"
        rombel_map[kid] = {"id": rombel_id, "nama": rombel_letter, "prodi_id": prodi_id}

        student_ids = sorted(mhsw_kelas_map.get(kid, set()))
        doc = {
            "id": rombel_id,
            "kode": nama_full,
            "nama": rombel_letter,
            "prodi_id": prodi_id,
            "prodi_name": prodi_nama,
            "angkatan": angkatan,
            "student_ids": student_ids,
            "status": "active",
            "created_at": now_iso(),
        }
        ex = await db.rombel.find_one({"id": rombel_id}, {"_id": 0})
        if not ex:
            await db.rombel.insert_one(doc)
            rombel_count += 1
        else:
            await db.rombel.update_one({"id": rombel_id}, {"$set": doc})

    print(f"  -> {rombel_count} rombel dimasukkan.")

    # 3. MIGRASI DOSEN & PEGAWAI
    print("\n[3/7] Memigrasikan Dosen & Pegawai...")
    dosen_map = {}
    dosen_count = 0
    used_emails = set()

    # Track existing emails from database
    existing_users = await db.users.find({}, {"_id": 0, "id": 1, "email": 1}).to_list(10000)
    existing_email_to_id = {u.get("email", "").lower(): u.get("id") for u in existing_users if u.get("email")}

    def make_unique_email(raw_email, default_prefix, user_id):
        email = (raw_email or f"{default_prefix}.{user_id.lower()}@demo.id").strip().lower()
        if "@" not in email:
            email = f"{email}@demo.id"
        
        # If email is used by ANOTHER user in DB or in this migration batch
        owner_id = existing_email_to_id.get(email)
        if (owner_id and owner_id != user_id) or (email in used_emails and owner_id != user_id):
            parts = email.split("@", 1)
            email = f"{parts[0]}+{user_id.lower()}@{parts[1]}"
        
        used_emails.add(email)
        existing_email_to_id[email] = user_id
        return email

    for p in raw_pegawai:
        login = str(p.get("Login") or "").strip()
        if not login:
            continue
        
        name = str(p.get("Nama") or login).strip()
        email = make_unique_email(p.get("Email"), "dosen", login)
        wa = str(p.get("WA") or p.get("Handphone") or p.get("Telephone") or "").strip()
        prodi_id = str(p.get("ProdiID") or "").strip()
        nidn = str(p.get("NIDN") or "").strip()

        # Determine role precisely
        level_id = str(p.get("LevelID") or "")
        levels = [x.strip() for x in level_id.split(",") if x.strip()]
        role = "admin" if "1" in levels else "lecturer"

        # Map full profile details for lecturer
        gelar = str(p.get("Gelar") or "").strip()
        nik = str(p.get("KTP") or "").strip()
        gender = str(p.get("KelaminID") or "").strip().upper()
        agama_map = {"I": "Islam", "K": "Kristen", "P": "Katolik", "H": "Hindu", "B": "Buddha", "C": "Konghucu"}
        agama = agama_map.get(str(p.get("AgamaID") or "").strip(), "")
        tempat_lahir = str(p.get("TempatLahir") or "").strip()
        tgl_lahir = str(p.get("TanggalLahir") or "").strip()
        alamat = str(p.get("Alamat") or "").strip()
        kota = str(p.get("Kota") or "").strip()
        provinsi = str(p.get("Propinsi") or "").strip()
        kode_pos = str(p.get("KodePos") or "").strip()
        homebase = str(p.get("Homebase") or prodi_id).strip()
        keilmuan = str(p.get("Keilmuan") or "").strip()
        pendidikan_terakhir = str(p.get("LulusanPT") or "").strip()
        jabatan_akademik = str(p.get("Jabatan") or "").strip()
        status_dosen = str(p.get("StatusDosenID") or "").strip()
        tgl_masuk = str(p.get("TanggalMasuk") or "").strip()
        foto_url = str(p.get("Foto") or "").strip()

        user_id = login
        dosen_map[login] = {"id": user_id, "name": name, "email": email}

        ex = await db.users.find_one({"id": user_id}, {"_id": 0})
        doc = {
            "id": user_id,
            "role": role,
            "username": login,
            "employee_id": nidn or login,
            "nidn": nidn,
            "nik": nik,
            "name": name,
            "gelar": gelar,
            "email": email,
            "whatsapp": wa,
            "password_hash": default_password_hash,
            "status": "active" if p.get("NA") != "Y" else "inactive",
            "prodi_id": prodi_id,
            "homebase": homebase,
            "gender": gender,
            "agama": agama,
            "tempat_lahir": tempat_lahir,
            "tanggal_lahir": tgl_lahir,
            "alamat": alamat,
            "kota": kota,
            "provinsi": provinsi,
            "kode_pos": kode_pos,
            "jabatan_akademik": jabatan_akademik,
            "keilmuan": keilmuan,
            "pendidikan_terakhir": pendidikan_terakhir,
            "status_dosen": status_dosen,
            "tanggal_masuk": tgl_masuk,
            "foto_url": foto_url,
            "created_at": now_iso(),
            "last_login_at": "",
        }
        if not ex:
            await db.users.insert_one(doc)
            dosen_count += 1
        else:
            await db.users.update_one({"id": user_id}, {"$set": doc})

    print(f"  -> {dosen_count} dosen/pegawai dimasukkan.")

    # 4. MIGRASI MAHASISWA
    print("\n[4/7] Memigrasikan Mahasiswa...")
    mhs_count = 0
    mhs_map = {}
    for m in raw_mhsw:
        nim = str(m.get("MhswID") or m.get("Login") or "").strip().upper()
        if not nim:
            continue

        name = str(m.get("Nama") or nim).strip()
        email = make_unique_email(m.get("Email"), nim.lower(), nim)
        wa = str(m.get("WA") or m.get("Handphone") or "").strip()
        prodi_id = str(m.get("ProdiID") or "").strip()
        prodi_obj = prodi_map.get(prodi_id, {})
        prodi_nama = prodi_obj.get("nama", "")
        prodi_kode = prodi_obj.get("kode", "")
        
        tahun_id = str(m.get("TahunID") or "")
        angkatan = tahun_id[:4] if len(tahun_id) >= 4 else "2024"

        pa_id = str(m.get("PenasehatAkademik") or "").strip()
        pa_name = dosen_map.get(pa_id, {}).get("name", "")

        status_code = str(m.get("StatusMhswID") or "A").upper()
        status = "active" if status_code == "A" else "inactive"

        rombel_kid = str(m.get("KelasID") or "").strip()
        rombel_id = rombel_map.get(rombel_kid, {}).get("id", "")

        mhs_map[nim] = {"id": nim, "name": name, "email": email}

        # Map full profile details for student
        nik = str(m.get("NIK") or "").strip()
        nisn = str(m.get("NISN") or "").strip()
        gender = str(m.get("Kelamin") or m.get("KelaminID") or "").strip().upper()
        agama = str(m.get("Agama") or "").strip()
        tempat_lahir = str(m.get("TempatLahir") or "").strip()
        tgl_lahir = str(m.get("TanggalLahir") or "").strip()
        alamat = str(m.get("Alamat") or "").strip()
        kota = str(m.get("Kota") or "").strip()
        provinsi = str(m.get("Propinsi") or "").strip()
        kode_pos = str(m.get("KodePos") or "").strip()
        nama_ayah = str(m.get("NamaAyah") or "").strip()
        nama_ibu = str(m.get("NamaIbu") or "").strip()
        asal_sekolah = str(m.get("AsalSekolah") or "").strip()
        foto_url = str(m.get("Foto") or "").strip()

        ex = await db.users.find_one({"nim": nim, "role": "student"}, {"_id": 0})
        doc = {
            "id": nim,
            "role": "student",
            "username": nim.lower(),
            "nim": nim,
            "nik": nik,
            "nisn": nisn,
            "name": name,
            "email": email,
            "whatsapp": wa,
            "gender": gender,
            "agama": agama,
            "tempat_lahir": tempat_lahir,
            "tanggal_lahir": tgl_lahir,
            "alamat": alamat,
            "kota": kota,
            "provinsi": provinsi,
            "kode_pos": kode_pos,
            "nama_ayah": nama_ayah,
            "nama_ibu": nama_ibu,
            "asal_sekolah": asal_sekolah,
            "foto_url": foto_url,
            "password_hash": default_mhs_password_hash,
            "status": status,
            "class_ids": [],
            "rombel_id": rombel_id,
            "prodi_id": prodi_id,
            "prodi_name": prodi_nama,
            "prodi_kode": prodi_kode,
            "angkatan": angkatan,
            "dosen_wali_id": pa_id,
            "dosen_wali_name": pa_name,
            "created_at": now_iso(),
            "last_login_at": "",
        }
        if not ex:
            await db.users.insert_one(doc)
            mhs_count += 1
        else:
            await db.users.update_one({"id": ex["id"]}, {"$set": doc})

    print(f"  -> {mhs_count} mahasiswa dimasukkan.")

    # 4b. MIGRASI KURIKULUM MASTER
    print("\n[4b] Memigrasikan Master Kurikulum...")
    kurikulum_map = {}
    kur_count = 0
    for k in raw_kurikulum:
        kid = str(k.get("KurikulumID") or "").strip()
        if not kid:
            continue
        kode = str(k.get("KurikulumKode") or k.get("SKKurikulum") or f"KUR-{kid}").strip()
        nama = str(k.get("Nama") or f"Kurikulum {kid}").strip()
        prodi_id = str(k.get("ProdiID") or "").strip()
        prodi_obj = prodi_map.get(prodi_id, {})
        prodi_nama = prodi_obj.get("nama", "")
        tahun_id = str(k.get("TahunID") or "")
        tahun_mulai = tahun_id[:4] if len(tahun_id) >= 4 else "2023"

        kurikulum_map[kid] = {"id": kid, "kode": kode, "nama": nama, "prodi_id": prodi_id}

        ex = await db.kurikulum.find_one({"id": kid}, {"_id": 0})
        doc = {
            "id": kid,
            "kode": kode,
            "nama": nama,
            "prodi_id": prodi_id,
            "prodi_nama": prodi_nama,
            "tahun_mulai": tahun_mulai,
            "status": "active" if k.get("NA") != "Y" else "inactive",
            "total_sks_wajib": int(k.get("SKSWAjib") or 0),
            "total_sks_pilihan": int(k.get("SKSPilihan") or 0),
            "created_at": now_iso(),
        }
        if not ex:
            await db.kurikulum.insert_one(doc)
            kur_count += 1
        else:
            await db.kurikulum.update_one({"id": kid}, {"$set": doc})

    print(f"  -> {kur_count} kurikulum master dimasukkan.")

    # 5. MIGRASI MATA KULIAH (MK / COURSES)
    print("\n[5/7] Memigrasikan Mata Kuliah (Courses)...")
    mk_count = 0
    for mk in raw_mk:
        mk_id = str(mk.get("MKID") or "").strip()
        mk_kode = str(mk.get("MKKode") or mk_id).strip()
        nama = str(mk.get("Nama") or "").strip()
        if not nama:
            continue
        
        sks = int(mk.get("SKS") or 3)
        sks_tm = int(mk.get("SKSTatapMuka") or sks)
        sks_pr = int(mk.get("SKSPraktikum") or 0) + int(mk.get("SKSPraktekLap") or 0)
        prodi_id = str(mk.get("ProdiID") or "").strip()
        prodi_obj = prodi_map.get(prodi_id, {})
        prodi_nama = prodi_obj.get("nama", "")

        kid = str(mk.get("KurikulumID") or "").strip()
        kur_obj = kurikulum_map.get(kid, {})
        kur_kode = kur_obj.get("kode", "")

        try:
            sem_paket = int(mk.get("Sesi") or 1)
        except ValueError:
            sem_paket = 1

        wajib = str(mk.get("Wajib") or "Y").upper()
        sifat = "Wajib" if wajib == "Y" else "Pilihan"

        ex = await db.courses.find_one({"id": mk_id}, {"_id": 0})
        doc = {
            "id": mk_id,
            "kurikulum_id": kid,
            "kurikulum_kode": kur_kode,
            "program_id": prodi_id,
            "prodi_id": prodi_id,
            "program_name": prodi_nama,
            "code": mk_kode,
            "kode": mk_kode,
            "name": nama,
            "nama": nama,
            "credits": sks,
            "sks": sks,
            "total_sks": sks,
            "sks_teori": sks_tm,
            "sks_praktikum": sks_pr,
            "semester_paket": sem_paket,
            "semester": sem_paket,
            "sifat": sifat,
            "description": str(mk.get("Deskripsi") or "").strip(),
            "status": "active" if mk.get("NA") != "Y" else "inactive",
            "created_at": now_iso(),
        }
        if not ex:
            await db.courses.insert_one(doc)
            mk_count += 1
        else:
            await db.courses.update_one({"id": mk_id}, {"$set": doc})

    print(f"  -> {mk_count} mata kuliah dimasukkan.")

    # 6. MIGRASI JADWAL / KELAS
    print("\n[6/7] Memigrasikan Kelas (Classes)...")
    
    # Periode aktif: hanya kelas pada periode aktif yang berstatus "active"
    active_tahun_id = active_period

    # Map student enrollment per class from KRS
    class_students_map = {}
    for krs in raw_krs:
        jid = str(krs.get("JadwalID") or "").strip()
        mhs_id = str(krs.get("MhswID") or "").strip()
        if jid and mhs_id and jid != "0":
            class_students_map.setdefault(jid, set()).add(mhs_id)

    # Map ruangan (tabel `ruang`) agar jadwal bisa dihubungkan ke ruangan
    ruang_set = {}
    for r in raw_ruang:
        rid = str(r.get("RuangID") or "").strip()
        if rid:
            ruang_set[rid] = {"id": rid, "kode": rid}

    class_count = 0
    for j in raw_jadwal:
        jid = str(j.get("JadwalID") or "").strip()
        if not jid:
            continue
        
        course_name = str(j.get("Nama") or "").strip()
        mk_id = str(j.get("MKID") or "").strip()
        kelas_kid = str(j.get("KelasID") or "").strip()
        rombel_obj = rombel_map.get(kelas_kid, {})
        rombel_id = rombel_obj.get("id", "")

        # Nama kelas perkuliahan diambil dari rombel; fallback Kalkulator jika tidak ada rombel
        if rombel_obj.get("nama"):
            class_name = f"Kelas {rombel_obj['nama']}"
        else:
            class_name = str(j.get("NamaKelas_old") or "").strip()
            if not class_name or class_name == "0" or class_name == "01":
                class_name = f"Kelas {jid}"

        tahun_id = str(j.get("TahunID") or "20241")
        academic_year = f"{tahun_id[:4]}/{int(tahun_id[:4])+1}" if len(tahun_id) >= 4 else "2024/2025"
        semester = "Ganjil" if tahun_id.endswith("1") else "Genap"

        class_status = "active" if tahun_id == active_tahun_id else "ended"

        dosen_id = str(j.get("DosenID") or "").strip()
        dosen_name = dosen_map.get(dosen_id, {}).get("name", "")

        prodi_id = str(j.get("ProdiID") or "").strip()
        prodi_nama = prodi_map.get(prodi_id, {}).get("nama", "")

        hari = str(j.get("HariID") or "")
        jam_mulai = str(j.get("JamMulai") or "")
        jam_selesai = str(j.get("JamSelesai") or "")
        schedule = f"Hari {hari} {jam_mulai}-{jam_selesai}".strip()

        # Konversi HariID OLD-SIAP (0=Minggu..6=Sabtu) -> jadwal_hari (1=Senin..7=Minggu)
        hari_map = {"0": 7, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6}
        jadwal_hari = hari_map.get(hari.strip())

        def to_hhmm(value):
            parts = str(value or "").strip().split(":")
            if len(parts) >= 2:
                return f"{int(parts[0]):02d}:{int(parts[1]):02d}"
            return ""

        jadwal_jam_mulai = to_hhmm(jam_mulai)
        jadwal_jam_selesai = to_hhmm(jam_selesai)

        # RuangID string (mis. A1101 / OnLine) cocok ke tabel ruang; ID numerik (1-87) tidak cocok -> ruangan kosong
        ruang_id_old = str(j.get("RuangID") or "").strip()
        ruang_ref = ruang_set.get(ruang_id_old)
        ruangan_id = ruang_ref.get("id", "") if ruang_ref else ""
        ruangan_kode = ruang_ref.get("kode", "") if ruang_ref else ""

        # Label jadwal user-friendly (konsisten dengan endpoint PUT)
        hari_label = {1: "Senin", 2: "Selasa", 3: "Rabu", 4: "Kamis", 5: "Jumat", 6: "Sabtu", 7: "Minggu"}
        if jadwal_hari and jadwal_jam_mulai and jadwal_jam_selesai:
            label_parts = [f"{hari_label[jadwal_hari]}, {jadwal_jam_mulai}–{jadwal_jam_selesai}"]
            if ruangan_kode:
                label_parts.append(f"Ruang {ruangan_kode}")
            schedule = " · ".join(label_parts)

        student_ids = list(class_students_map.get(jid, set()))

        class_code = f"KLS{jid.zfill(4)}"

        ex = await db.classes.find_one({"id": jid}, {"_id": 0})
        doc = {
            "id": jid,
            "academic_year": academic_year,
            "semester": semester,
            "course_id": mk_id,
            "course_name": course_name,
            "name": class_name,
            "schedule": schedule,
            "jadwal_hari": jadwal_hari,
            "jadwal_jam_mulai": jadwal_jam_mulai,
            "jadwal_jam_selesai": jadwal_jam_selesai,
            "ruangan_id": ruangan_id,
            "ruangan_kode": ruangan_kode,
            "class_code": class_code,
            "lecturer_id": dosen_id,
            "lecturer_name": dosen_name,
            "status": class_status,
            "rombel_id": rombel_id,
            "student_ids": student_ids,
            "program_id": prodi_id,
            "program_name": prodi_nama,
            "created_at": now_iso(),
        }
        if not ex:
            await db.classes.insert_one(doc)
            class_count += 1
        else:
            await db.classes.update_one({"id": jid}, {"$set": doc})

        # Also update users.class_ids for each student
        for st_id in student_ids:
            await db.users.update_one({"nim": st_id}, {"$addToSet": {"class_ids": jid}})

    print(f"  -> {class_count} kelas dimasukkan.")

    # 7. MIGRASI TAHUN AJARAN
    print("\n[7/7] Memigrasikan Tahun Ajaran...")
    ta_count = 0
    for t in raw_tahun:
        tid = str(t.get("TahunID") or "").strip()
        if not tid:
            continue
        
        nama = str(t.get("Nama") or "").strip()
        label = parse_tahun_label(tid, nama)
        is_active = (tid == active_tahun_id)

        ex = await db.tahun_ajaran.find_one({"id": tid}, {"_id": 0})
        doc = {
            "id": tid,
            "tahun": tid[:4] if len(tid) >= 4 else "2024",
            "semester": "Ganjil" if tid.endswith("1") else "Genap",
            "nama": label,
            "is_active": is_active,
            "status": "active" if is_active else "closed",
            "activated_at": now_iso() if is_active else "",
            "created_at": now_iso(),
        }
        if not ex:
            await db.tahun_ajaran.insert_one(doc)
            ta_count += 1
        else:
            await db.tahun_ajaran.update_one({"id": tid}, {"$set": doc})

    print(f"  -> {ta_count} tahun ajaran dimasukkan.")

    # 8. MIGRASI PREDIKAT NILAI
    print("\n[8/10] Memigrasikan Predikat Nilai...")
    predicates_list = []
    seen_labels = set()
    for n in raw_nilai:
        label = str(n.get("Nama") or "").strip()
        if not label or label in seen_labels:
            continue
        seen_labels.add(label)
        try:
            min_s = float(n.get("NilaiMin") or 0)
            max_s = float(n.get("NilaiMax") or 100)
            gpa_val = float(n.get("Bobot") or 0)
            predicates_list.append({
                "label": label,
                "min_score": min_s,
                "max_score": max_s,
                "gpa": gpa_val,
            })
        except ValueError:
            pass

    if predicates_list:
        predicates_list.sort(key=lambda x: x["min_score"], reverse=True)
        global_pred_doc = {
            "class_id": "",
            "predicates": predicates_list,
            "updated_at": now_iso(),
        }
        await db.grade_predicates.update_one({"class_id": ""}, {"$set": global_pred_doc}, upsert=True)
        print(f"  -> {len(predicates_list)} predikat nilai disimpan sebagai konfigurasi global.")

    # 9. MIGRASI KHS MAHASISWA
    print("\n[9/10] Memigrasikan KHS (IPS/IPK) Mahasiswa...")
    khs_count = 0
    # Group KRS items per student + semester for KHS grades list
    krs_by_student_tahun = {}
    for krs in raw_krs:
        mhs_id = str(krs.get("MhswID") or "").strip()
        t_id = str(krs.get("TahunID") or "").strip()
        if mhs_id and t_id:
            key = f"{mhs_id}_{t_id}"
            krs_by_student_tahun.setdefault(key, []).append({
                "course_code": str(krs.get("MKKode") or "").strip(),
                "course_name": str(krs.get("Nama") or "").strip(),
                "sks": int(krs.get("SKS") or 0),
                "grade_letter": str(krs.get("GradeNilai") or "").strip(),
                "grade_point": float(krs.get("BobotNilai") or 0.0),
                "score": float(krs.get("NilaiAkhir") or 0.0),
            })

    for khs in raw_khs:
        khs_id = str(khs.get("KHSID") or "").strip()
        mhs_id = str(khs.get("MhswID") or "").strip()
        t_id = str(khs.get("TahunID") or "").strip()
        if not khs_id or not mhs_id or not t_id:
            continue

        try:
            ips = float(khs.get("IPS") or 0.0)
            ipk = float(khs.get("IPK") or 0.0)
            sks_sem = int(khs.get("SKS") or 0)
            sks_kum = int(khs.get("TotalSKS") or 0)
        except ValueError:
            ips, ipk, sks_sem, sks_kum = 0.0, 0.0, 0, 0

        grades = krs_by_student_tahun.get(f"{mhs_id}_{t_id}", [])

        khs_doc = {
            "id": khs_id,
            "student_id": mhs_id,
            "academic_period_id": t_id,
            "period_name": parse_tahun_label(t_id),
            "ips": ips,
            "ipk": ipk,
            "total_sks_semester": sks_sem,
            "total_sks_kumulatif": sks_kum,
            "grades": grades,
            "updated_at": now_iso(),
        }

        await db.khs.update_one(
            {"student_id": mhs_id, "academic_period_id": t_id},
            {"$set": khs_doc},
            upsert=True,
        )
        khs_count += 1

    print(f"  -> {khs_count} KHS mahasiswa dimasukkan.")

    # 10. MIGRASI KRS (PENDAFTARAN MATKUL) & SUBMISSIONS/ASSIGNMENTS
    print("\n[10/11] Memigrasikan Data KRS...")
    krs_count = 0
    krs_grouped = {}
    
    # Store unique classes that need an assignment container
    classes_with_grades = set()

    for krs in raw_krs:
        mhs_id = str(krs.get("MhswID") or "").strip()
        t_id = str(krs.get("TahunID") or "").strip()
        jid = str(krs.get("JadwalID") or "").strip()
        if not mhs_id or not t_id:
            continue
        
        key = f"{mhs_id}_{t_id}"
        krs_grouped.setdefault(key, {
            "id": f"krs_{mhs_id}_{t_id}",
            "student_id": mhs_id,
            "academic_period_id": t_id,
            "status": "approved",
            "created_at": now_iso(),
            "courses": [],
        })["courses"].append({
            "course_code": str(krs.get("MKKode") or "").strip(),
            "course_name": str(krs.get("Nama") or "").strip(),
            "sks": int(krs.get("SKS") or 0),
            "class_id": jid,
            "grade_letter": str(krs.get("GradeNilai") or "").strip(),
            "grade_point": float(krs.get("BobotNilai") or 0.0),
            "final_score": float(krs.get("NilaiAkhir") or 0.0),
        })

        if jid and jid != "0":
            classes_with_grades.add(jid)

    for key, krs_doc in krs_grouped.items():
        await db.krs.update_one(
            {"student_id": krs_doc["student_id"], "academic_period_id": krs_doc["academic_period_id"]},
            {"$set": krs_doc},
            upsert=True,
        )
        krs_count += 1

    print(f"  -> {krs_count} dokumen KRS (dengan rincian matkul) dimasukkan.")

    # 11. MIGRASI SUBMISSIONS & ASSIGNMENTS (NILAI UNTUK EVALUASI & REKAP)
    print("\n[11/11] Memigrasikan Evaluasi & Submissions Nilai ke Halaman Rekap...")
    assignment_count = 0
    submission_count = 0

    # Ensure each class has 3 component assignments: Tugas, UTS, UAS
    assignment_map = {} # class_id -> { "tugas": id, "uts": id, "uas": id }
    for jid in classes_with_grades:
        class_doc = await db.classes.find_one({"id": jid}, {"_id": 0})
        if not class_doc:
            continue
        
        c_name = class_doc.get("course_name", "Mata Kuliah")
        cls_name = class_doc.get("name", "Kelas")

        # 1. Tugas
        asgn_tugas_id = f"asgn_old_tugas_{jid}"
        asgn_tugas_doc = {
            "id": asgn_tugas_id,
            "class_id": jid,
            "course_name": c_name,
            "class_name": cls_name,
            "title": "Tugas Perkuliahan (Migrasi OLD-SIAP)",
            "description": "Nilai akumulasi tugas dari database OLD-SIAP",
            "deadline": now_iso(),
            "is_active": True,
            "assessment_category": "tugas",
            "created_at": now_iso(),
        }
        await db.assignments.update_one({"id": asgn_tugas_id}, {"$set": asgn_tugas_doc}, upsert=True)
        assignment_count += 1

        # 2. UTS
        asgn_uts_id = f"asgn_old_uts_{jid}"
        asgn_uts_doc = {
            "id": asgn_uts_id,
            "class_id": jid,
            "course_name": c_name,
            "class_name": cls_name,
            "title": "Evaluasi Tengah Semester / UTS (Migrasi OLD-SIAP)",
            "description": "Nilai UTS dari database OLD-SIAP",
            "deadline": now_iso(),
            "is_active": True,
            "assessment_category": "uts",
            "created_at": now_iso(),
        }
        await db.assignments.update_one({"id": asgn_uts_id}, {"$set": asgn_uts_doc}, upsert=True)
        assignment_count += 1

        # 3. UAS
        asgn_uas_id = f"asgn_old_uas_{jid}"
        asgn_uas_doc = {
            "id": asgn_uas_id,
            "class_id": jid,
            "course_name": c_name,
            "class_name": cls_name,
            "title": "Evaluasi Akhir Semester / UAS (Migrasi OLD-SIAP)",
            "description": "Nilai UAS dari database OLD-SIAP",
            "deadline": now_iso(),
            "is_active": True,
            "assessment_category": "uas",
            "created_at": now_iso(),
        }
        await db.assignments.update_one({"id": asgn_uas_id}, {"$set": asgn_uas_doc}, upsert=True)
        assignment_count += 1

        # Also keep legacy alias mapping for backwards compatibility
        asgn_legacy_id = f"asgn_old_{jid}"
        asgn_legacy_doc = {**asgn_uas_doc, "id": asgn_legacy_id}
        await db.assignments.update_one({"id": asgn_legacy_id}, {"$set": asgn_legacy_doc}, upsert=True)

        assignment_map[jid] = {
            "tugas": asgn_tugas_id,
            "uts": asgn_uts_id,
            "uas": asgn_uas_id,
        }

    for krs in raw_krs:
        jid = str(krs.get("JadwalID") or "").strip()
        mhs_id = str(krs.get("MhswID") or "").strip()
        if not jid or jid == "0" or not mhs_id:
            continue

        amap = assignment_map.get(jid)
        if not amap:
            continue

        grade_letter = str(krs.get("GradeNilai") or "").strip()

        # Extract Tugas
        t_vals = []
        for tk in ["Tugas1", "Tugas2", "Tugas3", "Tugas4", "Tugas5"]:
            try:
                v = float(krs.get(tk) or 0)
                if v > 0: t_vals.append(v)
            except Exception: pass
        tugas_score = round(sum(t_vals) / len(t_vals), 2) if t_vals else None

        # Extract UTS
        try:
            uts_val = float(krs.get("UTS") or 0)
            uts_score = uts_val if uts_val > 0 else None
        except Exception: uts_score = None

        # Extract UAS
        try:
            uas_val = float(krs.get("UAS") or 0)
            na_val = float(krs.get("NilaiAkhir") or 0)
            uas_score = uas_val if uas_val > 0 else (na_val if na_val > 0 else None)
        except Exception: uas_score = None

        # 1. Save Tugas Submission
        if tugas_score is not None:
            sub_id = f"sub_old_tugas_{jid}_{mhs_id}"
            sub_doc = {
                "id": sub_id,
                "assignment_id": amap["tugas"],
                "student_id": mhs_id,
                "class_id": jid,
                "status": "Sudah Dinilai",
                "review_status": "graded",
                "submitted_at": now_iso(),
                "grade": tugas_score,
                "grade_predicate": grade_letter,
                "feedback": f"Migrasi SIAP - Tugas Rata-rata: {tugas_score}",
                "created_at": now_iso(),
            }
            await db.submissions.update_one({"id": sub_id}, {"$set": sub_doc}, upsert=True)
            submission_count += 1

        # 2. Save UTS Submission
        if uts_score is not None:
            sub_id = f"sub_old_uts_{jid}_{mhs_id}"
            sub_doc = {
                "id": sub_id,
                "assignment_id": amap["uts"],
                "student_id": mhs_id,
                "class_id": jid,
                "status": "Sudah Dinilai",
                "review_status": "graded",
                "submitted_at": now_iso(),
                "grade": uts_score,
                "grade_predicate": grade_letter,
                "feedback": f"Migrasi SIAP - UTS: {uts_score}",
                "created_at": now_iso(),
            }
            await db.submissions.update_one({"id": sub_id}, {"$set": sub_doc}, upsert=True)
            submission_count += 1

        # 3. Save UAS Submission
        if uas_score is not None:
            sub_id = f"sub_old_uas_{jid}_{mhs_id}"
            sub_doc = {
                "id": sub_id,
                "assignment_id": amap["uas"],
                "student_id": mhs_id,
                "class_id": jid,
                "status": "Sudah Dinilai",
                "review_status": "graded",
                "submitted_at": now_iso(),
                "grade": uas_score,
                "grade_predicate": grade_letter,
                "feedback": f"Migrasi SIAP - UAS: {uas_score}, NA: {krs.get('NilaiAkhir', 0)}, Grade: {grade_letter}",
                "created_at": now_iso(),
            }
            await db.submissions.update_one({"id": sub_id}, {"$set": sub_doc}, upsert=True)

            # Also update legacy sub_id
            legacy_sub_id = f"sub_old_{jid}_{mhs_id}"
            legacy_sub_doc = {**sub_doc, "id": legacy_sub_id}
            await db.submissions.update_one({"id": legacy_sub_id}, {"$set": legacy_sub_doc}, upsert=True)
            submission_count += 1

    print(f"  -> {assignment_count} evaluasi/tugas kelas (Tugas, UTS, UAS) dibuat.")
    print(f"  -> {submission_count} submission nilai mahasiswa dimasukkan.")

    # 12. MIGRASI TRANSKRIP DARI OLD-SIAP (Cross-Check dengan Feeder)
    print("\n[12/12] Memigrasikan Nilai Transkrip OLD-SIAP (dengan penanda status Feeder)...")
    old_trans_count = 0
    mhsw_map = {str(m.get("MhswID")).strip().upper(): m for m in raw_mhsw}

    import re
    def norm_str(text):
        return re.sub(r'[^a-z0-9]', '', (text or '').lower())

    # Fetch existing transcript docs from db.transkrip
    existing_trans_docs = await db.transkrip.find({}, {"_id": 0}).to_list(100000)
    feeder_trans_keys = set()
    for doc in existing_trans_docs:
        nim = str(doc.get("nim") or "").strip().upper()
        kode_mk = str(doc.get("course_code") or doc.get("course_id") or "").strip().upper()
        name_mk = norm_str(doc.get("course_name"))
        smt_id = str(doc.get("semester_id") or "").strip()
        if nim and kode_mk:
            feeder_trans_keys.add(f"{nim}_{kode_mk}")
        if nim and name_mk and smt_id:
            feeder_trans_keys.add(f"{nim}_{smt_id}_{name_mk}")

    # Mark existing Feeder docs as is_feeder: True if not set
    await db.transkrip.update_many({"is_feeder": {"$exists": False}}, {"$set": {"is_feeder": True}})

    for krs in raw_krs:
        nim = str(krs.get("MhswID") or "").strip().upper()
        t_id = str(krs.get("TahunID") or "").strip()
        mk_kode = str(krs.get("MKKode") or "").strip().upper()
        mk_name = str(krs.get("Nama") or "").strip()
        if not nim or not t_id or not mk_kode:
            continue

        key = f"{nim}_{mk_kode}"
        norm_key = f"{nim}_{t_id}_{norm_str(mk_name)}"
        # If this course grade already exists from Feeder Online, keep the Feeder record
        if key in feeder_trans_keys or norm_key in feeder_trans_keys:
            continue

        try:
            sks_val = float(krs.get("SKS") or 3.0)
        except ValueError:
            sks_val = 3.0

        try:
            nilai_akhir = float(krs.get("NilaiAkhir")) if krs.get("NilaiAkhir") is not None else None
        except ValueError:
            nilai_akhir = None

        try:
            nilai_indeks = float(krs.get("BobotNilai")) if krs.get("BobotNilai") is not None else None
        except ValueError:
            nilai_indeks = None

        nilai_huruf = str(krs.get("GradeNilai") or "").strip()
        
        mhs_obj = mhsw_map.get(nim, {})
        mhs_name = str(mhs_obj.get("Nama") or nim).strip()
        mulai_smt = str(mhs_obj.get("TahunID") or t_id)

        try:
            y_start, t_start = int(mulai_smt[:4]), int(mulai_smt[4])
            y_g, t_g = int(t_id[:4]), int(t_id[4])
            sem_num = max(1, (y_g - y_start) * 2 + (t_g - t_start) + 1)
        except Exception:
            sem_num = 1
            y_g, t_g = 2024, 2

        term_str = "Ganjil" if t_id.endswith("1") else "Genap"
        nama_semester = f"{t_id[:4]}/{int(t_id[:4])+1} {term_str} (Semester {sem_num})"

        trans_id = f"TRANS_OLD_{nim}_{mk_kode}_{t_id}"
        doc = {
            "id": trans_id,
            "student_id": nim,
            "nim": nim,
            "student_name": mhs_name,
            "semester_id": t_id,
            "semester_ke": sem_num,
            "nama_semester": nama_semester,
            "course_id": mk_kode,
            "course_code": mk_kode,
            "course_name": mk_name,
            "sks": sks_val,
            "asal_nilai_id": "OLD_SIAP",
            "asal_nilai": "SIAP Lama (Belum Masuk Feeder)",
            "is_feeder": False,
            "grade_letter": nilai_huruf,
            "grade_point": nilai_indeks,
            "score": nilai_akhir,
            "created_at": now_iso(),
        }

        ex = await db.transkrip.find_one({"id": trans_id}, {"_id": 0})
        if not ex:
            await db.transkrip.insert_one(doc)
            old_trans_count += 1
        else:
            await db.transkrip.update_one({"id": trans_id}, {"$set": doc})

    print(f"  -> {old_trans_count} nilai transkrip dari OLD-SIAP (Belum Masuk Feeder) dimasukkan.")

    # ─────────────────────────────────────────────────────────────────
    # MIGRASI GEDUNG & RUANGAN (tabel `ruang` di OLD-SIAP)
    # Struktur: Gedung (kampus) > Ruangan
    # Nama ruang sumber contoh: "Kampus A, Gedung 1, Lt 1, No 01"
    # ─────────────────────────────────────────────────────────────────
    def norm_str(value):
        return str(value or "").strip()

    def extract_gedung_label(nama_ruang, kode_ruang):
        """Kelompokkan ruangan ke gedung berdasarkan nama/kode ruang."""
        nama = norm_str(nama_ruang)
        if not nama:
            return "Lainnya"
        # Ambil bagian sebelum ", Lt" sebagai nama gedung
        label = nama.split(", Lt")[0].strip()
        if not label:
            label = nama
        if label.lower() in ("online", "daring", "virtual"):
            return "Online"
        return label

    def gedung_kode(label):
        """Derivasi kode gedung yang unik dari label."""
        base = norm_str(label)
        if base.lower() in ("online", "daring", "virtual"):
            return "ONLINE"
        # "Kampus A, Gedung 1" -> "GED-KA-1", "Gedung B" -> "GED-B"
        tokens = [t for t in base.replace(",", " ").split() if t]
        parts = []
        for t in tokens:
            if t.lower() in ("gedung", "kampus", "lt", "no", "ged", "a", "b", "c"):
                parts.append(t.upper())
            elif t.isdigit():
                parts.append(t)
            else:
                parts.append(t.upper())
        return "GED-" + "-".join(parts) if parts else "GED-LAIN"

    gedung_map = {}
    for r in raw_ruang:
        label = extract_gedung_label(r.get("Nama"), r.get("RuangID"))
        kode = gedung_kode(label)
        if kode not in gedung_map:
            gedung_map[kode] = {"label": label, "kampus": norm_str(r.get("KampusID")) or None}
    gedung_sorted = sorted(gedung_map.items(), key=lambda kv: kv[1]["label"])

    gedung_count = 0
    ruangan_count = 0
    for kode, info in gedung_sorted:
        gedung_id = f"GDG-{kode}"
        ex_gedung = await db.gedung.find_one({"id": gedung_id}, {"_id": 0})
        if not ex_gedung:
            await db.gedung.insert_one({
                "id": gedung_id,
                "kode": kode,
                "nama": info["label"],
                "lokasi": f"Kampus {info['kampus']}" if info.get("kampus") else None,
                "keterangan": "Dibuat otomatis dari migrasi OLD-SIAP (ruang)",
                "status": "active",
                "created_at": now_iso(),
                "is_feeder": True,
            })
            gedung_count += 1

    for r in raw_ruang:
        label = extract_gedung_label(r.get("Nama"), r.get("RuangID"))
        kode_gedung = gedung_kode(label)
        ruang_id = norm_str(r.get("RuangID")) or f"RUANG-{ruangan_count}"
        doc = {
            "id": ruang_id,
            "kode": ruang_id,
            "nama": norm_str(r.get("Nama")) or ruang_id,
            "gedung_id": f"GDG-{kode_gedung}",
            "lantai": norm_str(r.get("Lantai")),
            "kapasitas": int(float(r.get("Kapasitas") or 0)) if str(r.get("Kapasitas") or "").strip() else 0,
            "keterangan": norm_str(r.get("Keterangan")),
            "status": "active" if str(r.get("NA") or "N").upper() != "Y" else "inactive",
            "is_feeder": True,
            "created_at": now_iso(),
        }
        ex_ruang = await db.ruangan.find_one({"id": ruang_id}, {"_id": 0})
        if not ex_ruang:
            await db.ruangan.insert_one(doc)
            ruangan_count += 1
        else:
            await db.ruangan.update_one({"id": ruang_id}, {"$set": doc})

    print(f"  -> {gedung_count} gedung & {ruangan_count} ruangan dari OLD-SIAP dimasukkan.")

    print("\n=========================================")
    print("MIGRASI SELESAI DENGAN SUKSES!")
    print("=========================================\n")


def main():
    execute = "--execute" in sys.argv
    file_path = None
    if "--file" in sys.argv:
        idx = sys.argv.index("--file")
        if idx + 1 < len(sys.argv):
            file_path = sys.argv[idx + 1]

    asyncio.run(run_migration(file_path=file_path, execute=execute))

if __name__ == "__main__":
    main()
