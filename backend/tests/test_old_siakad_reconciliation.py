"""Unit checks for the OLD-SIAP reconciliation helpers."""

from old_siakad_migration import PlannedUpdate
import old_siakad_migration as reconciliation


def test_period_info_for_even_semester():
    assert reconciliation.period_info("20252") == {
        "code": "20252",
        "year": "2025/2026",
        "semester": "Genap",
        "name": "Tahun Akademik 2025/2026 Genap",
    }


def test_three_way_grade_summary_uses_old_class_feeder_identifier():
    tables = {
        "jadwal": [
            {
                "JadwalID": "class-local",
                "JadwalIDDIkti": "class-feeder",
                "TahunID": "20252",
            }
        ],
        "krs": [
            {
                "MhswID": "25001",
                "JadwalID": "class-local",
                "TahunID": "20252",
                "GradeNilai": "A",
                "BobotNilai": 4,
                "NilaiAkhir": 85,
            },
            {
                "MhswID": "25002",
                "JadwalID": "class-local",
                "TahunID": "20252",
                "GradeNilai": "B",
                "BobotNilai": 3,
                "NilaiAkhir": 75,
            },
        ],
    }
    new_krs = [
        {
            "student_id": "25001",
            "academic_period_id": "20252",
            "courses": [
                {
                    "class_id": "class-local",
                    "grade_letter": "A",
                    "grade_point": 4,
                    "final_score": 85,
                }
            ],
        },
        {
            "student_id": "25002",
            "academic_period_id": "20252",
            "courses": [
                {
                    "class_id": "class-local",
                    "grade_letter": "B",
                    "grade_point": 3,
                    "final_score": 75,
                }
            ],
        },
    ]
    feeder_rows = [
        {
            "id_kelas_kuliah": "class-feeder",
            "nim": "25001",
            "nilai_huruf": "A",
            "nilai_indeks": 4,
            "nilai_angka": 85,
        },
        {
            "id_kelas_kuliah": "class-feeder",
            "nim": "25002",
            "nilai_huruf": "A",
            "nilai_indeks": 4,
            "nilai_angka": 85,
        },
    ]

    summary = reconciliation.build_three_way_grade_summary(
        tables, new_krs, feeder_rows, "20252"
    )

    assert summary["all_equal"] == 1
    assert summary["old_new_equal_feeder_diff"] == 1


def test_incremental_update_detects_safe_update_and_conflict():
    operation = PlannedUpdate(
        "users",
        {"id": "student-1"},
        {"name": "Nama Baru", "updated_at": "volatile"},
    )
    baseline_operation = PlannedUpdate(
        "users",
        {"id": "student-1"},
        {"name": "Nama Lama", "updated_at": "old"},
    )
    baseline_entries, _ = reconciliation.classify_incremental_updates(
        [baseline_operation],
        {"users": [{"id": "student-1", "name": "Nama Lama"}]},
        [],
    )
    baseline = {
        "id": baseline_entries[0]["id"],
        "source_hash": baseline_entries[0]["source_hash"],
        "target_hash": baseline_entries[0]["target_hash_after"],
    }

    safe_entries, safe_summary = reconciliation.classify_incremental_updates(
        [operation],
        {"users": [{"id": "student-1", "name": "Nama Lama"}]},
        [baseline],
    )
    conflict_entries, conflict_summary = reconciliation.classify_incremental_updates(
        [operation],
        {"users": [{"id": "student-1", "name": "Diubah Lokal"}]},
        [baseline],
    )

    assert safe_entries[0]["status"] == "ready_update"
    assert safe_summary["ready_update"] == 1
    assert conflict_entries[0]["status"] == "conflict"
    assert conflict_summary["conflict"] == 1


def test_incremental_grade_lists_ignore_export_row_order():
    operation = PlannedUpdate(
        "krs",
        {"id": "krs-1"},
        {"courses": [{"class_id": "2", "score": 80}, {"class_id": "1", "score": 90}]},
    )
    entries, summary = reconciliation.classify_incremental_updates(
        [operation],
        {
            "krs": [
                {
                    "id": "krs-1",
                    "courses": [
                        {"class_id": "1", "score": 90},
                        {"class_id": "2", "score": 80},
                    ],
                }
            ]
        },
        [],
    )

    assert entries[0]["status"] == "unchanged"
    assert summary["unchanged"] == 1


def test_incremental_update_allows_additive_backfill_when_old_fields_match_baseline():
    baseline_operation = PlannedUpdate(
        "courses", {"id": "course-1"}, {"name": "Algoritma"}
    )
    baseline_entries, _ = reconciliation.classify_incremental_updates(
        [baseline_operation],
        {"courses": [{"id": "course-1", "name": "Algoritma"}]},
        [],
    )
    baseline = {
        "id": baseline_entries[0]["id"],
        "source_hash": baseline_entries[0]["source_hash"],
        "target_hash": baseline_entries[0]["target_hash_after"],
    }
    enriched = PlannedUpdate(
        "courses",
        {"id": "course-1"},
        {"name": "Algoritma", "pddikti_course_type_code": "A"},
    )

    safe_entries, _ = reconciliation.classify_incremental_updates(
        [enriched],
        {"courses": [{"id": "course-1", "name": "Algoritma"}]},
        [baseline],
    )
    conflict_entries, _ = reconciliation.classify_incremental_updates(
        [enriched],
        {"courses": [{"id": "course-1", "name": "Algoritma Lokal"}]},
        [baseline],
    )

    assert safe_entries[0]["status"] == "ready_update"
    assert conflict_entries[0]["status"] == "conflict"


def test_feeder_homebase_selects_one_program_and_holds_latest_year_conflict():
    same_program = [
        {"id_prodi": "P2", "id_tahun_ajaran": "2024", "a_sp_homebase": "1"},
        {"id_prodi": "P2", "id_tahun_ajaran": "2025", "a_sp_homebase": "1"},
    ]
    transferred = [
        {"id_prodi": "P1", "id_tahun_ajaran": "2024", "a_sp_homebase": "1"},
        {"id_prodi": "P2", "id_tahun_ajaran": "2025", "a_sp_homebase": "1"},
    ]
    conflict = [
        {"id_prodi": "P1", "id_tahun_ajaran": "2025", "a_sp_homebase": "1"},
        {"id_prodi": "P2", "id_tahun_ajaran": "2025", "a_sp_homebase": "1"},
    ]

    assert reconciliation.select_feeder_homebase(same_program) == (
        "P2",
        "feeder_unique",
    )
    assert reconciliation.select_feeder_homebase(transferred) == (
        "P2",
        "feeder_latest",
    )
    assert reconciliation.select_feeder_homebase(conflict) == ("", "conflict")


def test_authoritative_homebase_can_update_without_baseline_but_not_profile_data():
    homebase_only = PlannedUpdate(
        "users",
        {"id": "D1"},
        {"name": "Dosen", "homebase": "P2", "prodi_id": "P2"},
        authoritative_fields=("homebase", "prodi_id"),
    )
    profile_and_homebase = PlannedUpdate(
        "users",
        {"id": "D1"},
        {"name": "Nama Berbeda", "homebase": "P2", "prodi_id": "P2"},
        authoritative_fields=("homebase", "prodi_id"),
    )
    current = {
        "users": [
            {"id": "D1", "name": "Dosen", "homebase": "P1,P2", "prodi_id": "P1,P2"}
        ]
    }

    safe_entries, _ = reconciliation.classify_incremental_updates(
        [homebase_only], current, []
    )
    guarded_entries, _ = reconciliation.classify_incremental_updates(
        [profile_and_homebase], current, []
    )

    assert safe_entries[0]["status"] == "ready_update"
    assert guarded_entries[0]["status"] == "conflict"


def test_plan_uses_feeder_homebase_and_canonical_lecturer_references():
    tables = {
        "prodi": [
            {"ProdiID": "P1", "Nama": "Program Satu", "IDProdiDiktiID": "FP1"},
            {"ProdiID": "P2", "Nama": "Program Dua", "IDProdiDiktiID": "FP2"},
        ],
        "pegawai": [
            {
                "Login": "D-OLD",
                "Nama": "Dosen Contoh",
                "NIDN": "001",
                "ProdiID": "P1,P2",
                "Homebase": "P1",
            },
            {
                "Login": "D-CANON",
                "Nama": "Dosen Contoh",
                "NIDN": "001",
                "ProdiID": "P1,P2",
                "Homebase": "P1",
            },
        ],
        "mhsw": [
            {
                "MhswID": "S1",
                "Nama": "Mahasiswa",
                "ProdiID": "P1",
                "PenasehatAkademik": "D-OLD",
            }
        ],
        "jadwal": [
            {
                "JadwalID": "J1",
                "TahunID": "20261",
                "DosenID": "D-OLD",
                "MKID": "MK1",
                "ProdiID": "P1",
            }
        ],
    }
    current = {
        "users": [
            {
                "id": "D-OLD",
                "role": "lecturer",
                "name": "Dosen Contoh",
                "status": "deleted",
                "merged_into_user_id": "D-CANON",
            },
            {
                "id": "D-CANON",
                "role": "lecturer",
                "name": "Dosen Contoh",
                "nidn": "001",
                "feeder_lecturer_id": "L1",
                "prodi_id": "P1",
                "homebase": "P1",
            },
            {"id": "S1", "role": "student", "name": "Mahasiswa"},
        ],
        "programs": [
            {"id": "P1", "name": "Program Satu", "feeder_program_id": "FP1"},
            {"id": "P2", "name": "Program Dua", "feeder_program_id": "FP2"},
        ],
        "courses": [{"id": "MK1", "code": "MK1", "name": "Mata Kuliah"}],
        "classes": [],
        "kurikulum": [],
        "academic_periods": [],
        "krs": [],
        "khs": [],
    }
    live = {
        "lecturers_master": [
            {"id_dosen": "L1", "nidn": "001", "nama_dosen": "Dosen Contoh"}
        ],
        "lecturer_registrations": [
            {
                "id_dosen": "L1",
                "id_registrasi_dosen": "R1",
                "id_prodi": "FP2",
                "id_tahun_ajaran": "2024",
                "a_sp_homebase": "1",
            },
            {
                "id_dosen": "L1",
                "id_registrasi_dosen": "R2",
                "id_prodi": "FP2",
                "id_tahun_ajaran": "2025",
                "a_sp_homebase": "1",
            },
        ],
    }

    updates, report = reconciliation.build_plan(
        tables=tables,
        current=current,
        live=live,
        period="20261",
        source_name="latest.json",
    )

    assert not any(
        item.collection == "users" and item.query == {"id": "D-OLD"}
        for item in updates
    )
    lecturer = next(
        item
        for item in updates
        if item.collection == "users" and item.query == {"id": "D-CANON"}
    )
    student = next(
        item
        for item in updates
        if item.collection == "users" and item.query == {"id": "S1"}
    )
    class_update = next(
        item
        for item in updates
        if item.collection == "classes" and item.query == {"id": "J1"}
    )

    assert lecturer.values["homebase"] == "P2"
    assert lecturer.values["prodi_id"] == "P2"
    assert lecturer.values["homebase_source"] == "feeder"
    assert lecturer.values["access_scope_prodi_ids"] == ["P1", "P2"]
    assert student.values["dosen_wali_id"] == "D-CANON"
    assert class_update.values["lecturer_id"] == "D-CANON"
    assert class_update.values["local_dosen_pengajar"][0]["lecturer_id"] == "D-CANON"
    assert report["merged_staff_skipped"] == [
        {"source_id": "D-OLD", "canonical_id": "D-CANON"}
    ]


def test_plan_backfills_semester_status_from_old_khs():
    tables = {
        "mhsw": [{"MhswID": "25001", "Nama": "Mahasiswa", "ProdiID": "P1"}],
        "khs": [
            {
                "KHSID": "old-khs",
                "MhswID": "25001",
                "TahunID": "20252",
                "StatusMhswID": "N",
                "IPS": "3.50",
                "IPK": "3.60",
                "SKS": "20",
                "TotalSKS": "40",
                "Biaya": "0",
            }
        ],
    }
    current = {
        "users": [{"id": "25001", "role": "student", "name": "Mahasiswa"}],
        "programs": [],
        "courses": [],
        "classes": [],
        "kurikulum": [],
        "academic_periods": [],
        "krs": [],
        "khs": [
            {
                "id": "new-khs",
                "student_id": "25001",
                "academic_period_id": "20252",
                "ips": 3.5,
                "ipk": 3.6,
                "total_sks_semester": 20,
                "total_sks_kumulatif": 40,
                "biaya_kuliah_smt": 0,
                "grades": [],
            }
        ],
    }

    updates, _ = reconciliation.build_plan(
        tables=tables,
        current=current,
        live={},
        period="20252",
        source_name="old.json",
    )

    khs_update = next(
        item
        for item in updates
        if item.collection == "khs" and item.query == {"id": "new-khs"}
    )
    assert khs_update.values["status_mhs"] == "N"
    assert khs_update.needs_write is True


def test_offline_plan_preserves_existing_feeder_metadata():
    existing_teacher_snapshot = [
        {
            "feeder_assignment_id": "assignment-existing",
            "feeder_registration_id": "registration-lecturer-existing",
            "feeder_lecturer_id": "lecturer-existing",
            "source": "feeder_snapshot",
        }
    ]
    existing_activity_snapshot = {
        "nim": "25001",
        "id_registrasi_mahasiswa": "registration-student-existing",
        "ipk": 3.6,
    }
    tables = {
        "mhsw": [{"MhswID": "25001", "Nama": "Mahasiswa", "ProdiID": "P1"}],
        "pegawai": [{"Login": "D1", "Nama": "Dosen", "NIDN": "0123456789"}],
        "jadwal": [
            {
                "JadwalID": "J1",
                "TahunID": "20252",
                "DosenID": "D1",
                "MKID": "MK1",
            }
        ],
        "khs": [
            {
                "KHSID": "old-khs",
                "MhswID": "25001",
                "TahunID": "20252",
                "StatusMhswID": "A",
            }
        ],
    }
    current = {
        "users": [
            {
                "id": "25001",
                "role": "student",
                "name": "Mahasiswa",
                "feeder_student_id": "student-existing",
                "feeder_registration_id": "registration-student-existing",
                "pddikti_ids": {
                    "id_mahasiswa": "student-existing",
                    "id_registrasi_mahasiswa": "registration-student-existing",
                    "last_verified_id_mahasiswa": "student-verified",
                    "last_verified_id_registrasi": "registration-verified",
                },
            },
            {
                "id": "D1",
                "role": "lecturer",
                "name": "Dosen",
                "nidn": "0123456789",
                "feeder_lecturer_id": "lecturer-existing",
                "feeder_registration_ids": ["registration-lecturer-existing"],
            },
        ],
        "programs": [],
        "courses": [{"id": "MK1", "code": "MK1", "name": "Mata Kuliah"}],
        "classes": [{"id": "J1", "dosen_pengajar": existing_teacher_snapshot}],
        "kurikulum": [],
        "academic_periods": [],
        "krs": [],
        "khs": [],
        "aktivitas_mahasiswa": [
            {
                "id": "AKTMHS_20252_25001",
                "feeder_snapshot": existing_activity_snapshot,
            }
        ],
    }

    updates, _ = reconciliation.build_plan(
        tables=tables,
        current=current,
        live={},
        period="20252",
        source_name="old.json",
        feeder_available=False,
    )

    student_update = next(
        item for item in updates if item.collection == "users" and item.query == {"id": "25001"}
    )
    lecturer_update = next(
        item for item in updates if item.collection == "users" and item.query == {"id": "D1"}
    )
    class_update = next(
        item for item in updates if item.collection == "classes" and item.query == {"id": "J1"}
    )
    activity_update = next(
        item
        for item in updates
        if item.collection == "aktivitas_mahasiswa"
        and item.query == {"id": "AKTMHS_20252_25001"}
    )

    assert student_update.values["feeder_student_id"] == "student-existing"
    assert student_update.values["feeder_registration_id"] == "registration-student-existing"
    assert student_update.values["pddikti_ids"]["last_verified_id_mahasiswa"] == "student-verified"
    assert lecturer_update.values["feeder_lecturer_id"] == "lecturer-existing"
    assert lecturer_update.values["feeder_registration_ids"] == [
        "registration-lecturer-existing"
    ]
    assert class_update.values["dosen_pengajar"] == existing_teacher_snapshot
    assert activity_update.values["feeder_snapshot"] == existing_activity_snapshot
