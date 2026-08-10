"""Regression checks for Neo Feeder configuration and sandbox routing."""

import asyncio

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from routers import feeder


class FakeCollection:
    def __init__(self, document=None):
        self.document = dict(document or {})

    async def find_one(self, *_args, **_kwargs):
        return dict(self.document) if self.document else None

    async def update_one(self, _query, update, **_kwargs):
        self.document.update(update.get("$set", {}))


class FakeDatabase:
    def __init__(self, document=None):
        self.feeder_config = FakeCollection(document)


class FakeResponse:
    status_code = 200

    def __init__(self, payload):
        self.payload = payload

    def json(self):
        return self.payload


class FakeFeederClient:
    calls = []
    response_key = "result"

    def __init__(self, **_kwargs):
        type(self).calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def post(self, endpoint, json):
        type(self).calls.append((endpoint, json))
        if json["act"] == "GetToken":
            return FakeResponse(
                {
                    "error_code": 0,
                    "error_desc": "",
                    self.response_key: {"token": "token-1234567890"},
                }
            )
        return FakeResponse(
            {
                "error_code": 0,
                "error_desc": "",
                self.response_key: [
                    {
                        "kode_perguruan_tinggi": "001001",
                        "nama_perguruan_tinggi": "Kampus Sandbox",
                        "id_perguruan_tinggi": "pt-sandbox",
                    }
                ],
            }
        )


class FakeOnlineFeederClient(FakeFeederClient):
    response_key = "data"


def config(**overrides):
    values = {
        "feeder_url": "http://feeder.test:8100",
        "feeder_path": "/ws/live2.php",
        "username": "001001",
        "password": "secret",
        "mode": "sandbox",
        "auto_sync": False,
    }
    return feeder.FeederConfigInput(**{**values, **overrides})


def test_sandbox_mode_selects_sandbox_endpoint():
    assert feeder.normalize_feeder_path("/ws/live2.php", "sandbox") == "/ws/sandbox2.php"
    assert feeder.normalize_feeder_path("/ws/sandbox2.php", "live") == "/ws/live2.php"
    assert feeder.normalize_feeder_path("custom/token", "sandbox") == "/custom/token"


def test_feeder_url_validation_and_mode_validation():
    assert feeder.normalize_feeder_url("https://feeder.example.test/") == "https://feeder.example.test"
    with pytest.raises(HTTPException):
        feeder.normalize_feeder_url("feeder.example.test")
    with pytest.raises(ValidationError):
        config(mode="development")


def test_save_keeps_existing_password_and_normalizes_sandbox():
    database = FakeDatabase({"id": "default", "password": "already-saved"})
    body = config(password="", feeder_url="http://feeder.test:8100/")

    result = asyncio.run(feeder.save_feeder_config(body=body, db=database, _={}))

    assert result["ok"] is True
    assert database.feeder_config.document["password"] == "already-saved"
    assert database.feeder_config.document["feeder_url"] == "http://feeder.test:8100"
    assert database.feeder_config.document["feeder_path"] == "/ws/sandbox2.php"


@pytest.mark.parametrize("client_class", [FakeFeederClient, FakeOnlineFeederClient])
def test_connection_supports_old_and_online_response_envelopes(monkeypatch, client_class):
    monkeypatch.setattr(feeder.httpx, "AsyncClient", client_class)
    database = FakeDatabase()

    result = asyncio.run(feeder.test_feeder_connection(body=config(), db=database, _={}))

    assert result["ok"] is True
    assert result["response_time_ms"] >= 0
    assert client_class.calls[0][0] == "http://feeder.test:8100/ws/sandbox2.php"
    assert result["details"]["nama_pt"] == "Kampus Sandbox"
    assert database.feeder_config.document["last_status"] == "connected"


def test_semester_reconciliation_maps_different_technical_ids_read_only():
    result = feeder.build_semester_reconciliation(
        period=feeder.semester_identity("20252"),
        period_ids={"20252", "period-uuid"},
        feeder_classes=[
            {
                "id_kelas_kuliah": "feeder-class-uuid",
                "kode_mata_kuliah": "MK101",
                "nama_mata_kuliah": "Algoritma",
                "nama_kelas_kuliah": "A",
            }
        ],
        feeder_grades=[
            {
                "id_kelas_kuliah": "feeder-class-uuid",
                "nim": "25001",
                "kode_mata_kuliah": "MK101",
                "nilai_angka": 85,
                "nilai_huruf": "A",
                "nilai_indeks": 4,
            }
        ],
        feeder_lecturers=[
            {"id_kelas_kuliah": "feeder-class-uuid", "nidn": "0123456789"}
        ],
        feeder_activities=[
            {
                "nim": "25001",
                "ips": 4,
                "ipk": 4,
                "sks_semester": 3,
                "sks_total": 3,
            }
        ],
        local_users=[
            {"id": "student-local-id", "nim": "25001"},
            {"id": "lecturer-local-id", "nidn": "0123456789"},
        ],
        local_courses=[
            {"id": "course-local-id", "code": "MK101", "name": "Algoritma"}
        ],
        all_local_classes=[
            {
                "id": "99",
                "course_id": "course-local-id",
                "academic_year": "2025/2026",
                "semester": "Genap",
                "name": "Kelas A",
                "lecturer_id": "lecturer-local-id",
                "student_ids": ["student-local-id"],
            }
        ],
        all_local_khs=[
            {
                "academic_period_id": "period-uuid",
                "student_id": "student-local-id",
                "ips": 4,
                "ipk": 4,
                "total_sks_semester": 3,
                "total_sks_kumulatif": 3,
                "grades": [
                    {
                        "course_code": "MK101",
                        "score": 85,
                        "grade_letter": "A",
                        "grade_point": 4,
                    }
                ],
            }
        ],
    )

    assert result["mode"] == "read_only"
    assert result["summary"]["classes"] == {
        "feeder": 1,
        "siakad": 1,
        "mapped": 1,
        "exact": 1,
        "different": 0,
        "feeder_only": 0,
        "siakad_only": 0,
    }
    assert result["summary"]["grades"]["different"] == 0
    assert result["summary"]["student_activities"]["different"] == 0
    assert result["summary"]["lecturers"]["matched_classes"] == 1


def test_semester_reconciliation_prioritizes_migrated_feeder_class_id():
    result = feeder.build_semester_reconciliation(
        period=feeder.semester_identity("20252"),
        period_ids={"20252"},
        feeder_classes=[
            {
                "id_kelas_kuliah": "feeder-class-uuid",
                "kode_mata_kuliah": "KODE-BARU-FEEDER",
                "nama_mata_kuliah": "Nama di Feeder",
                "nama_kelas_kuliah": "A",
            }
        ],
        feeder_grades=[],
        feeder_lecturers=[],
        feeder_activities=[],
        local_users=[],
        local_courses=[
            {"id": "course-local-id", "code": "KODE-LOKAL", "name": "Nama Lokal"}
        ],
        all_local_classes=[
            {
                "id": "99",
                "feeder_class_id": "feeder-class-uuid",
                "course_id": "course-local-id",
                "academic_year": "2025/2026",
                "semester": "Genap",
                "name": "Kelas Lokal",
                "student_ids": [],
            }
        ],
        all_local_khs=[],
    )

    assert result["summary"]["classes"]["mapped"] == 1
    assert result["class_mappings"][0]["mapping_basis"] == "feeder_id"


def test_write_preview_marks_blank_feeder_grade_ready_and_missing_identity_blocked():
    result = feeder.build_feeder_write_preview(
        period=feeder.semester_identity("20252"),
        period_ids={"20252"},
        feeder_classes=[{"id_kelas_kuliah": "feeder-class"}],
        feeder_grades=[
            {
                "id_kelas_kuliah": "feeder-class",
                "nim": "25001",
                "nilai_angka": 0,
                "nilai_huruf": "-",
                "nilai_indeks": 0,
            }
        ],
        feeder_lecturers=[],
        feeder_activities=[],
        local_users=[
            {
                "id": "25001",
                "nim": "25001",
                "feeder_student_id": "student-feeder",
                "feeder_registration_id": "registration-feeder",
            },
            {"id": "25002", "nim": "25002"},
        ],
        local_courses=[{"id": "course", "feeder_course_id": "course-feeder"}],
        all_local_classes=[
            {
                "id": "class",
                "feeder_class_id": "feeder-class",
                "course_id": "course",
                "academic_period_id": "20252",
                "student_ids": ["25001", "25002"],
            }
        ],
        all_local_krs=[
            {
                "student_id": "25001",
                "academic_period_id": "20252",
                "courses": [
                    {
                        "class_id": "class",
                        "course_code": "MK1",
                        "final_score": 85,
                        "grade_letter": "A",
                        "grade_point": 4,
                    }
                ],
            }
        ],
        all_local_khs=[],
    )

    grade_operation = next(
        item for item in result["operations"] if item["category"] == "grades"
    )
    student_operation = next(
        item
        for item in result["operations"]
        if item["category"] == "students" and item["identity"]["nim"] == "25002"
    )
    assert grade_operation["status"] == "ready"
    assert "masih kosong" in grade_operation["reason"]
    assert student_operation["status"] == "blocked"


def test_write_preview_ignores_equivalent_blank_grade_representations():
    result = feeder.build_feeder_write_preview(
        period=feeder.semester_identity("20252"),
        period_ids={"20252"},
        feeder_classes=[{"id_kelas_kuliah": "feeder-class"}],
        feeder_grades=[
            {
                "id_kelas_kuliah": "feeder-class",
                "nim": "25001",
                "nilai_angka": None,
                "nilai_huruf": None,
                "nilai_indeks": None,
            }
        ],
        feeder_lecturers=[],
        feeder_activities=[],
        local_users=[
            {
                "id": "25001",
                "nim": "25001",
                "feeder_student_id": "student-feeder",
                "feeder_registration_id": "registration-feeder",
            }
        ],
        local_courses=[{"id": "course", "feeder_course_id": "course-feeder"}],
        all_local_classes=[
            {
                "id": "class",
                "feeder_class_id": "feeder-class",
                "course_id": "course",
                "academic_period_id": "20252",
                "student_ids": ["25001"],
            }
        ],
        all_local_krs=[
            {
                "student_id": "25001",
                "academic_period_id": "20252",
                "courses": [
                    {
                        "class_id": "class",
                        "course_code": "MK1",
                        "final_score": 0,
                        "grade_letter": "-",
                        "grade_point": 0,
                    }
                ],
            }
        ],
        all_local_khs=[],
    )

    assert not [
        item for item in result["operations"] if item["category"] == "grades"
    ]


def test_sandbox_capability_block_only_downgrades_ready_category():
    result = {
        "operations": [
            {
                "id": "grade-ready",
                "category": "grades",
                "status": "ready",
                "dependencies": [],
                "reason": "Nilai Feeder masih kosong.",
            },
            {
                "id": "grade-review",
                "category": "grades",
                "status": "review",
                "dependencies": [],
                "reason": "Nilai berbeda.",
            },
            {
                "id": "activity-ready",
                "category": "student_activities",
                "status": "ready",
                "dependencies": [],
                "reason": "Aktivitas belum ada.",
            },
        ]
    }

    feeder.apply_sandbox_capability_blocks(
        result,
        {
            "mode": "sandbox",
            "sandbox_write_blocks": {
                "grades": {
                    "error_code": 1178,
                    "error_desc": "Data Nilai Perkuliahan Kelas tidak ditemukan.",
                }
            },
        },
    )

    assert result["operations"][0]["status"] == "blocked"
    assert "kapabilitas_tulis_sandbox" in result["operations"][0]["dependencies"]
    assert result["operations"][1]["status"] == "review"
    assert result["operations"][2]["status"] == "ready"
    assert result["summary"] == {
        "total": 3,
        "ready": 1,
        "review": 1,
        "blocked": 1,
        "resolved": 0,
        "by_category": {
            "grades": {"blocked": 1, "total": 2, "review": 1},
            "student_activities": {"ready": 1, "total": 1},
        },
    }


def test_write_preview_preserves_two_decimal_grade_precision():
    result = feeder.build_feeder_write_preview(
        period=feeder.semester_identity("20252"),
        period_ids={"20252"},
        feeder_classes=[{"id_kelas_kuliah": "feeder-class"}],
        feeder_grades=[
            {
                "id_kelas_kuliah": "feeder-class",
                "nim": "25001",
                "nilai_angka": "86.6400",
                "nilai_huruf": "A",
                "nilai_indeks": "4.00",
            }
        ],
        feeder_lecturers=[],
        feeder_activities=[],
        local_users=[
            {
                "id": "25001",
                "nim": "25001",
                "feeder_student_id": "student-feeder",
                "feeder_registration_id": "registration-feeder",
            }
        ],
        local_courses=[{"id": "course", "feeder_course_id": "course-feeder"}],
        all_local_classes=[
            {
                "id": "class",
                "feeder_class_id": "feeder-class",
                "course_id": "course",
                "academic_period_id": "20252",
                "student_ids": ["25001"],
            }
        ],
        all_local_krs=[
            {
                "student_id": "25001",
                "academic_period_id": "20252",
                "courses": [
                    {
                        "class_id": "class",
                        "course_code": "MK1",
                        "final_score": 86.64,
                        "grade_letter": "A",
                        "grade_point": 4,
                    }
                ],
            }
        ],
        all_local_khs=[],
    )

    assert not [
        item for item in result["operations"] if item["category"] == "grades"
    ]


def test_saved_keep_feeder_resolution_expires_when_values_change():
    operation = {
        "id": "review-1",
        "category": "student_activities",
        "action": "update_student_activity",
        "status": "review",
        "identity": {"nim": "25001"},
        "siakad": {"ips": 3.5},
        "feeder": {"ips": 3.0},
    }
    state_hash = feeder.operation_state_hash(operation)
    result = {"operations": [dict(operation)]}

    feeder.apply_saved_resolutions(
        result,
        [
            {
                "operation_id": "review-1",
                "decision": "keep_feeder",
                "state_hash": state_hash,
                "resolved_at": "2026-08-09T12:00:00+00:00",
                "resolved_by": "admin",
            }
        ],
    )

    assert result["operations"][0]["status"] == "resolved"
    assert result["summary"]["review"] == 0
    assert result["summary"]["resolved"] == 1

    changed = {"operations": [{**operation, "feeder": {"ips": 3.2}}]}
    feeder.apply_saved_resolutions(
        changed,
        [
            {
                "operation_id": "review-1",
                "decision": "keep_feeder",
                "state_hash": state_hash,
            }
        ],
    )
    assert changed["operations"][0]["status"] == "review"


def test_import_feeder_grade_only_updates_blank_krs_and_khs():
    class GradeCollection:
        def __init__(self, document):
            self.document = document

        async def find_one(self, query, *_args, **_kwargs):
            if all(self.document.get(key) == value for key, value in query.items()):
                return dict(self.document)
            return None

        async def update_one(self, _query, update, **_kwargs):
            self.document.update(update.get("$set", {}))

    class GradeDatabase:
        def __init__(self):
            self.users = GradeCollection({"id": "25001", "nim": "25001"})
            self.krs = GradeCollection(
                {
                    "id": "krs-1",
                    "student_id": "25001",
                    "academic_period_id": "20252",
                    "courses": [
                        {
                            "class_id": "class-1",
                            "course_code": "MK1",
                            "final_score": 0,
                            "grade_letter": "-",
                            "grade_point": 0,
                        }
                    ],
                }
            )
            self.khs = GradeCollection(
                {
                    "id": "khs-1",
                    "student_id": "25001",
                    "academic_period_id": "20252",
                    "grades": [
                        {
                            "course_code": "MK1",
                            "score": 0,
                            "grade_letter": "-",
                            "grade_point": 0,
                        }
                    ],
                }
            )

    database = GradeDatabase()
    operation = {
        "category": "grades",
        "action": "update_grade",
        "identity": {
            "nim": "25001",
            "class_id": "class-1",
            "course_code": "MK1",
            "occurrence": 1,
        },
        "siakad": {"nilai_angka": 0, "nilai_huruf": "-", "nilai_indeks": 0},
        "feeder": {"nilai_angka": "88.50", "nilai_huruf": "A", "nilai_indeks": "4.00"},
    }

    result = asyncio.run(
        feeder.import_feeder_grade_to_siakad(
            database, operation, "20252", "run-1"
        )
    )

    assert result == {"krs_id": "krs-1", "khs_id": "khs-1"}
    assert database.krs.document["courses"][0]["final_score"] == 88.5
    assert database.khs.document["grades"][0]["grade_letter"] == "A"
