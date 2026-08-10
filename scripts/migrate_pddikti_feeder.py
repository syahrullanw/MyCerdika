#!/usr/bin/env python3
"""
Script Migrasi Data Export PDDIKTI NeoFeeder ke Sistem Baru (Nugas-lagi PostgreSQL).

Folder Sumber: dump_feeder/pddikti_export_all/csv/

Penggunaan:
  python scripts/migrate_pddikti_feeder.py --check     # Dry-run (hanya mengecek dan menghitung jumlah record)
  python scripts/migrate_pddikti_feeder.py --execute   # Mengeksekusi migrasi ke PostgreSQL
"""

import sys
import os
import csv
import asyncio
from datetime import datetime, timezone
from pathlib import Path
import bcrypt

# Ensure backend directory is in sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
load_dotenv(BACKEND_DIR / ".env")

from postgres_database import PostgresDatabase

FEEDER_CSV_DIR = ROOT_DIR / "dump_feeder" / "pddikti_export_all" / "csv"

# Map Referensi Standar Feeder PDDIKTI
JENIS_DAFTAR_MAP = {
    "1": "Peserta Didik Baru",
    "2": "Pindahan",
    "3": "Alih Jenjang",
    "11": "Cross-program / Lintas Jalur",
}

JALUR_MASUK_MAP = {
    "1": "SNMPTN",
    "2": "SBMPTN",
    "11": "Beasiswa",
    "12": "Mandiri",
}

PEMBIAYAAN_MAP = {
    "1": "Mandiri",
    "2": "Beasiswa Internal PT",
    "3": "Beasiswa Pemerintah / KIP-Kuliah",
    "4": "Beasiswa Swasta",
}

JENIS_KELUAR_MAP = {
    "1": "Lulus",
    "2": "Mutasi / Pindah",
    "3": "Dikeluarkan (DO)",
    "4": "Mengundurkan Diri",
    "5": "Putus Sekolah",
    "6": "Wafat",
}

AGAMA_MAP = {
    "1": "Islam",
    "2": "Kristen",
    "3": "Katolik",
    "4": "Hindu",
    "5": "Buddha",
    "6": "Konghucu",
    "99": "Lainnya",
}

IKATAN_KERJA_MAP = {
    "A": "Dosen Tetap",
    "B": "Dosen Tidak Tetap",
    "C": "Dosen Tamu / Praktisi",
    "D": "Dosen PPPK",
}

STAT_PEGAWAI_MAP = {
    "1": "PNS",
    "2": "PNS Depag",
    "3": "PNS Daerah",
    "16": "GTY / Tetap Yayasan",
    "17": "Pegawai Kontrak / Tidak Tetap",
}

PANGKAT_GOL_MAP = {
    "1": "I/a - Juru Muda",
    "2": "I/b - Juru Muda Tingkat I",
    "3": "I/c - Juru",
    "4": "I/d - Juru Tingkat I",
    "5": "II/a - Pengatur Muda",
    "6": "II/b - Pengatur Muda Tingkat I",
    "7": "II/c - Pengatur",
    "8": "II/d - Pengatur Tingkat I",
    "9": "III/a - Penata Muda",
    "10": "III/b - Penata Muda Tingkat I",
    "11": "III/c - Penata",
    "12": "III/d - Penata Tingkat I",
    "13": "IV/a - Pembina",
    "14": "IV/b - Pembina Tingkat I",
    "15": "IV/c - Pembina Utama Muda",
    "16": "IV/d - Pembina Utama Madya",
    "17": "IV/e - Pembina Utama",
}

STAT_AKAKTIF_MAP = {
    "1": "Aktif",
    "2": "Cuti",
    "3": "Tugas Belajar",
    "4": "Izin Belajar",
    "0": "Non-Aktif",
}

JENJANG_DIDIK_MAP = {
    "20": "D1",
    "21": "D2",
    "22": "D3",
    "23": "D4",
    "30": "S1",
    "35": "S2",
    "40": "S3",
    "31": "Spesialis 1",
    "32": "Spesialis 2",
    "33": "Profesi",
}

JENIS_MK_MAP = {
    "A": "Wajib Program Studi",
    "B": "Pilihan",
    "C": "Tugas Akhir / Skripsi",
    "D": "PKL / Magang",
    "S": "KKN / Pengabdian",
}

KELOMPOK_MK_MAP = {
    "A": "MPK (Mata Kuliah Pengembangan Kepribadian)",
    "B": "MKK (Mata Kuliah Keahlian & Keterampilan)",
    "C": "MKB (Mata Kuliah Keahlian Berkarya)",
    "D": "MPB (Mata Kuliah Perilaku Berkarya)",
    "E": "MBB (Mata Kuliah Berkehidupan Bermasyarakat)",
}

MODE_KULIAH_MAP = {
    "F": "Tatap Muka (Luring / Offline)",
    "O": "Online (Daring)",
    "M": "Hybrid / Blended Learning",
}

LINGKUP_KELAS_MAP = {
    "1": "Internal Kampus",
    "2": "Eksternal / Pertukaran",
    "3": "Campuran / MBKM",
}

JENIS_EVALUASI_MAP = {
    "1": "Evaluasi Akademik (Penilaian Utama)",
    "2": "Penguji / Evaluator",
    "3": "Pembimbing / Mentor",
}

ASAL_NILAI_MAP = {
    "N": "Perkuliahan Reguler / Normal",
    "K": "Konversi Nilai (Transfer)",
    "M": "Matrikulasi",
    "E": "Ekuivalensi Kurikulum",
}

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def read_csv_table(filename: str):
    filepath = FEEDER_CSV_DIR / filename
    if not filepath.exists():
        print(f"[WARNING] File {filename} tidak ditemukan di {FEEDER_CSV_DIR}")
        return []
    with open(filepath, "r", encoding="utf-8-sig", errors="replace") as f:
        reader = csv.DictReader(f)
        return list(reader)

def parse_semester_code(smt_code: str) -> dict:
    """Format: 20231 -> 2023/2024 Ganjil, 20232 -> 2023/2024 Genap, 20233 -> 2023/2024 Pendek"""
    code_str = str(smt_code).strip()
    if len(code_str) >= 5:
        year = code_str[:4]
        term = code_str[4]
        next_year = int(year) + 1
        term_str = "Ganjil" if term == "1" else ("Genap" if term == "2" else "Pendek")
        return {
            "code": code_str,
            "year": f"{year}/{next_year}",
            "semester": term_str,
            "name": f"Tahun Akademik {year}/{next_year} {term_str}"
        }
    return {
        "code": code_str,
        "year": code_str,
        "semester": "Ganjil",
        "name": f"Periode {code_str}"
    }

async def run_migration(execute=False):
    if not FEEDER_CSV_DIR.exists():
        print(f"ERROR: Folder CSV Feeder {FEEDER_CSV_DIR} tidak ditemukan!")
        sys.exit(1)

    print(f"Membaca data export CSV dari {FEEDER_CSV_DIR}...\n")

    raw_sp = read_csv_table("satuan_pendidikan.csv")
    raw_pt = read_csv_table("profil_pt.csv")
    raw_sms = read_csv_table("sms.csv")
    raw_profil_prodi = read_csv_table("profil_prodi.csv")
    raw_kurikulum = read_csv_table("kurikulum_sp.csv")
    raw_bobot = read_csv_table("bobot_nilai.csv")
    raw_reg_pd = read_csv_table("reg_pd.csv")
    raw_pd = read_csv_table("peserta_didik.csv")
    raw_reg_ptk = read_csv_table("reg_ptk.csv")
    raw_sdm = read_csv_table("sdm.csv")
    raw_rwy_pend = read_csv_table("rwy_pend_formal.csv")
    raw_matkul = read_csv_table("matkul.csv")
    raw_matkul_kur = read_csv_table("matkul_kurikulum.csv")
    raw_rp_mk = read_csv_table("rp_mk.csv")
    raw_kelas = read_csv_table("kelas_kuliah.csv")
    raw_kuliah_mhs = read_csv_table("kuliah_mhs.csv")
    raw_nilai_smt = read_csv_table("nilai_smt_mhs.csv")
    raw_transkrip = read_csv_table("nilai_transkrip.csv")
    raw_akt_ajar = read_csv_table("akt_ajar_dosen.csv")
    raw_daya_tampung = read_csv_table("daya_tampung.csv")

    print("=== SUMMARY DATA FEEDER PDDIKTI ===")
    print(f"  Satuan Pendidikan (PT) : {len(raw_sp)} record")
    print(f"  Prodi (sms.csv)        : {len(raw_sms)} record")
    print(f"  Kurikulum              : {len(raw_kurikulum)} record")
    print(f"  Bobot Nilai            : {len(raw_bobot)} record")
    print(f"  Dosen (reg_ptk / sdm)  : {len(raw_reg_ptk)} reg_ptk / {len(raw_sdm)} sdm")
    print(f"  Riwayat Pend Dosen     : {len(raw_rwy_pend)} record")
    print(f"  Mahasiswa (reg_pd / pd): {len(raw_reg_pd)} reg_pd / {len(raw_pd)} pd")
    print(f"  Mata Kuliah            : {len(raw_matkul)} record")
    print(f"  MK Kurikulum           : {len(raw_matkul_kur)} record")
    print(f"  RPS Mata Kuliah (rp_mk): {len(raw_rp_mk)} record")
    print(f"  Kelas Kuliah           : {len(raw_kelas)} record")
    print(f"  Aktivitas Ajar Dosen   : {len(raw_akt_ajar)} record")
    print(f"  Aktivitas Kuliah Mhs   : {len(raw_kuliah_mhs)} record")
    print(f"  Nilai Semester         : {len(raw_nilai_smt)} record")
    print(f"  Nilai Transkrip Akhir  : {len(raw_transkrip)} record")
    print("===================================\n")

    if not execute:
        print("Mode --check (Dry-Run). Tidak ada data yang ditulis ke database PostgreSQL.")
        print("Gunakan '--execute' untuk menjalankan migrasi sesungguhnya.")
        return

    db_url = os.environ.get("DATABASE_URL", "postgresql://nugaslagi:nugaslagi@127.0.0.1:5434/elearning_dosen")
    print(f"Menghubungkan ke PostgreSQL: {db_url}")
    db = PostgresDatabase(db_url)
    await db.connect()

    default_dosen_pass = hash_password("Dosen123!")
    default_mhs_pass = hash_password("Mahasiswa123!")

    # Map lookups
    sdm_map = {row["id_sdm"]: row for row in raw_sdm if row.get("id_sdm")}
    pd_map = {row["id_pd"]: row for row in raw_pd if row.get("id_pd")}
    mk_map = {row["id_mk"]: row for row in raw_matkul if row.get("id_mk")}
    sms_map = {row["id_sms"]: row for row in raw_sms if row.get("id_sms")}

    # Map Riwayat Pendidikan Dosen
    rwy_pend_map = {}
    for rwy in raw_rwy_pend:
        if rwy.get("soft_delete") == "1":
            continue
        id_sdm = rwy.get("id_sdm")
        if not id_sdm:
            continue
        if id_sdm not in rwy_pend_map:
            rwy_pend_map[id_sdm] = []
        
        jenj_code = rwy.get("id_jenj_didik") or "30"
        jenjang_str = JENJANG_DIDIK_MAP.get(jenj_code, "S1")

        try:
            ipk_val = float(rwy.get("ipk") or 0.0)
        except ValueError:
            ipk_val = 0.0

        rwy_pend_map[id_sdm].append({
            "id_rwy": rwy.get("id_rwy_didik_formal"),
            "nama_pt": (rwy.get("nm_sp_formal") or "").strip(),
            "fakultas_prodi": rwy.get("fak") or "",
            "jenjang_id": jenj_code,
            "jenjang": jenjang_str,
            "tahun_masuk": rwy.get("thn_masuk") or "",
            "tahun_lulus": rwy.get("thn_lulus") or "",
            "nim_nipd": rwy.get("nipd") or "",
            "ipk": ipk_val,
            "no_ijazah": rwy.get("no_ijazah") or "",
            "tgl_lulus": rwy.get("tgl_lulus") or "",
            "judul_tesis_disertasi": rwy.get("judul_tesis") or "",
        })

    # Map RPS Mata Kuliah (rp_mk.csv)
    rp_mk_map = {}
    for rp in raw_rp_mk:
        if rp.get("soft_delete") == "1":
            continue
        id_mk = rp.get("id_mk")
        if not id_mk:
            continue
        if id_mk not in rp_mk_map:
            rp_mk_map[id_mk] = []

        try:
            pert_ke = int(rp.get("pertemuan_ke") or 1)
        except ValueError:
            pert_ke = 1

        rp_mk_map[id_mk].append({
            "id_rp_mk": rp.get("id_rp_mk"),
            "pertemuan_ke": pert_ke,
            "materi": (rp.get("materi") or "").strip(),
            "materi_en": (rp.get("materi_en") or "").strip(),
            "created_at": rp.get("tgl_create") or "",
        })

    # Sort RPS items by pertemuan_ke
    for id_mk in rp_mk_map:
        rp_mk_map[id_mk].sort(key=lambda x: x["pertemuan_ke"])

    # Map Ringkasan Transkrip Akhir per Mahasiswa (Point 5)
    transkrip_summary_map = {}
    for tr in raw_transkrip:
        if tr.get("soft_delete") == "1":
            continue
        id_reg_pd = tr.get("id_reg_pd")
        if not id_reg_pd:
            continue
        if id_reg_pd not in transkrip_summary_map:
            transkrip_summary_map[id_reg_pd] = {"total_sks": 0.0, "total_bobot": 0.0, "total_mk": 0}

        try:
            sks_val = float(tr.get("sks_mk") or 0.0)
        except ValueError:
            sks_val = 0.0

        try:
            indeks_val = float(tr.get("nilai_indeks") or 0.0)
        except ValueError:
            indeks_val = 0.0

        if tr.get("nilai_huruf") and tr.get("nilai_huruf").strip() != "E":
            transkrip_summary_map[id_reg_pd]["total_sks"] += sks_val
            transkrip_summary_map[id_reg_pd]["total_bobot"] += (sks_val * indeks_val)
            transkrip_summary_map[id_reg_pd]["total_mk"] += 1

    raw_reg_pd_map = {r.get("id_reg_pd"): r for r in raw_reg_pd if r.get("id_reg_pd")}
    kelas_map = {c.get("id_kls"): c for c in raw_kelas if c.get("id_kls")}
    used_emails = set()
    used_emails_owner = {}
    existing_users = await db.users.find({}, {"_id": 0, "id": 1, "email": 1}).to_list(20000)
    existing_email_to_id = {u.get("email", "").lower(): u.get("id") for u in existing_users if u.get("email")}

    def make_unique_email(raw_email: str, default_prefix: str, user_id: str) -> str:
        base_email = (raw_email or f"{default_prefix}.{user_id.lower()}@polteksci.ac.id").strip().lower()
        if "@" not in base_email:
            base_email = f"{base_email}@polteksci.ac.id"
        parts = base_email.split("@", 1)
        email = base_email
        counter = 1
        while True:
            owner_id = existing_email_to_id.get(email)
            is_same_owner = (owner_id == user_id)
            if (not owner_id or is_same_owner) and (email not in used_emails or used_emails_owner.get(email) == user_id):
                break
            email = f"{parts[0]}+{user_id.lower()}{f'_{counter}' if counter > 1 else ''}@{parts[1]}"
            counter += 1

        used_emails.add(email)
        used_emails_owner[email] = user_id
        existing_email_to_id[email] = user_id
        return email

    # 1. MIGRASI PRODI (PROGRAM STUDI)
    print("\n[1/9] Memigrasikan Program Studi (Prodi)...")
    prodi_count = 0
    prodi_lookup = {}
    for sms in raw_sms:
        id_sms = sms.get("id_sms")
        if not id_sms:
            continue
        kode_prodi = sms.get("kode_prodi") or sms.get("singkatan") or id_sms
        nama_prodi = sms.get("nm_lemb") or sms.get("nm_prodi_english") or "Program Studi"
        jenj_code = sms.get("id_jenj_didik") or "23" # 23 = D4/S1
        jenjang_map = {"22": "D3", "23": "D4", "30": "S1", "35": "S2", "40": "S3"}
        jenjang = jenjang_map.get(jenj_code, "D4")

        prodi_lookup[id_sms] = {
            "id": id_sms,
            "kode": kode_prodi,
            "nama": nama_prodi,
            "jenjang": jenjang
        }

        ex = await db.programs.find_one({"id": id_sms}, {"_id": 0})
        doc = {
            "id": id_sms,
            "code": kode_prodi,
            "kode": kode_prodi,
            "name": nama_prodi,
            "nama": nama_prodi,
            "description": f"Program Studi {nama_prodi} ({jenjang})",
            "status": "active" if sms.get("soft_delete") != "1" else "inactive",
            "jenjang": jenjang,
            "akreditasi": sms.get("stat_prodi") or "A",
            "sk_selenggara": sms.get("sk_selenggara") or "",
            "tgl_sk": sms.get("tgl_sk_selenggara") or "",
            "created_at": sms.get("tgl_create") or now_iso(),
        }
        if not ex:
            await db.programs.insert_one(doc)
            prodi_count += 1
        else:
            await db.programs.update_one({"id": id_sms}, {"$set": doc})

    print(f"  -> {prodi_count} prodi diproses/dimasukkan.")

    # 2. MIGRASI DOSEN & TENAGA PENDIDIK (Point 2 Feeder Sesuai Lengkap)
    print("\n[2/9] Memigrasikan Dosen (reg_ptk, sdm & rwy_pend_formal) + Kepegawaian Lengkap...")
    dosen_count = 0
    dosen_reg_lookup = {}
    dosen_id_lookup = {}
    for rptk in raw_reg_ptk:
        id_reg_ptk = rptk.get("id_reg_ptk")
        id_sdm = rptk.get("id_sdm")
        id_sms = rptk.get("id_sms", "")
        sdm_info = sdm_map.get(id_sdm, {})
        if not sdm_info:
            continue

        nidn = (rptk.get("nidn") or sdm_info.get("nidn") or sdm_info.get("nip") or id_sdm).strip()
        nama = (sdm_info.get("nm_sdm") or "Dosen").strip()
        email = make_unique_email(sdm_info.get("email"), "dosen", id_sdm)
        wa = (sdm_info.get("no_hp") or sdm_info.get("no_tel_rmh") or "").strip()
        prodi_obj = prodi_lookup.get(id_sms, {})
        gender = (sdm_info.get("jk") or "").upper()
        
        user_id = id_sdm

        dosen_reg_lookup[id_reg_ptk] = {"id": user_id, "name": nama, "nidn": nidn, "email": email}
        dosen_id_lookup[user_id] = {"id": user_id, "name": nama, "nidn": nidn, "email": email}

        # Resolution for Feeder Point 2 Reference Mappings
        ikatan_kerja_id = (rptk.get("id_ikatan_kerja") or "A").strip()
        ikatan_kerja_str = IKATAN_KERJA_MAP.get(ikatan_kerja_id, "Dosen Tetap")

        stat_pegawai_id = (rptk.get("id_stat_pegawai") or sdm_info.get("id_jns_sdm") or "16").strip()
        stat_pegawai_str = STAT_PEGAWAI_MAP.get(stat_pegawai_id, "GTY / Tetap Yayasan")

        pangkat_gol_id = (sdm_info.get("id_pangkat_gol") or "").strip()
        pangkat_gol_str = PANGKAT_GOL_MAP.get(pangkat_gol_id, "")

        stat_aktif_id = (sdm_info.get("id_stat_aktif") or "1").strip()
        stat_aktif_str = STAT_AKAKTIF_MAP.get(stat_aktif_id, "Aktif")

        agama_id = (sdm_info.get("id_agama") or "1").strip()
        agama_str = AGAMA_MAP.get(agama_id, "Islam")

        # Riwayat Pendidikan list for this SDM
        rwy_pend_list = rwy_pend_map.get(id_sdm, [])

        ex = await db.users.find_one({"$or": [{"id": user_id}, {"username": nidn.lower()}, {"nidn": nidn}]}, {"_id": 0})
        doc = {
            "id": ex.get("id") if ex else user_id,
            "role": "lecturer",
            "username": nidn.lower(),
            "employee_id": nidn,
            "nidn": nidn,
            "nip": sdm_info.get("nip") or "",
            "nik": sdm_info.get("nik") or "",
            "nuptk": sdm_info.get("nuptk") or "",
            "name": nama,
            "email": email,
            "whatsapp": wa,
            "gender": gender,
            "agama": agama_str,
            "agama_id": agama_id,
            "kewarganegaraan": sdm_info.get("kewarganegaraan") or "ID",
            "tempat_lahir": sdm_info.get("tmpt_lahir") or "",
            "tanggal_lahir": sdm_info.get("tgl_lahir") or "",
            "npwp": sdm_info.get("npwp") or "",

            # Detail Alamat Dosen
            "alamat": sdm_info.get("jln") or "",
            "rt": sdm_info.get("rt") or "",
            "rw": sdm_info.get("rw") or "",
            "kelurahan": sdm_info.get("ds_kel") or "",
            "kota": sdm_info.get("ds_kel") or "",
            "kode_pos": sdm_info.get("kode_pos") or "",
            "kode_wilayah": (sdm_info.get("id_wil") or "").strip(),

            # Point 2: Detail Kepegawaian & Ikatan Kerja Feeder
            "kepegawaian": {
                "no_surat_tugas": rptk.get("no_srt_tgs") or "",
                "tgl_surat_tugas": rptk.get("tgl_srt_tgs") or "",
                "tmt_surat_tugas": rptk.get("tmt_srt_tgs") or "",
                "status_pegawai_id": stat_pegawai_id,
                "status_pegawai": stat_pegawai_str,
                "ikatan_kerja_id": ikatan_kerja_id,
                "ikatan_kerja": ikatan_kerja_str,
                "pangkat_golongan_id": pangkat_gol_id,
                "pangkat_golongan": pangkat_gol_str,
                "sk_pengangkatan": sdm_info.get("sk_angkat") or "",
                "tmt_sk_pengangkatan": sdm_info.get("tmt_sk_angkat") or "",
                "sk_cpns": sdm_info.get("sk_cpns") or "",
                "tgl_sk_cpns": sdm_info.get("tgl_sk_cpns") or "",
                "status_aktif_id": stat_aktif_id,
                "status_aktif": stat_aktif_str,
                "homebase_induk": rptk.get("a_homebase_induk") == "1",
            },

            # Flat helper attributes
            "ikatan_kerja": ikatan_kerja_str,
            "status_pegawai": stat_pegawai_str,
            "pangkat_golongan": pangkat_gol_str,

            # Point 2: Array Riwayat Pendidikan Formal (59 records in dump)
            "riwayat_pendidikan": rwy_pend_list,

            "prodi_id": id_sms,
            "homebase": id_sms,
            "prodi_name": prodi_obj.get("nama", ""),
            "password_hash": default_dosen_pass,
            "status": "active" if sdm_info.get("soft_delete") != "1" else "inactive",
            "created_at": sdm_info.get("tgl_create") or now_iso(),
            "last_login_at": "",
        }
        if not ex:
            await db.users.insert_one(doc)
            dosen_count += 1
        else:
            if ex.get("email"):
                doc["email"] = ex["email"]
            if ex.get("username"):
                doc["username"] = ex["username"]
            await db.users.update_one({"id": doc["id"]}, {"$set": doc})

    print(f"  -> {dosen_count} dosen diproses/dimasukkan (beserta detail kepegawaian & riwayat pendidikan).")

    # 3. MIGRASI MAHASISWA (Point 1 & Point 5 Sesuai Lengkap)
    print("\n[3/9] Memigrasikan Mahasiswa (reg_pd & peserta_didik) + Detail Transkrip & Yudisium...")
    mhs_count = 0
    mhs_reg_lookup = {}
    for rpd in raw_reg_pd:
        id_reg_pd = rpd.get("id_reg_pd")
        id_pd = rpd.get("id_pd")
        id_sms = rpd.get("id_sms", "")
        nim = (rpd.get("nipd") or id_reg_pd).strip().upper()
        pd_info = pd_map.get(id_pd, {})
        if not pd_info:
            continue

        nama = (pd_info.get("nm_pd") or "Mahasiswa").strip()
        email = make_unique_email(pd_info.get("email"), "mhs", id_reg_pd)
        wa = (pd_info.get("no_hp") or pd_info.get("no_tel_rmh") or "").strip()
        prodi_obj = prodi_lookup.get(id_sms, {})
        
        smt_mulai = rpd.get("mulai_smt") or "20251"
        angkatan = smt_mulai[:4] if len(smt_mulai) >= 4 else "2025"

        mhs_reg_lookup[id_reg_pd] = {"id": id_reg_pd, "nim": nim, "name": nama, "email": email, "id_pd": id_pd}

        # Resolution for Feeder Point 1 Reference Mappings
        jns_daftar_id = (rpd.get("id_jns_daftar") or "1").strip()
        jns_daftar_str = JENIS_DAFTAR_MAP.get(jns_daftar_id, "Peserta Didik Baru")

        jalur_masuk_id = (rpd.get("id_jalur_masuk") or "12").strip()
        jalur_masuk_str = JALUR_MASUK_MAP.get(jalur_masuk_id, "Mandiri")

        pembiayaan_id = (rpd.get("id_pembiayaan") or "1").strip()
        pembiayaan_str = PEMBIAYAAN_MAP.get(pembiayaan_id, "Mandiri")

        jns_keluar_id = (rpd.get("id_jns_keluar") or "").strip()
        jns_keluar_str = JENIS_KELUAR_MAP.get(jns_keluar_id, "")

        agama_id = (pd_info.get("id_agama") or "1").strip()
        agama_str = AGAMA_MAP.get(agama_id, "Islam")

        try:
            biaya_masuk = float(rpd.get("biaya_masuk_kuliah") or 0.0)
        except ValueError:
            biaya_masuk = 0.0

        try:
            sks_diakui = float(rpd.get("sks_diakui") or 0.0)
        except ValueError:
            sks_diakui = 0.0

        # Point 5: Transkrip Kumulatif & IPK Transkrip Summary
        tr_sum = transkrip_summary_map.get(id_reg_pd, {"total_sks": 0.0, "total_bobot": 0.0, "total_mk": 0})
        total_sks_tr = tr_sum["total_sks"]
        ipk_transkrip = round(tr_sum["total_bobot"] / total_sks_tr, 2) if total_sks_tr > 0 else 0.0

        ex = await db.users.find_one({"$or": [{"id": id_reg_pd}, {"username": nim.lower()}, {"nim": nim}]}, {"_id": 0})
        doc = {
            "id": ex.get("id") if ex else id_reg_pd,
            "role": "student",
            "username": nim.lower(),
            "nim": nim,
            "nik": pd_info.get("nik") or "",
            "nisn": pd_info.get("nisn") or "",
            "npwp": pd_info.get("npwp") or "",
            "name": nama,
            "email": email,
            "whatsapp": wa,
            "gender": (pd_info.get("jk") or "").upper(),
            "agama": agama_str,
            "agama_id": agama_id,
            "kewarganegaraan": pd_info.get("kewarganegaraan") or "ID",
            "tempat_lahir": pd_info.get("tmpt_lahir") or "",
            "tanggal_lahir": pd_info.get("tgl_lahir") or "",

            # Detail Alamat & Lokasi Feeder
            "alamat": pd_info.get("jln") or "",
            "rt": pd_info.get("rt") or "",
            "rw": pd_info.get("rw") or "",
            "kelurahan": pd_info.get("ds_kel") or "",
            "kota": pd_info.get("ds_kel") or "",
            "kode_pos": pd_info.get("kode_pos") or "",
            "kode_wilayah": (pd_info.get("id_wil") or "").strip(),

            # Point 1: Detail Pendaftaran & Status Feeder
            "tanggal_masuk": rpd.get("tgl_masuk_sp") or "",
            "semester_masuk": smt_mulai,
            "jenis_pendaftaran_id": jns_daftar_id,
            "jenis_pendaftaran": jns_daftar_str,
            "jalur_masuk_id": jalur_masuk_id,
            "jalur_masuk": jalur_masuk_str,
            "jenis_pembiayaan_id": pembiayaan_id,
            "jenis_pembiayaan": pembiayaan_str,
            "biaya_masuk_kuliah": biaya_masuk,

            # Point 1: Mahasiswa Pindahan / Transfer Data
            "sks_diakui": sks_diakui,
            "pt_asal": rpd.get("nm_pt_asal") or "",
            "prodi_asal": rpd.get("nm_prodi_asal") or "",

            # Point 1: Detail Orang Tua & Wali Lengkap
            "orang_tua": {
                "ayah": {
                    "nama": pd_info.get("nm_ayah") or "",
                    "nik": pd_info.get("nik_ayah") or "",
                    "tgl_lahir": pd_info.get("tgl_lahir_ayah") or "",
                    "pendidikan_id": pd_info.get("id_jenjang_pendidikan_ayah") or "",
                    "pekerjaan_id": pd_info.get("id_pekerjaan_ayah") or "",
                    "penghasilan_id": pd_info.get("id_penghasilan_ayah") or "",
                },
                "ibu": {
                    "nama": pd_info.get("nm_ibu_kandung") or "",
                    "nik": pd_info.get("nik_ibu") or "",
                    "tgl_lahir": pd_info.get("tgl_lahir_ibu") or "",
                    "pendidikan_id": pd_info.get("id_jenjang_pendidikan_ibu") or "",
                    "pekerjaan_id": pd_info.get("id_pekerjaan_ibu") or "",
                    "penghasilan_id": pd_info.get("id_penghasilan_ibu") or "",
                },
                "wali": {
                    "nama": pd_info.get("nm_wali") or "",
                    "tgl_lahir": pd_info.get("tgl_lahir_wali") or "",
                    "pendidikan_id": pd_info.get("id_jenjang_pendidikan_wali") or "",
                    "pekerjaan_id": pd_info.get("id_pekerjaan_wali") or "",
                    "penghasilan_id": pd_info.get("id_penghasilan_wali") or "",
                }
            },
            "nama_ayah": pd_info.get("nm_ayah") or "",
            "nama_ibu": pd_info.get("nm_ibu_kandung") or "",

            # Point 1 & Point 5: Data Kelulusan, Yudisium & Transkrip Ringkasan
            "kelulusan": {
                "status_lulus": jns_keluar_id == "1",
                "jenis_keluar_id": jns_keluar_id,
                "jenis_keluar": jns_keluar_str,
                "tanggal_keluar": rpd.get("tgl_keluar") or "",
                "sk_yudisium": rpd.get("sk_yudisium") or "",
                "tgl_sk_yudisium": rpd.get("tgl_sk_yudisium") or "",
                "no_seri_ijazah": rpd.get("no_seri_ijazah") or "",
                "tgl_terbit_ijazah": rpd.get("tgl_terbit_ijazah") or "",
                "judul_skripsi": rpd.get("judul_skripsi") or "",
                "total_sks_transkrip": total_sks_tr,
                "ipk_transkrip": ipk_transkrip,
                "total_mk_lulus": tr_sum["total_mk"],
            },

            "password_hash": default_mhs_pass,
            "status": "active" if rpd.get("soft_delete") != "1" else "inactive",
            "class_ids": [],
            "prodi_id": id_sms,
            "prodi_name": prodi_obj.get("nama", ""),
            "prodi_kode": prodi_obj.get("kode", ""),
            "angkatan": angkatan,
            "created_at": rpd.get("tgl_create") or now_iso(),
            "last_login_at": "",
        }
        if not ex:
            await db.users.insert_one(doc)
            mhs_count += 1
        else:
            if ex.get("email"):
                doc["email"] = ex["email"]
            if ex.get("username"):
                doc["username"] = ex["username"]
            await db.users.update_one({"id": doc["id"]}, {"$set": doc})

    print(f"  -> {mhs_count} mahasiswa diproses/dimasukkan (beserta detail kelulusan & ringkasan transkrip).")

    # 4. MIGRASI KURIKULUM
    print("\n[4/9] Memigrasikan Master Kurikulum...")
    kur_count = 0
    kur_lookup = {}
    for kur in raw_kurikulum:
        id_kur = kur.get("id_kurikulum_sp")
        if not id_kur:
            continue
        nama_kur = kur.get("nm_kurikulum_sp") or "Kurikulum Default"
        id_sms = kur.get("id_sms", "")
        prodi_obj = prodi_lookup.get(id_sms, {})
        smt_mulai = kur.get("id_smt") or "20231"
        tahun_mulai = smt_mulai[:4] if len(smt_mulai) >= 4 else "2023"

        kur_lookup[id_kur] = {"id": id_kur, "nama": nama_kur, "prodi_id": id_sms}

        ex = await db.kurikulum.find_one({"id": id_kur}, {"_id": 0})
        doc = {
            "id": id_kur,
            "kode": f"KUR-{tahun_mulai}",
            "nama": nama_kur,
            "prodi_id": id_sms,
            "prodi_nama": prodi_obj.get("nama", ""),
            "tahun_mulai": tahun_mulai,
            "status": "active" if kur.get("soft_delete") != "1" else "inactive",
            "total_sks_wajib": float(kur.get("jml_sks_wajib") or 0),
            "total_sks_pilihan": float(kur.get("jml_sks_pilihan") or 0),
            "created_at": kur.get("tgl_create") or now_iso(),
        }
        if not ex:
            await db.kurikulum.insert_one(doc)
            kur_count += 1
        else:
            await db.kurikulum.update_one({"id": id_kur}, {"$set": doc})

    print(f"  -> {kur_count} kurikulum diproses/dimasukkan.")

    # 5. MIGRASI MATA KULIAH (COURSES) (Point 3 Feeder Sesuai Lengkap + RPS)
    print("\n[5/9] Memigrasikan Mata Kuliah (Courses & rp_mk) + Silabus/RPS Lengkap...")
    mk_count = 0
    # Map matkul_kurikulum for semester paket & kurikulum ID
    mk_kur_map = {}
    for mkur in raw_matkul_kur:
        id_mk = mkur.get("id_mk")
        if id_mk:
            mk_kur_map[id_mk] = mkur

    for mk in raw_matkul:
        id_mk = mk.get("id_mk")
        if not id_mk:
            continue
        kode_mk = (mk.get("kode_mk") or id_mk).strip()
        nama_mk = (mk.get("nm_mk") or "Mata Kuliah").strip()
        id_sms = mk.get("id_sms", "")
        prodi_obj = prodi_lookup.get(id_sms, {})

        mkur_info = mk_kur_map.get(id_mk, {})
        id_kur = mkur_info.get("id_kurikulum_sp", "")
        kur_obj = kur_lookup.get(id_kur, {})

        try:
            sks = float(mk.get("sks_mk") or 3.0)
        except ValueError:
            sks = 3.0
        try:
            sks_tm = float(mk.get("sks_tm") or sks)
        except ValueError:
            sks_tm = sks
        try:
            sks_pr = float(mk.get("sks_prak") or 0.0)
        except ValueError:
            sks_pr = 0.0
        try:
            sks_prak_lap = float(mk.get("sks_prak_lap") or 0.0)
        except ValueError:
            sks_prak_lap = 0.0
        try:
            sks_sim = float(mk.get("sks_sim") or 0.0)
        except ValueError:
            sks_sim = 0.0

        try:
            sem_paket = int(mkur_info.get("smt") or 1)
        except ValueError:
            sem_paket = 1

        # Resolution for Feeder Point 3 Reference Mappings
        jns_mk_id = (mk.get("jns_mk") or "A").strip()
        jns_mk_str = JENIS_MK_MAP.get(jns_mk_id, "Wajib Program Studi")

        kel_mk_id = (mk.get("kel_mk") or "B").strip()
        kel_mk_str = KELOMPOK_MK_MAP.get(kel_mk_id, "MKK (Mata Kuliah Keahlian & Keterampilan)")

        # Rencana Pembelajaran / RPS List for this Course
        rps_list = rp_mk_map.get(id_mk, [])

        ex = await db.courses.find_one({"id": id_mk}, {"_id": 0})
        doc = {
            "id": id_mk,
            "kurikulum_id": id_kur,
            "kurikulum_kode": kur_obj.get("kode", ""),
            "program_id": id_sms,
            "prodi_id": id_sms,
            "program_name": prodi_obj.get("nama", ""),
            "code": kode_mk,
            "kode": kode_mk,
            "name": nama_mk,
            "nama": nama_mk,
            "credits": sks,
            "sks": sks,
            "total_sks": sks,

            # Point 3: Breakdown Detail SKS Feeder
            "sks_teori": sks_tm,
            "sks_praktikum": sks_pr,
            "sks_prak_lapangan": sks_prak_lap,
            "sks_simulasi": sks_sim,

            # Point 3: Kategori & Kelompok Mata Kuliah Feeder
            "jenis_mk_id": jns_mk_id,
            "jenis_mk": jns_mk_str,
            "kelompok_mk_id": kel_mk_id,
            "kelompok_mk": kel_mk_str,
            "semester_paket": sem_paket,
            "sifat": "Wajib" if mkur_info.get("a_wajib") != "0" else "Pilihan",

            # Point 3: Indicator Kelengkapan Bahan Ajar Feeder
            "kelengkapan_ajar": {
                "ada_sap": mk.get("a_sap") == "1",
                "ada_silabus": mk.get("a_silabus") == "1",
                "ada_bahan_ajar": mk.get("a_bahan_ajar") == "1",
                "ada_acara_praktikum": mk.get("acara_prak") == "1",
                "ada_diktat": mk.get("a_diktat") == "1",
                "metode_pelaksanaan": mk.get("metode_pelaksanaan_kuliah") or "Offline",
            },

            # Point 3: Rencana Pembelajaran Semester (RPS / rp_mk.csv)
            "rps_rencana_pembelajaran": rps_list,

            "description": f"Mata Kuliah {nama_mk} ({kode_mk})",
            "status": "active" if mk.get("soft_delete") != "1" else "inactive",
            "created_at": mk.get("tgl_create") or now_iso(),
        }
        if not ex:
            await db.courses.insert_one(doc)
            mk_count += 1
        else:
            await db.courses.update_one({"id": id_mk}, {"$set": doc})

    print(f"  -> {mk_count} mata kuliah diproses/dimasukkan (beserta breakdown SKS, kelompok MK & RPS).")

    # 6. MIGRASI PERIODE / TAHUN AKADEMIK & KELAS KULIAH (Point 4 Feeder Sesuai Lengkap + Team Teaching)
    print("\n[6/9] Memigrasikan Periode & Kelas Kuliah (Classes & akt_ajar_dosen) + Team Teaching...")
    periode_set = set()
    for kls in raw_kelas:
        if kls.get("id_smt"):
            periode_set.add(kls.get("id_smt"))
    for km in raw_kuliah_mhs:
        if km.get("id_smt"):
            periode_set.add(km.get("id_smt"))

    periode_count = 0
    for smt_code in sorted(periode_set):
        p_info = parse_semester_code(smt_code)
        ex = await db.academic_years.find_one({"code": smt_code}, {"_id": 0})
        doc = {
            "id": smt_code,
            "code": smt_code,
            "name": p_info["name"],
            "year": p_info["year"],
            "semester": p_info["semester"],
            "is_active": smt_code == "20252",
        }
        if not ex:
            await db.academic_years.insert_one(doc)
            periode_count += 1
        else:
            await db.academic_years.update_one({"code": smt_code}, {"$set": doc})

    print(f"  -> {periode_count} periode akademik diproses/dimasukkan.")

    # Map dosen pengajar (Multi-Dosen / Team Teaching) per kelas dari akt_ajar_dosen.csv (396 record)
    kelas_dosen_team_map = {}
    for ajar in raw_akt_ajar:
        if ajar.get("soft_delete") == "1":
            continue
        id_kls = ajar.get("id_kls")
        id_reg_ptk = ajar.get("id_reg_ptk")
        if not id_kls or not id_reg_ptk:
            continue
        
        dosen_info = dosen_reg_lookup.get(id_reg_ptk)
        if not dosen_info:
            continue

        if id_kls not in kelas_dosen_team_map:
            kelas_dosen_team_map[id_kls] = []

        try:
            sks_subst = float(ajar.get("sks_subst_tot") or 0.0)
        except ValueError:
            sks_subst = 0.0

        try:
            tm_renc = int(ajar.get("jml_tm_renc") or 16)
        except ValueError:
            tm_renc = 16

        try:
            tm_real = int(ajar.get("jml_tm_real") or 0)
        except ValueError:
            tm_real = 0

        jns_eval_id = (ajar.get("id_jns_eval") or "1").strip()
        jns_eval_str = JENIS_EVALUASI_MAP.get(jns_eval_id, "Evaluasi Akademik (Penilaian Utama)")

        kelas_dosen_team_map[id_kls].append({
            "id_ajar": ajar.get("id_ajar"),
            "id_reg_ptk": id_reg_ptk,
            "dosen_id": dosen_info["id"],
            "dosen_name": dosen_info["name"],
            "nidn": dosen_info["nidn"],
            "email": dosen_info["email"],
            "sks_diampu": sks_subst,
            "rencana_tatap_muka": tm_renc,
            "realisasi_tatap_muka": tm_real,
            "jenis_evaluasi_id": jns_eval_id,
            "jenis_evaluasi": jns_eval_str,
        })

    kelas_count = 0
    for kls in raw_kelas:
        id_kls = kls.get("id_kls")
        if not id_kls:
            continue
        id_mk = kls.get("id_mk", "")
        mk_info = mk_map.get(id_mk, {})
        smt_code = kls.get("id_smt", "")
        nama_kls = kls.get("nm_kls") or "A"

        # Point 4: Team Teaching / Multi-Dosen Pengajar Array
        dosen_team = kelas_dosen_team_map.get(id_kls, [])
        dosen_utama = dosen_team[0] if dosen_team else {}

        # Point 4: Resolution for Mode Kuliah & Lingkup Kelas Mappings
        mode_kuliah_id = (kls.get("mode_kuliah") or "F").strip()
        mode_kuliah_str = MODE_KULIAH_MAP.get(mode_kuliah_id, "Tatap Muka (Luring / Offline)")

        lingkup_kelas_id = (kls.get("lingkup_kelas") or "1").strip()
        lingkup_kelas_str = LINGKUP_KELAS_MAP.get(lingkup_kelas_id, "Internal Kampus")

        try:
            kuota = int(float(kls.get("kuota_pditt") or 30))
        except ValueError:
            kuota = 30

        try:
            sks_kls = float(kls.get("sks_mk") or mk_info.get("sks_mk") or 3.0)
        except ValueError:
            sks_kls = 3.0

        ex = await db.classes.find_one({"id": id_kls}, {"_id": 0})
        doc = {
            "id": id_kls,
            "code": f"{mk_info.get('kode_mk', '')}-{nama_kls}",
            "name": f"{mk_info.get('nm_mk', '')} - Kelas {nama_kls}",
            "course_id": id_mk,
            "course_code": mk_info.get("kode_mk", ""),
            "course_name": mk_info.get("nm_mk", ""),

            # Backward compatibility lecturer fields
            "lecturer_id": dosen_utama.get("dosen_id", ""),
            "lecturer_name": dosen_utama.get("dosen_name", ""),

            # Point 4: Team Teaching / Multi-Dosen Pengajar Array (396 record penugasan)
            "dosen_pengajar": dosen_team,
            "is_team_teaching": len(dosen_team) > 1,

            "period_code": smt_code,
            "sks": sks_kls,
            "capacity": kuota,

            # Point 4: Detail Mode & Lingkup Kelas Feeder
            "mode_kuliah_id": mode_kuliah_id,
            "mode_kuliah": mode_kuliah_str,
            "lingkup_kelas_id": lingkup_kelas_id,
            "lingkup_kelas": lingkup_kelas_str,
            "bahasan_case": kls.get("bahasan_case") or "",
            "tgl_mulai_efektif": kls.get("tgl_mulai_koas") or "",
            "tgl_selesai_efektif": kls.get("tgl_selesai_koas") or "",

            # Target & Realisasi Pertemuan dari Team Teaching
            "target_pertemuan": dosen_utama.get("rencana_tatap_muka", 16),
            "realisasi_pertemuan": dosen_utama.get("realisasi_tatap_muka", 0),

            "prodi_id": kls.get("id_sms", ""),
            "created_at": kls.get("tgl_create") or now_iso(),
        }
        if not ex:
            await db.classes.insert_one(doc)
            kelas_count += 1
        else:
            await db.classes.update_one({"id": id_kls}, {"$set": doc})

    print(f"  -> {kelas_count} kelas kuliah diproses/dimasukkan (beserta penugasan Team Teaching & mode kuliah).")

    # 7. MIGRASI KHS & NILAI MAHASISWA
    print("\n[7/9] Memigrasikan Nilai Semester (KHS / nilai_smt_mhs)...")
    nilai_count = 0
    # Create lookup map of classes to course details
    kelas_lookup = {kls.get("id_kls"): kls for kls in raw_kelas if kls.get("id_kls")}

    for nil in raw_nilai_smt:
        if nil.get("soft_delete") == "1":
            continue
        id_kls = nil.get("id_kls")
        id_reg_pd = nil.get("id_reg_pd")
        if not id_kls or not id_reg_pd:
            continue

        kls_info = kelas_lookup.get(id_kls, {})
        id_mk = kls_info.get("id_mk", "")
        mk_info = mk_map.get(id_mk, {})
        mhs_info = mhs_reg_lookup.get(id_reg_pd, {})
        smt_code = kls_info.get("id_smt", "")

        nilai_huruf = nil.get("nilai_huruf") or ""
        try:
            nilai_angka = float(nil.get("nilai_angka")) if nil.get("nilai_angka") else None
        except ValueError:
            nilai_angka = None

        try:
            nilai_indeks = float(nil.get("nilai_indeks")) if nil.get("nilai_indeks") else None
        except ValueError:
            nilai_indeks = None

        if not nilai_huruf and nilai_angka is None:
            continue

        khs_id = f"{id_kls}_{id_reg_pd}"
        ex = await db.khs.find_one({"id": khs_id}, {"_id": 0})
        doc = {
            "id": khs_id,
            "class_id": id_kls,
            "student_id": id_reg_pd,
            "nim": mhs_info.get("nim", ""),
            "student_name": mhs_info.get("name", ""),
            "period_code": smt_code,
            "course_id": id_mk,
            "course_code": mk_info.get("kode_mk", ""),
            "course_name": mk_info.get("nm_mk", ""),
            "grade_letter": nilai_huruf,
            "grade_point": nilai_indeks,
            "score": nilai_angka,
            "created_at": nil.get("tgl_create") or now_iso(),
        }
        if not ex:
            await db.khs.insert_one(doc)
            nilai_count += 1
        else:
            await db.khs.update_one({"id": khs_id}, {"$set": doc})

    print(f"  -> {nilai_count} nilai semester diproses/dimasukkan.")

    # 8. MIGRASI AKTIVITAS KULIAH / KRS MAHASISWA
    print("\n[8/9] Memigrasikan Ringkasan Aktivitas Kuliah Mahasiswa (kuliah_mhs)...")
    akt_count = 0
    for km in raw_kuliah_mhs:
        if km.get("soft_delete") == "1":
            continue
        id_reg_pd = km.get("id_reg_pd")
        smt_code = km.get("id_smt")
        if not id_reg_pd or not smt_code:
            continue

        mhs_info = mhs_reg_lookup.get(id_reg_pd, {})
        try:
            ips = float(km.get("ips") or 0.0)
            ipk = float(km.get("ipk") or 0.0)
            sks_smt = float(km.get("sks_smt") or 0.0)
            sks_total = float(km.get("sks_total") or 0.0)
        except ValueError:
            ips, ipk, sks_smt, sks_total = 0.0, 0.0, 0.0, 0.0

        akt_id = f"AKTMHS_{smt_code}_{id_reg_pd}"
        ex = await db.aktivitas_mahasiswa.find_one({"id": akt_id}, {"_id": 0})
        doc = {
            "id": akt_id,
            "student_id": id_reg_pd,
            "nim": mhs_info.get("nim", ""),
            "student_name": mhs_info.get("name", ""),
            "period_code": smt_code,
            "status_mhs": km.get("id_stat_mhs") or "A",
            "ips": ips,
            "ipk": ipk,
            "sks_smt": sks_smt,
            "sks_total": sks_total,
            "created_at": km.get("tgl_create") or now_iso(),
        }
        if not ex:
            await db.aktivitas_mahasiswa.insert_one(doc)
            akt_count += 1
        else:
            await db.aktivitas_mahasiswa.update_one({"id": akt_id}, {"$set": doc})

    print(f"  -> {akt_count} ringkasan aktivitas kuliah mahasiswa diproses/dimasukkan.")

    # 9. MIGRASI TRANSKRIP AKHIR KUMULATIF (Point 5 Feeder: nilai_smt_mhs.csv + nilai_transkrip.csv)
    print("\n[9/9] Memigrasikan Nilai Transkrip Akhir Kumulatif (nilai_smt_mhs.csv & nilai_transkrip.csv)...")
    trans_count = 0

    # 9a. Migrasi Nilai Semester Perkuliahan Reguler dari nilai_smt_mhs.csv
    for g in raw_nilai_smt:
        if g.get("soft_delete") == "1":
            continue
        id_reg_pd = g.get("id_reg_pd")
        id_kls = g.get("id_kls")
        if not id_reg_pd or not id_kls:
            continue

        kls_info = kelas_map.get(id_kls, {})
        id_mk = kls_info.get("id_mk", "")
        smt_id = kls_info.get("id_smt", "20231")
        mk_info = mk_map.get(id_mk, {})
        mhs_info = mhs_reg_lookup.get(id_reg_pd, {})
        rpd_info = raw_reg_pd_map.get(id_reg_pd, {})

        mulai_smt = rpd_info.get("mulai_smt") or smt_id
        try:
            y_start, t_start = int(mulai_smt[:4]), int(mulai_smt[4])
            y_g, t_g = int(smt_id[:4]), int(smt_id[4])
            sem_num = max(1, (y_g - y_start) * 2 + (t_g - t_start) + 1)
        except Exception:
            sem_num = 1
            y_g, t_g = 2023, 1

        term_str = "Ganjil" if smt_id.endswith("1") else "Genap"
        nama_semester = f"{smt_id[:4]}/{int(smt_id[:4])+1} {term_str} (Semester {sem_num})"

        try:
            sks_val = float(mk_info.get("sks_mk") or kls_info.get("sks_mk") or 3.0)
        except ValueError:
            sks_val = 3.0

        try:
            nilai_angka = float(g.get("nilai_angka")) if g.get("nilai_angka") else None
        except ValueError:
            nilai_angka = None

        try:
            nilai_indeks = float(g.get("nilai_indeks")) if g.get("nilai_indeks") else None
        except ValueError:
            nilai_indeks = None

        nilai_huruf = (g.get("nilai_huruf") or "").strip()
        trans_id = f"TRANS_SMT_{id_reg_pd}_{id_kls}"
        ex = await db.transkrip.find_one({"id": trans_id}, {"_id": 0})
        doc = {
            "id": trans_id,
            "student_id": id_reg_pd,
            "nim": mhs_info.get("nim", ""),
            "student_name": mhs_info.get("name", ""),
            "semester_id": smt_id,
            "semester_ke": sem_num,
            "nama_semester": nama_semester,
            "course_id": id_mk,
            "course_code": mk_info.get("kode_mk", ""),
            "course_name": mk_info.get("nm_mk", ""),
            "sks": sks_val,
            "asal_nilai_id": "N",
            "asal_nilai": "Perkuliahan Reguler",
            "grade_letter": nilai_huruf,
            "grade_point": nilai_indeks,
            "score": nilai_angka,
            "created_at": g.get("tgl_create") or now_iso(),
        }
        if not ex:
            await db.transkrip.insert_one(doc)
            trans_count += 1
        else:
            await db.transkrip.update_one({"id": trans_id}, {"$set": doc})

    # 9b. Migrasi Nilai Transkrip Konversi/Alih Jenjang dari nilai_transkrip.csv
    for tr in raw_transkrip:
        if tr.get("soft_delete") == "1":
            continue
        id_reg_pd = tr.get("id_reg_pd")
        id_mk = tr.get("id_mk")
        if not id_reg_pd or not id_mk:
            continue

        mk_info = mk_map.get(id_mk, {})
        mhs_info = mhs_reg_lookup.get(id_reg_pd, {})

        try:
            smt_ke = int(tr.get("smt_ke") or 1)
        except ValueError:
            smt_ke = 1

        try:
            sks_val = float(tr.get("sks_mk") or mk_info.get("sks_mk") or 3.0)
        except ValueError:
            sks_val = 3.0

        try:
            nilai_angka = float(tr.get("nilai_angka")) if tr.get("nilai_angka") else None
        except ValueError:
            nilai_angka = None

        try:
            nilai_indeks = float(tr.get("nilai_indeks")) if tr.get("nilai_indeks") else None
        except ValueError:
            nilai_indeks = None

        nilai_huruf = (tr.get("nilai_huruf") or "").strip()
        asal_nilai_id = (tr.get("asal_nilai") or "K").strip()
        asal_nilai_str = ASAL_NILAI_MAP.get(asal_nilai_id, "Konversi Nilai (Transfer)")

        trans_id = f"TRANS_TR_{id_reg_pd}_{id_mk}"
        ex = await db.transkrip.find_one({"id": trans_id}, {"_id": 0})
        doc = {
            "id": trans_id,
            "student_id": id_reg_pd,
            "nim": mhs_info.get("nim", ""),
            "student_name": mhs_info.get("name", ""),
            "semester_ke": smt_ke,
            "nama_semester": f"Semester {smt_ke} (Konversi/Transfer)",
            "course_id": id_mk,
            "course_code": mk_info.get("kode_mk", ""),
            "course_name": mk_info.get("nm_mk", ""),
            "sks": sks_val,
            "asal_nilai_id": asal_nilai_id,
            "asal_nilai": asal_nilai_str,
            "grade_letter": nilai_huruf,
            "grade_point": nilai_indeks,
            "score": nilai_angka,
            "created_at": tr.get("tgl_create") or now_iso(),
        }
        if not ex:
            await db.transkrip.insert_one(doc)
            trans_count += 1
        else:
            await db.transkrip.update_one({"id": trans_id}, {"$set": doc})

    print(f"  -> {trans_count} nilai transkrip kumulatif diproses/dimasukkan ke tabel transkrip.")

    print("\n=======================================================")
    print("  MIGRASI DATA FEEDER PDDIKTI KE SISTEM BARU SELESAI!")
    print("=======================================================")

if __name__ == "__main__":
    execute_flag = "--execute" in sys.argv
    asyncio.run(run_migration(execute=execute_flag))
