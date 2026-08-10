import pytest
from routers.pmb import normalize_wa_number, build_pmb_whatsapp_receipt

def test_normalize_wa_number():
    assert normalize_wa_number("081234567890") == "6281234567890"
    assert normalize_wa_number("+62 812-3456-7890") == "6281234567890"
    assert normalize_wa_number("81234567890") == "6281234567890"
    assert normalize_wa_number("") == ""

def test_build_pmb_whatsapp_receipt():
    applicant = {
        "registration_number": "PMB20260088",
        "name": "Budi Santoso",
        "email": "budi@gmail.com",
        "prodi_name": "Rekayasa Komputer Jaringan",
        "class_type": "reguler",
        "learning_mode": "offline",
        "whatsapp": "081298765432",
        "asal_sekolah": "SMKN 1 Jakarta",
        "reg_payment_fee": 250000,
    }
    receipt = build_pmb_whatsapp_receipt(
        applicant_data=applicant,
        plain_password="RahasiaBudi123!",
        campus_name="Politeknik SCI"
    )

    assert "PMB20260088" in receipt["text"]
    assert "RahasiaBudi123!" in receipt["text"]
    assert "Budi Santoso" in receipt["text"]
    assert "Rekayasa Komputer Jaringan" in receipt["text"]
    assert "https://wa.me/6281298765432" in receipt["url"]
    assert receipt["clean_phone"] == "6281298765432"
