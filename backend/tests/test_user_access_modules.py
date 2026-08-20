from routers.user_access import (
    ACADEMIC_OPERATOR_DEFAULT_MATRIX,
    BASE_ROLE_LABELS,
    FINANCE_STAFF_DEFAULT_MATRIX,
    DEFAULT_TEMPLATES,
    SYSTEM_MODULES,
    merge_permission_matrices,
    normalize_permission_matrix,
    normalize_base_role,
    normalize_template_permissions,
    position_accesses_from_assignments,
    role_default_permission_matrix,
    template_matches_user_role,
    user_is_program_manager,
)


def test_system_module_catalog_covers_current_siakad_areas():
    module_keys = {module["key"] for module in SYSTEM_MODULES}

    assert {
        "keuangan", "pmb", "academic_structure", "student_records",
        "lecturer_records", "feeder", "old_siakad_migration",
        "database_backup", "data_maintenance", "academic_calendar",
        "progres_nilai_prodi", "analisis_mahasiswa_prodi", "analisis_rps_prodi",
        "sk_mengajar", "sk_jabatan",
    }.issubset(module_keys)
    assert "data_master" not in module_keys
    assert "system_settings" not in module_keys


def test_legacy_permission_keys_expand_to_the_new_modules():
    legacy = {
        "data_master": {"view": True, "create": False, "edit": False, "delete": False, "export": True},
        "user_management": {"view": True, "create": True, "edit": True, "delete": False, "export": False},
        "system_settings": {"view": True, "create": False, "edit": True, "delete": False, "export": False},
    }

    matrix = normalize_permission_matrix(legacy)

    assert matrix["academic_structure"] == legacy["data_master"]
    assert matrix["curriculum_schedule"] == legacy["data_master"]
    assert matrix["student_records"] == legacy["user_management"]
    assert matrix["academic_advising"] == legacy["user_management"]
    assert matrix["integration_api"] == legacy["system_settings"]
    assert matrix["data_maintenance"] == legacy["system_settings"]
    assert matrix["pmb"]["view"] is False


def test_default_roles_include_finance_and_remain_least_privilege():
    admin = role_default_permission_matrix("admin")
    lecturer = role_default_permission_matrix("lecturer")
    student = role_default_permission_matrix("student")
    staff = role_default_permission_matrix("staff")

    assert all(admin["old_siakad_migration"].values())
    assert lecturer["grading"]["edit"] is True
    assert lecturer["keuangan"]["view"] is False
    assert student["keuangan"] == {
        "view": True, "create": False, "edit": False, "delete": False, "export": True,
    }
    assert student["student_records"]["view"] is False
    assert staff["dashboard"]["view"] is True
    assert staff["academic_calendar"]["view"] is True
    assert staff["keuangan"]["view"] is False
    assert staff["materials"]["view"] is False


def test_staff_is_a_base_role_and_unknown_roles_fail_closed():
    assert BASE_ROLE_LABELS["staff"] == "Tendik"
    assert normalize_base_role("tendik") == "staff"
    assert normalize_base_role("staf") == "staff"
    assert normalize_base_role("role-yang-tidak-dikenal") == "role-yang-tidak-dikenal"
    assert role_default_permission_matrix("role-yang-tidak-dikenal") == role_default_permission_matrix("staff")


def test_synced_access_roles_override_stale_kaprodi_fields():
    stale_lecturer = {
        "role": "lecturer",
        "access_roles": [],
        "is_kaprodi": True,
        "kaprodi_prodi_id": "OLD-PRODI",
        "jabatan_akademik": "Ketua Program Studi (Kaprodi)",
    }
    active_kaprodi = {"role": "lecturer", "access_roles": ["kaprodi"]}
    unsynchronized_legacy = {
        "role": "lecturer",
        "jabatan_akademik": "Ketua Program Studi",
    }

    assert user_is_program_manager(stale_lecturer) is False
    assert user_is_program_manager(active_kaprodi) is True
    assert user_is_program_manager(unsynchronized_legacy) is True


def test_templates_can_only_be_applied_to_compatible_roles():
    finance_template = {"role_target": "admin"}
    staff_finance_template = {"role_target": "staff"}
    unrestricted_template = {"role_target": "all"}

    assert template_matches_user_role(finance_template, "admin") is True
    assert template_matches_user_role(finance_template, "student") is False
    assert template_matches_user_role(staff_finance_template, "tendik") is True
    assert template_matches_user_role(staff_finance_template, "admin") is False
    assert template_matches_user_role(unrestricted_template, "lecturer") is True


def test_bendahara_maps_to_tendik_finance_access():
    templates = {template["id"]: template for template in DEFAULT_TEMPLATES}
    assignments = [{
        "id": "assign-bendahara",
        "jabatan_id": "jab-bendahara",
        "jabatan_kode": "BENDAHARA",
        "jabatan_nama": "Bendahara",
        "prodi_id": "",
    }]

    accesses = position_accesses_from_assignments(assignments, templates)

    assert len(accesses) == 1
    assert accesses[0]["template_id"] == "tpl_keuangan"
    assert accesses[0]["access_role"] == "finance_officer"
    assert accesses[0]["permissions"]["keuangan"]["edit"] is True


def test_baak_maps_to_global_academic_quality_and_calendar_access():
    templates = {template["id"]: template for template in DEFAULT_TEMPLATES}
    assignments = [{
        "id": "assign-akademik-inst",
        "jabatan_id": "jablokal-aka",
        "jabatan_kode": "AKADEMIK",
        "jabatan_nama": "Kepala / Staf Bagian Akademik (BAAK)",
        "prodi_id": "",
    }]

    accesses = position_accesses_from_assignments(assignments, templates)

    assert len(accesses) == 1
    assert accesses[0]["access_role"] == "academic_operator"
    assert accesses[0]["permissions"] == ACADEMIC_OPERATOR_DEFAULT_MATRIX
    assert all(accesses[0]["permissions"]["academic_calendar"].values())
    assert accesses[0]["permissions"]["progres_nilai_prodi"]["view"] is True
    assert accesses[0]["permissions"]["analisis_mahasiswa_prodi"]["view"] is True
    assert accesses[0]["permissions"]["analisis_rps_prodi"]["edit"] is True
    assert accesses[0]["permissions"]["academic_setup"]["view"] is False
    assert accesses[0]["permissions"]["facilities"]["view"] is False
    assert accesses[0]["permissions"]["rekap_nilai"]["view"] is False


def test_legacy_academic_template_is_reset_to_admin_separated_schema():
    permissions = normalize_template_permissions({
        "id": "tpl_akademik",
        "role_target": "all",
        "permission_schema_version": 4,
        "permissions": {
            "dashboard": {"view": True},
            "academic_setup": {"view": True, "edit": True},
            "academic_calendar": {"view": True, "edit": True},
            "facilities": {"view": True, "edit": True},
            "rekap_nilai": {"view": True, "export": True},
        },
    })

    assert permissions == ACADEMIC_OPERATOR_DEFAULT_MATRIX
    assert permissions["academic_calendar"]["edit"] is True
    assert permissions["academic_setup"]["view"] is False
    assert permissions["facilities"]["view"] is False
    assert permissions["rekap_nilai"]["view"] is False


def test_legacy_tendik_template_is_reset_to_least_privilege():
    permissions = normalize_template_permissions({
        "id": "tpl_tendik",
        "role_target": "staff",
        "permission_schema_version": 3,
        "permissions": {
            "dashboard": {"view": True},
            "keuangan": {"view": True, "edit": True},
            "progres_nilai_prodi": {"view": True},
        },
    })

    assert permissions == role_default_permission_matrix("staff")
    assert permissions["dashboard"]["view"] is True
    assert permissions["academic_calendar"]["view"] is True
    assert permissions["keuangan"]["view"] is False
    assert permissions["progres_nilai_prodi"]["view"] is False


def test_structural_assignment_adds_role_template_and_program_scope():
    templates = {template["id"]: template for template in DEFAULT_TEMPLATES}
    assignments = [{
        "id": "assign-kaprodi-prodi-ti",
        "jabatan_id": "jablokal-1",
        "jabatan_kode": "KAPRODI",
        "jabatan_nama": "Ketua Program Studi (Kaprodi)",
        "prodi_id": "prodi-ti",
        "prodi_nama": "Teknik Informatika",
    }]

    accesses = position_accesses_from_assignments(assignments, templates)

    assert len(accesses) == 1
    assert accesses[0]["template_id"] == "tpl_kaprodi"
    assert accesses[0]["access_role"] == "kaprodi"
    assert accesses[0]["prodi_id"] == "prodi-ti"
    assert accesses[0]["permissions"]["academic_structure"]["view"] is False
    assert accesses[0]["permissions"]["progres_nilai_prodi"]["view"] is True
    assert accesses[0]["permissions"]["analisis_mahasiswa_prodi"]["view"] is True
    assert accesses[0]["permissions"]["analisis_rps_prodi"]["edit"] is True
    assert accesses[0]["permissions"]["sk_mengajar"]["view"] is False
    assert accesses[0]["permissions"]["sk_jabatan"]["view"] is False
    assert accesses[0]["permissions"]["lecturer_records"]["view"] is True
    assert accesses[0]["permissions"]["academic_advising"]["edit"] is True

    effective = merge_permission_matrices([
        role_default_permission_matrix("lecturer"),
        accesses[0]["permissions"],
    ])
    assert effective["academic_structure"]["view"] is False
    assert effective["curriculum_schedule"]["edit"] is True
    assert effective["sk_jabatan"]["view"] is False


def test_legacy_kaprodi_template_cannot_inherit_sk_jabatan_access():
    permissions = normalize_template_permissions({
        "id": "tpl_kaprodi",
        "role_target": "lecturer",
        "permissions": {
            "academic_documents": {
                "view": True, "create": True, "edit": True, "delete": False, "export": True,
            },
        },
    })

    assert permissions["sk_mengajar"]["view"] is False
    assert permissions["sk_jabatan"]["view"] is False
    assert permissions["sk_jabatan"]["export"] is False


def test_legacy_kaprodi_template_is_reset_to_safe_structural_modules():
    permissions = normalize_template_permissions({
        "id": "tpl_kaprodi",
        "role_target": "lecturer",
        "permissions": {
            "data_master": {action: True for action in ("view", "create", "edit", "delete", "export")},
            "user_management": {action: True for action in ("view", "create", "edit", "delete", "export")},
            "system_settings": {action: True for action in ("view", "create", "edit", "delete", "export")},
            "keuangan": {"view": True},
            "feeder": {"view": True},
        },
    })

    assert permissions["curriculum_schedule"]["edit"] is True
    assert permissions["progres_nilai_prodi"]["view"] is True
    assert permissions["academic_structure"]["view"] is False
    assert permissions["sk_mengajar"]["view"] is False
    assert permissions["keuangan"]["view"] is False
    assert permissions["access_control"]["view"] is False
    assert permissions["feeder"]["view"] is False
    assert permissions["facilities"]["view"] is False


def test_legacy_finance_template_does_not_expand_to_unrelated_master_data():
    permissions = normalize_template_permissions({
        "id": "tpl_keuangan",
        "role_target": "staff",
        "permissions": {
            "data_master": {"view": True},
            "user_management": {"view": True, "export": True},
            "keuangan": {"view": True, "create": True, "edit": True, "delete": True, "export": True},
        },
    })

    assert permissions == FINANCE_STAFF_DEFAULT_MATRIX
    assert permissions["academic_structure"]["view"] is True
    assert permissions["facilities"]["view"] is False
    assert permissions["lecturer_records"]["view"] is False


def test_legacy_student_template_keeps_current_student_defaults():
    permissions = normalize_template_permissions({
        "id": "tpl_mahasiswa",
        "role_target": "student",
        "permissions": {
            "assignments": {"view": True, "create": True},
            "konfigurasi": {"view": False},
            "system_settings": {"view": False},
        },
    })

    assert permissions == role_default_permission_matrix("student")
    assert permissions["academic_calendar"]["view"] is True
    assert permissions["access_control"]["view"] is False


def test_functional_rank_never_derives_system_access():
    templates = {template["id"]: template for template in DEFAULT_TEMPLATES}
    assignments = [{
        "id": "assign-lektor-inst",
        "jabatan_id": "rank-lektor",
        "jabatan_kode": "LEKTOR",
        "jabatan_nama": "Lektor",
    }]

    assert position_accesses_from_assignments(assignments, templates) == []
