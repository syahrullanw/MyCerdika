from academic_progress import build_curriculum_progress, summarize_curriculum_progress


def test_curriculum_progress_uses_sks_and_lecturer_assignment_per_program():
    items = build_curriculum_progress(
        [
            {"id": "prodi-1", "kode": "TI", "nama": "Teknik Informatika", "status": "active"},
            {"id": "prodi-2", "kode": "SI", "nama": "Sistem Informasi", "status": "active"},
        ],
        [
            {
                "id": "kur-1",
                "prodi_id": "prodi-1",
                "kode": "KUR-TI",
                "nama": "Kurikulum TI",
                "status": "active",
                "total_sks_lulus": 144,
                "created_at": "2026-01-01T00:00:00+00:00",
            },
        ],
        [
            {
                "id": "course-1",
                "kurikulum_id": "kur-1",
                "total_sks": 3,
                "dosen_utama_id": "dosen-1",
                "created_at": "2026-01-02T00:00:00+00:00",
            },
            {
                "id": "course-2",
                "kurikulum_id": "kur-1",
                "total_sks": 3,
                "dosen_utama_id": None,
                "dosen_anggota_ids": [],
                "created_at": "2026-01-03T00:00:00+00:00",
            },
        ],
    )

    teknik = next(item for item in items if item["prodi_id"] == "prodi-1")
    sistem = next(item for item in items if item["prodi_id"] == "prodi-2")

    assert teknik["entered_sks"] == 6
    assert teknik["curriculum_progress"] == 4
    assert teknik["assigned_course_count"] == 1
    assert teknik["lecturer_progress"] == 50
    assert teknik["overall_progress"] == 27
    assert teknik["status_label"] == "Dosen pengampu belum lengkap"
    assert sistem["status_label"] == "Belum dimulai"


def test_curriculum_progress_prefers_latest_active_version_and_summarizes():
    items = build_curriculum_progress(
        [{"id": "prodi-1", "kode": "TI", "nama": "Teknik Informatika"}],
        [
            {"id": "draft", "prodi_id": "prodi-1", "status": "draft", "total_sks_lulus": 144},
            {
                "id": "active",
                "prodi_id": "prodi-1",
                "status": "active",
                "total_sks_lulus": 6,
                "updated_at": "2026-01-02T00:00:00+00:00",
            },
        ],
        [
            {
                "id": "course-1",
                "kurikulum_id": "active",
                "sks": 6,
                "dosen_anggota_namas": ["Dosen A"],
            }
        ],
    )

    assert items[0]["kurikulum_id"] == "active"
    assert items[0]["overall_progress"] == 100
    summary = summarize_curriculum_progress(items)
    assert summary["program_count"] == 1
    assert summary["completed_program_count"] == 1
    assert summary["average_progress"] == 100
