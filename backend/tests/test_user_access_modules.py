from routers.user_access import (
    DEFAULT_TEMPLATES,
    SYSTEM_MODULES,
    merge_permission_matrices,
    normalize_permission_matrix,
    position_accesses_from_assignments,
    role_default_permission_matrix,
    template_matches_user_role,
)


def test_system_module_catalog_covers_current_siakad_areas():
    module_keys = {module["key"] for module in SYSTEM_MODULES}

    assert {
        "keuangan", "pmb", "academic_structure", "student_records",
        "lecturer_records", "feeder", "old_siakad_migration",
        "database_backup", "data_maintenance", "academic_calendar",
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

    assert all(admin["old_siakad_migration"].values())
    assert lecturer["grading"]["edit"] is True
    assert lecturer["keuangan"]["view"] is False
    assert student["keuangan"] == {
        "view": True, "create": False, "edit": False, "delete": False, "export": True,
    }
    assert student["student_records"]["view"] is False


def test_templates_can_only_be_applied_to_compatible_roles():
    finance_template = {"role_target": "admin"}
    unrestricted_template = {"role_target": "all"}

    assert template_matches_user_role(finance_template, "admin") is True
    assert template_matches_user_role(finance_template, "student") is False
    assert template_matches_user_role(unrestricted_template, "lecturer") is True


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
    assert accesses[0]["permissions"]["academic_structure"]["view"] is True

    effective = merge_permission_matrices([
        role_default_permission_matrix("lecturer"),
        accesses[0]["permissions"],
    ])
    assert effective["academic_structure"]["view"] is True


def test_functional_rank_never_derives_system_access():
    templates = {template["id"]: template for template in DEFAULT_TEMPLATES}
    assignments = [{
        "id": "assign-lektor-inst",
        "jabatan_id": "rank-lektor",
        "jabatan_kode": "LEKTOR",
        "jabatan_nama": "Lektor",
    }]

    assert position_accesses_from_assignments(assignments, templates) == []
