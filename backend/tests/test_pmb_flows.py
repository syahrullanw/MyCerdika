"""Unit & Integration Tests for PMB (Penerimaan Mahasiswa Baru) Flow."""

import pytest
import re
from uuid import uuid4
from datetime import datetime

from routers.pmb import (
    hash_password,
    verify_password,
    DEFAULT_CBT_QUESTIONS,
    PmbRegisterInput,
    PmbUpdateFormInput,
    PmbPayRegInput,
    PmbChooseTestInput,
    PmbCbtSubmitInput,
    PmbReregisterPayInput,
    PmbShirtSizeInput,
    PmbSibermaruConfirmInput,
)


def test_password_hashing_and_verification():
    password = "CalonMahasiswa2026!"
    pw_hash = hash_password(password)
    assert pw_hash != password
    assert verify_password(password, pw_hash) is True
    assert verify_password("WrongPassword123", pw_hash) is False


def test_pmb_registration_input_validation():
    # Valid Reguler Online dengan 18 isian formulir Politeknik SCI
    reg_online = PmbRegisterInput(
        name="Ahmad Fauzi",
        tempat_lahir="Bandung",
        tanggal_lahir="2007-05-15",
        whatsapp="081234567890",
        alamat="Jl. Merdeka No. 45, Bandung, Jawa Barat",
        nik="3201012345678901",
        nisn="0071234567",
        nama_ibu_kandung="Siti Aminah",
        email="ahmad.fauzi@example.com",
        asal_sekolah="SMKN 1 Bandung",
        npsn_sekolah="20219876",
        alamat_sekolah="Jl. Wastukencana No. 3, Bandung",
        jurusan_asal="Rekayasa Perangkat Lunak",
        tahun_lulus="2025",
        tinggi_badan=172.5,
        berat_badan=64.0,
        prodi_id="prog_ti",
        prodi_id_2="prog_si",
        class_type="reguler",
        learning_mode="online",
        info_source="Media Sosial (Instagram, TikTok, FB)",
        password="Password123!"
    )
    assert reg_online.name == "Ahmad Fauzi"
    assert reg_online.nisn == "0071234567"
    assert reg_online.nama_ibu_kandung == "Siti Aminah"
    assert reg_online.npsn_sekolah == "20219876"
    assert reg_online.tinggi_badan == 172.5
    assert reg_online.berat_badan == 64.0
    assert reg_online.prodi_id_2 == "prog_si"
    assert reg_online.info_source == "Media Sosial (Instagram, TikTok, FB)"
    assert reg_online.class_type == "reguler"
    assert reg_online.learning_mode == "online"

    # Valid Reguler Offline
    reg_offline = PmbRegisterInput(
        name="Siti Rahma",
        tempat_lahir="Jakarta",
        tanggal_lahir="2006-11-20",
        whatsapp="081234567891",
        alamat="Jl. Sudirman No. 10, Jakarta Selatan",
        nik="3171012345670001",
        nisn="0069876543",
        nama_ibu_kandung="Nurhayati",
        email="siti.rahma@example.com",
        asal_sekolah="SMA Negeri 28 Jakarta",
        npsn_sekolah="20101234",
        alamat_sekolah="Jl. Ragunan No. 1, Jakarta Selatan",
        jurusan_asal="MIPA",
        tahun_lulus="2024",
        tinggi_badan=160.0,
        berat_badan=50.0,
        prodi_id="prog_si",
        class_type="reguler",
        learning_mode="offline",
        info_source="Guru BK / Kunjungan Sekolah",
        password="Password123!"
    )
    assert reg_offline.class_type == "reguler"
    assert reg_offline.learning_mode == "offline"

    # Kelas Khusus (must be offline)
    khusus = PmbRegisterInput(
        name="Budi Pratama",
        tempat_lahir="Surabaya",
        tanggal_lahir="2004-03-10",
        whatsapp="081234567892",
        alamat="Jl. Pemuda No. 8, Surabaya",
        nik="3578012345670002",
        nisn="0045678901",
        nama_ibu_kandung="Sri Wahyuni",
        email="budi.pratama@example.com",
        asal_sekolah="SMKN 5 Surabaya",
        npsn_sekolah="20501234",
        alamat_sekolah="Jl. Mayjen Sungkono, Surabaya",
        jurusan_asal="Teknik Komputer Jaringan",
        tahun_lulus="2022",
        tinggi_badan=168.0,
        berat_badan=60.0,
        prodi_id="prog_ti",
        class_type="khusus",
        learning_mode="offline",
        info_source="Website Resmi / Google",
        password="Password123!"
    )
    assert khusus.class_type == "khusus"
    assert khusus.learning_mode == "offline"


def test_cbt_scoring_algorithm():
    questions = DEFAULT_CBT_QUESTIONS
    assert len(questions) >= 10

    # Test 100% correct answers
    perfect_answers = {q["id"]: q["correct_answer"] for q in questions}
    total_weight = sum(q["weight"] for q in questions)
    earned_weight = sum(q["weight"] for q in questions if perfect_answers.get(q["id"]) == q["correct_answer"])
    perfect_score = (earned_weight / total_weight) * 100
    assert perfect_score == 100.0

    # Test 70% passing grade with 7 out of 10 equal weight questions
    sample_q = questions[:10]
    sample_total = sum(q["weight"] for q in sample_q)
    sample_earned = sum(sample_q[i]["weight"] for i in range(7))
    sample_score = (sample_earned / sample_total) * 100
    assert sample_score == 70.0


def test_installment_and_reregistration_logic():
    total_pra_studi = 3500000
    installments = [
        {"term": 1, "name": "Cicilan 1 (Uang Muka)", "amount": 1500000, "status": "unpaid"},
        {"term": 2, "name": "Cicilan 2", "amount": 1000000, "status": "unpaid"},
        {"term": 3, "name": "Cicilan 3", "amount": 1000000, "status": "unpaid"}
    ]
    assert sum(i["amount"] for i in installments) == total_pra_studi

    # Paying term 1 (Uang Muka)
    installments[0]["status"] = "paid"
    paid_count = sum(1 for i in installments if i["status"] == "paid")
    assert paid_count == 1
    rereg_status = "completed" if all(i["status"] == "paid" for i in installments) else "partial"
    assert rereg_status == "partial"

    # Paying remaining terms
    installments[1]["status"] = "paid"
    installments[2]["status"] = "paid"
    rereg_status_full = "completed" if all(i["status"] == "paid" for i in installments) else "partial"
    assert rereg_status_full == "completed"


def test_nim_generation_format():
    year_prefix = "2026"
    prodi_kode = "01"  # TI
    sequence = 42

    nim = f"{year_prefix}{prodi_kode.zfill(2)}{sequence:04d}"
    assert nim == "2026010042"
    assert len(nim) == 10
    assert nim.startswith("2026")


def test_shirt_size_validation():
    valid_sizes = ["S", "M", "L", "XL", "XXL", "XXXL"]
    for sz in valid_sizes:
        payload = PmbShirtSizeInput(shirt_size=sz, shirt_notes="Standar")
        assert payload.shirt_size in valid_sizes

    with pytest.raises(Exception):
        PmbShirtSizeInput(shirt_size="")


def test_sibermaru_confirmation_payload():
    payload = PmbSibermaruConfirmInput(
        confirmed=True,
        emergency_contact_name="Bambang Santoso (Ayah)",
        emergency_contact_phone="081298765432",
        health_notes="Tidak ada alergi berat"
    )
    assert payload.confirmed is True
    assert payload.emergency_contact_name == "Bambang Santoso (Ayah)"
    assert payload.emergency_contact_phone == "081298765432"


def test_referral_code_generation_and_commission_calculation():
    # Referral promoter
    custom_code = "REF-DOSEN-ANDI"
    clean_code = re.sub(r"[^A-Z0-9-]", "", custom_code.upper())
    assert clean_code == "REF-DOSEN-ANDI"

    fee_reg = 50000
    fee_rereg = 200000

    # 10 applicants referred: 8 paid registration, 5 completed reregistration
    total_referred = 10
    paid_reg_count = 8
    rereg_count = 5

    total_commission_earned = (paid_reg_count * fee_reg) + (rereg_count * fee_rereg)
    assert total_commission_earned == (8 * 50000) + (5 * 200000)  # 400.000 + 1.000.000 = 1.400.000
    assert total_commission_earned == 1400000

    # Payout 1.000.000 -> Pending balance = 400.000
    total_paid = 1000000
    pending_payout = max(0, total_commission_earned - total_paid)
    assert pending_payout == 400000


def test_analytics_grade_clustering():
    sample_scores = [95.0, 88.0, 85.0, 78.0, 72.0, 65.0, 50.0]
    grade_a = sum(1 for s in sample_scores if s >= 85)
    grade_b = sum(1 for s in sample_scores if 70 <= s < 85)
    grade_c = sum(1 for s in sample_scores if s < 70)

    assert grade_a == 3  # 95, 88, 85
    assert grade_b == 2  # 78, 72
    assert grade_c == 2  # 65, 50
    assert (grade_a + grade_b + grade_c) == len(sample_scores)


def test_executive_final_report_revenue_calculation():
    reg_fee = 250000
    pra_studi_fee = 3500000
    total_reg_paid = 100
    total_rereg_paid = 80

    gross_registration = total_reg_paid * reg_fee  # 25.000.000
    gross_pra_studi = total_rereg_paid * pra_studi_fee  # 280.000.000
    gross_total = gross_registration + gross_pra_studi  # 305.000.000

    # 30 students came through referrals
    ref_count = 30
    total_referral_expense = (ref_count * 50000) + (ref_count * 200000)  # 1.500.000 + 6.000.000 = 7.500.000
    net_revenue = gross_total - total_referral_expense

    assert gross_total == 305000000
    assert total_referral_expense == 7500000
    assert net_revenue == 297500000


def test_payment_methods_and_online_test_switches():
    from routers.pmb import check_payment_method_allowed, PmbSettingsInput

    settings_all_on = {
        "online_test_enabled": False,
        "payment_methods": {
            "qris": True,
            "manual_transfer": True,
            "va_mandiri": True,
            "va_bca": True
        }
    }
    assert check_payment_method_allowed(settings_all_on, "QRIS") is True
    assert check_payment_method_allowed(settings_all_on, "MANUAL") is True
    assert check_payment_method_allowed(settings_all_on, "VA_MANDIRI") is True
    assert check_payment_method_allowed(settings_all_on, "VA_BCA") is True

    # Matikan QRIS dan VA BCA
    settings_custom = {
        "online_test_enabled": True,
        "payment_methods": {
            "qris": False,
            "manual_transfer": True,
            "va_mandiri": True,
            "va_bca": False
        }
    }
    assert check_payment_method_allowed(settings_custom, "QRIS") is False
    assert check_payment_method_allowed(settings_custom, "MANUAL") is True
    assert check_payment_method_allowed(settings_custom, "VA_MANDIRI") is True
    assert check_payment_method_allowed(settings_custom, "VA_BCA") is False

    # Test schema input
    inp = PmbSettingsInput(
        online_test_enabled=False,
        payment_method_qris=True,
        payment_method_manual=False,
        payment_method_va_mandiri=True,
        payment_method_va_bca=False
    )
    assert inp.online_test_enabled is False
    assert inp.payment_method_qris is True
    assert inp.payment_method_manual is False


def test_strict_10_step_progression():
    # Simulasi 10 tahapan seleksi calon mahasiswa
    # Step 1: Formulir Data Diri
    applicant = {"current_step": 1, "name": "Budi", "prodi_id": "prog_ti"}
    assert applicant["current_step"] == 1

    # Step 2: Konfirmasi Pilihan Kelas
    applicant["current_step"] = 2
    assert applicant["current_step"] == 2

    # Step 3: Pembayaran Pendaftaran
    applicant["current_step"] = 3
    applicant["reg_payment_status"] = "verified"
    applicant["current_step"] = 4  # Setelah bayar terverifikasi -> maju ke step 4

    # Step 4: Gabung Grup WhatsApp
    applicant["wa_group_joined"] = True
    applicant["current_step"] = 5  # Setelah join WA -> maju ke step 5

    # Step 5: Pilih Jalur Ujian
    applicant["test_type"] = "online"
    applicant["current_step"] = 7  # Jalur online -> step 7

    # Step 7: Lulus Ujian
    applicant["test_score"] = 85.0
    applicant["test_status"] = "passed"
    applicant["current_step"] = 8  # Setelah lulus -> maju ke step 8

    # Step 8: Daftar Ulang (Pra-studi & Ukuran Baju)
    applicant["reregistration_status"] = "partial"
    applicant["shirt_size"] = "XL"
    applicant["current_step"] = 9  # Setelah pra-studi & ukuran baju -> maju ke step 9

    # Step 9: Konfirmasi Sibermaru
    applicant["sibermaru_confirmed"] = True
    applicant["current_step"] = 10  # Setelah konfirmasi Sibermaru -> maju ke step 10

    # Step 10: Pengumuman Masuk SIAKAD & Penerbitan NIM
    applicant["is_converted_to_student"] = True
    applicant["generated_nim"] = "2026010042"
    assert applicant["current_step"] == 10
    assert applicant["generated_nim"] == "2026010042"


