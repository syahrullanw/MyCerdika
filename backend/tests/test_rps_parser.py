from pathlib import Path
import shutil
import subprocess
import tempfile

from backend.rps_parser import parse_rps_docx, parse_rps_pdf, parse_rps_text


RPS_TEXT = """
RENCANA PEMBELAJARAN SEMESTER
Mata Kuliah : Jaringan Komputer
Semester : 2
SKS : 3
Kode Mata Kuliah : JAR-204
Tanggal Penyusunan : 08-02-2024
Dosen Pengampu : Syahrul Anwar, M.Kom.
Program Studi : Rekayasa Komputer dan Jaringan
Capaian Pembelajaran Lulusan
Sikap
Bertakwa kepada Tuhan Yang Maha Esa.
Keterampilan Umum
Mampu berkomunikasi.
Pengetahuan
Memahami jaringan.
Keterampilan Khusus
Mampu mengonfigurasi jaringan.
CPMK
CPMK-1: Mahasiswa mampu memahami konsep jaringan.
Deskripsi Mata Kuliah
Mata kuliah ini membahas jaringan komputer.
Daftar Referensi
1. Buku jaringan komputer.
Tabel Pembelajaran
Minggu ke- Kemampuan yang Diharapkan Materi Pembelajaran Metode Waktu Penilaian
1.
Mahasiswa mampu memahami dasar jaringan.
Pengenalan jaringan komputer.
Presentasi dan diskusi
KPB 3x50
FGD
Pemahaman konsep
Kehadiran
5%
2.
Mahasiswa mampu memahami TCP/IP.
Model TCP/IP
Diskusi
KPB 3x50
FGD
Ketepatan
Kehadiran
5%
"""


def test_parse_rps_text_maps_form_fields_and_meetings():
    result = parse_rps_text(RPS_TEXT)

    assert result["extracted"]["course_code"] == "JAR-204"
    assert result["extracted"]["compiled_at"] == "2024-02-08"
    assert result["extracted"]["cpl_sikap"] == "Bertakwa kepada Tuhan Yang Maha Esa."
    assert result["extracted"]["cpmk"].startswith("CPMK-1")
    assert len(result["meetings"]) == 2
    assert result["meetings"][0]["materials"] == "Pengenalan jaringan komputer."
    assert result["meetings"][0]["penilaian_bobot"] == "5%"


def test_parse_rps_text_reports_missing_meeting_table_and_uses_class_fallbacks():
    result = parse_rps_text("Mata Kuliah : Jaringan Komputer", {"course_code": "JAR-101"})

    assert result["fallback"]["course_code"] == "JAR-101"
    assert result["meetings"] == []
    assert any("16 pertemuan" in warning for warning in result["warnings"])


def test_parse_rps_text_keeps_two_digit_meetings_from_pdf_layout_extraction():
    lines = ["Minggu ke- Kemampuan yang Diharapkan Materi Pembelajaran"]
    for number in range(1, 17):
        marker = f"{str(number)[0]} {str(number)[1]}." if number >= 10 else f"{number}."
        lines.extend(
            [
                marker,
                f"Outcome {number}",
                f"Materi {number}",
                "Diskusi",
                "KPB 3x50",
                "FGD",
                "Indikator",
                "Kriteria",
                "5%",
            ]
        )

    result = parse_rps_text("\n".join(lines))

    assert len(result["meetings"]) == 16
    assert result["meetings"][-1]["meeting_number"] == 16


def test_parse_workspace_rps_docx_reads_all_sixteen_table_rows():
    source = Path(__file__).parents[2] / "RPS JARINGAN.docx"
    if not source.exists():
        return

    result = parse_rps_docx(source.read_bytes())

    assert result["stats"]["meetings_found"] == 16
    assert result["meetings"][-1]["meeting_number"] == 16


def test_pdf_layout_reads_all_sixteen_rows_and_preserves_columns():
    source = Path(__file__).parents[2] / "RPS JARINGAN.docx"
    converter = shutil.which("soffice") or shutil.which("libreoffice")
    if not source.exists() or not converter:
        return

    with tempfile.TemporaryDirectory(prefix="rps-parser-test-") as temp_dir:
        source_copy = Path(temp_dir) / source.name
        source_copy.write_bytes(source.read_bytes())
        subprocess.run(
            [converter, "--headless", "--convert-to", "pdf", "--outdir", temp_dir, str(source_copy)],
            check=True,
            capture_output=True,
        )
        result = parse_rps_pdf((Path(temp_dir) / "RPS JARINGAN.pdf").read_bytes())

    assert result["stats"]["meetings_found"] == 16
    assert result["meetings"][0]["learning_outcome"].startswith("Memahami konsep")
    assert result["meetings"][0]["method"] == "Presentasi dan diskusi"
    assert result["meetings"][-1]["topic"] == "Ujian Akhir Semester"


def test_parse_approved_manajemen_bisnis_rps_template_includes_rtm():
    source = Path(__file__).parents[2] / "RPS Manajemen Bisnis dan Kewirausahaan.pdf"
    if not source.exists():
        return

    result = parse_rps_pdf(source.read_bytes())

    assert result["stats"]["meetings_found"] == 16
    assert result["extracted"]["course_name"] == "Manajemen Bisnis dan Kewirausahaan"
    assert result["extracted"]["course_code"] == "2330109"
    assert result["extracted"]["sks"] == "4 sks 4 jam per minggu"
    assert result["extracted"]["compiled_at"] == "2026-08-15"
    assert result["extracted"]["materials"].startswith("1. Orientasi perkuliahan")
    assert len(result["extracted"]["rtm"]["assessment_items"]) == 9
    assert len(result["extracted"]["rtm"]["schedule"]) == 8
    assert result["meetings"][0]["penilaian_bobot"] == "3%"
    assert result["meetings"][-1]["topic"] == "UAS (Pitching)"
