"""Regression tests for unified login, enrollment approval, submissions, comments, grading, and settings."""

import os
import uuid
from datetime import datetime, timedelta, timezone
import pytest
import requests
from dotenv import load_dotenv


load_dotenv("/app/frontend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
assert BASE_URL, "REACT_APP_BACKEND_URL is required"
API_BASE = f"{BASE_URL.rstrip('/')}/api"


def _login(identifier: str, password: str) -> dict:
    response = requests.post(
        f"{API_BASE}/auth/login",
        json={"identifier": identifier, "password": password},
        timeout=40,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert isinstance(data.get("token"), str) and data["token"]
    assert isinstance(data.get("user"), dict)
    return data


@pytest.fixture(scope="module")
def state():
    """Shared ids across tests for setup and verification."""
    unique = uuid.uuid4().hex[:8]
    return {
        "admin": {"identifier": "dosen@demo.id", "password": "Dosen123!"},
        "student_seed": {"identifier": "230001001", "password": "Mahasiswa123!"},
        "suffix": unique,
        "course_id": "",
        "class_id": "",
        "class_code": "",
        "material_id": "",
        "assignment_id": "",
        "pending_student": {
            "nim": f"TEST{unique}",
            "name": f"TEST Pending {unique}",
            "email": f"pending.{unique}@demo.id",
            "password": "Mahasiswa123!",
        },
        "pending_student_token": "",
        "pending_student_id": "",
        "request_id": "",
        "submission_id": "",
        "created_comment_id": "",
    }


@pytest.fixture(scope="module")
def admin_auth(state):
    """Admin auth header for protected endpoints."""
    data = _login(state["admin"]["identifier"], state["admin"]["password"])
    assert data["user"]["role"] == "admin"
    return {"Authorization": f"Bearer {data['token']}"}


def test_unified_login_by_email_username_nim(state):
    # Auth module: identifier login supports email, username, and NIM.
    admin_by_email = _login("dosen@demo.id", "Dosen123!")
    assert admin_by_email["user"]["role"] == "admin"

    admin_by_username = _login("dosenadmin", "Dosen123!")
    assert admin_by_username["user"]["role"] == "admin"

    student_by_nim = _login("230001001", "Mahasiswa123!")
    assert student_by_nim["user"]["role"] == "student"
    assert student_by_nim["user"].get("nim") == "230001001"


def test_create_class_material_assignment_for_enrollment_flow(admin_auth, state):
    # Admin class/material/assignment module for enrollment request and visibility checks.
    course_payload = {
        "code": f"TST{state['suffix'][:4].upper()}",
        "name": f"TEST Enrollment Course {state['suffix']}",
        "credits": 3,
        "description": "Regression setup",
    }
    course_response = requests.post(f"{API_BASE}/courses", json=course_payload, headers=admin_auth, timeout=40)
    assert course_response.status_code == 200, course_response.text
    course_doc = course_response.json()
    assert course_doc["name"] == course_payload["name"]
    state["course_id"] = course_doc["id"]

    class_payload = {
        "academic_year": "2025/2026",
        "semester": "Genap",
        "course_id": state["course_id"],
        "name": f"TEST-KELAS-{state['suffix'][:4]}",
        "schedule": "Kamis 10.00",
    }
    class_response = requests.post(f"{API_BASE}/classes", json=class_payload, headers=admin_auth, timeout=40)
    assert class_response.status_code == 200, class_response.text
    class_doc = class_response.json()
    state["class_id"] = class_doc["id"]
    state["class_code"] = class_doc["class_code"]
    assert isinstance(state["class_code"], str) and len(state["class_code"]) >= 4

    material_payload = {
        "class_id": state["class_id"],
        "title": f"TEST Material {state['suffix']}",
        "description": "Material untuk validasi enrollment approval",
        "meeting": "Pertemuan 1",
        "file_url": "",
        "video_url": "",
        "is_active": True,
        "locked_until": "",
    }
    material_response = requests.post(f"{API_BASE}/materials", json=material_payload, headers=admin_auth, timeout=40)
    assert material_response.status_code == 200, material_response.text
    material_doc = material_response.json()
    state["material_id"] = material_doc["id"]
    assert material_doc["class_id"] == state["class_id"]
    assert material_doc["class_name"] == class_payload["name"]
    assert material_doc["course_name"] == course_payload["name"]

    assignment_payload = {
        "class_id": state["class_id"],
        "title": f"TEST Assignment {state['suffix']}",
        "description": "Pengumpulan dengan multi file",
        "deadline": (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat(),
        "tolerance_hours": 0,
        "allowed_formats": ["pdf", "png", "docx"],
        "rubric": [{"criterion": "Kelengkapan", "weight": 100}],
        "assignment_type": "individu",
        "allow_revision": True,
        "is_active": True,
        "is_practicum": False,
        "practicum_goal": "",
        "practicum_tools": "",
        "practicum_steps": [],
        "required_screenshot": False,
        "late_penalty_per_day": 5,
        "close_after_deadline": False,
        "material_id": state["material_id"],
    }
    assignment_response = requests.post(
        f"{API_BASE}/assignments", json=assignment_payload, headers=admin_auth, timeout=40
    )
    assert assignment_response.status_code == 200, assignment_response.text
    assignment_doc = assignment_response.json()
    state["assignment_id"] = assignment_doc["id"]
    assert assignment_doc["material_id"] == state["material_id"]
    assert assignment_doc["close_after_deadline"] is False


def test_pending_student_request_then_admin_approve_and_visibility(admin_auth, state):
    # Enrollment request module: student requests class and must be approved before visibility.
    join_payload = {
        "class_code": "WEB4A1",
        "nim": state["pending_student"]["nim"],
        "name": state["pending_student"]["name"],
        "email": state["pending_student"]["email"],
        "whatsapp": "628333333333",
        "password": state["pending_student"]["password"],
    }
    join_response = requests.post(f"{API_BASE}/auth/join-class", json=join_payload, timeout=40)
    assert join_response.status_code == 200, join_response.text

    student_login = _login(state["pending_student"]["email"], state["pending_student"]["password"])
    state["pending_student_token"] = student_login["token"]
    state["pending_student_id"] = student_login["user"]["id"]
    student_auth = {"Authorization": f"Bearer {state['pending_student_token']}"}

    before_materials_response = requests.get(f"{API_BASE}/materials", headers=student_auth, timeout=40)
    assert before_materials_response.status_code == 200
    before_materials = before_materials_response.json()
    assert all(item["class_id"] != state["class_id"] for item in before_materials)

    before_assignments_response = requests.get(f"{API_BASE}/assignments", headers=student_auth, timeout=40)
    assert before_assignments_response.status_code == 200
    before_assignments = before_assignments_response.json()
    assert all(item["class_id"] != state["class_id"] for item in before_assignments)

    request_response = requests.post(
        f"{API_BASE}/classes/join-request",
        headers=student_auth,
        json={"class_code": state["class_code"]},
        timeout=40,
    )
    assert request_response.status_code == 200, request_response.text
    request_doc = request_response.json()
    state["request_id"] = request_doc["id"]
    assert request_doc["status"] == "pending"
    assert request_doc["class_code"] == state["class_code"]

    list_requests_response = requests.get(f"{API_BASE}/enrollment-requests", headers=admin_auth, timeout=40)
    assert list_requests_response.status_code == 200
    admin_requests = list_requests_response.json()
    found = next((item for item in admin_requests if item["id"] == state["request_id"]), None)
    assert found is not None
    assert found["status"] == "pending"

    approve_response = requests.post(
        f"{API_BASE}/enrollment-requests/{state['request_id']}/approve", headers=admin_auth, timeout=40
    )
    assert approve_response.status_code == 200, approve_response.text
    approved = approve_response.json()
    assert approved["status"] == "approved"

    after_materials_response = requests.get(f"{API_BASE}/materials", headers=student_auth, timeout=40)
    assert after_materials_response.status_code == 200
    after_materials = after_materials_response.json()
    visible_material = next((item for item in after_materials if item["class_id"] == state["class_id"] and item["id"] == state["material_id"]), None)
    assert visible_material is not None
    assert visible_material["class_name"].startswith("TEST-KELAS-")
    assert visible_material["course_name"].startswith("TEST Enrollment Course")

    after_assignments_response = requests.get(f"{API_BASE}/assignments", headers=student_auth, timeout=40)
    assert after_assignments_response.status_code == 200
    after_assignments = after_assignments_response.json()
    assert any(
        item["class_id"] == state["class_id"] and item["id"] == state["assignment_id"] for item in after_assignments
    )


def test_submission_accepts_multiple_files_and_metadata(state):
    # Submission module: accepts multipart files[] and stores metadata list.
    student_auth = {"Authorization": f"Bearer {state['pending_student_token']}"}
    files = [
        ("files", ("laporan-test.pdf", b"%PDF-1.4 regression", "application/pdf")),
        ("files", ("diagram-test.png", b"\x89PNG\r\n\x1a\nregression", "image/png")),
    ]
    response = requests.post(
        f"{API_BASE}/assignments/{state['assignment_id']}/submit",
        headers=student_auth,
        files=files,
        data={"note": "Submit multi-file regression"},
        timeout=60,
    )
    assert response.status_code == 200, response.text
    submission = response.json()
    state["submission_id"] = submission["id"]
    assert isinstance(submission.get("files"), list)
    assert len(submission["files"]) >= 2
    for item in submission["files"]:
        assert item.get("file_url", "").startswith("/api/files/")
        assert item.get("upload_status") == "stored_on_server"
        assert item.get("storage_provider") == "server_local"


def test_close_after_deadline_rejects_late_and_open_deadline_records_late(admin_auth, state):
    # Deadline module: close-after-deadline blocks late, otherwise records late metadata.
    class_id = state["class_id"]

    closed_payload = {
        "class_id": class_id,
        "title": f"TEST Closed Deadline {state['suffix']}",
        "description": "Harus ditolak jika terlambat",
        "deadline": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(),
        "tolerance_hours": 0,
        "allowed_formats": ["pdf", "png"],
        "rubric": [{"criterion": "Nilai", "weight": 100}],
        "assignment_type": "individu",
        "allow_revision": True,
        "is_active": True,
        "is_practicum": False,
        "practicum_goal": "",
        "practicum_tools": "",
        "practicum_steps": [],
        "required_screenshot": False,
        "late_penalty_per_day": 5,
        "close_after_deadline": True,
        "material_id": state["material_id"],
    }
    closed_create = requests.post(f"{API_BASE}/assignments", json=closed_payload, headers=admin_auth, timeout=40)
    assert closed_create.status_code == 200, closed_create.text
    closed_assignment_id = closed_create.json()["id"]

    student_auth = {"Authorization": f"Bearer {state['pending_student_token']}"}
    closed_submit = requests.post(
        f"{API_BASE}/assignments/{closed_assignment_id}/submit",
        headers=student_auth,
        files=[("files", ("late.pdf", b"late", "application/pdf"))],
        data={"note": "should fail"},
        timeout=40,
    )
    assert closed_submit.status_code == 400
    assert "Deadline sudah ditutup" in closed_submit.json().get("detail", "")

    open_payload = {
        "class_id": class_id,
        "title": f"TEST Open Deadline {state['suffix']}",
        "description": "Boleh terlambat",
        "deadline": (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat(),
        "tolerance_hours": 0,
        "allowed_formats": ["pdf", "png"],
        "rubric": [{"criterion": "Nilai", "weight": 100}],
        "assignment_type": "individu",
        "allow_revision": True,
        "is_active": True,
        "is_practicum": False,
        "practicum_goal": "",
        "practicum_tools": "",
        "practicum_steps": [],
        "required_screenshot": False,
        "late_penalty_per_day": 5,
        "close_after_deadline": False,
        "material_id": state["material_id"],
    }
    open_create = requests.post(f"{API_BASE}/assignments", json=open_payload, headers=admin_auth, timeout=40)
    assert open_create.status_code == 200, open_create.text
    open_assignment_id = open_create.json()["id"]

    open_submit = requests.post(
        f"{API_BASE}/assignments/{open_assignment_id}/submit",
        headers=student_auth,
        files=[("files", ("late-open.pdf", b"late open", "application/pdf"))],
        data={"note": "allowed late"},
        timeout=40,
    )
    assert open_submit.status_code == 200, open_submit.text
    late_submission = open_submit.json()
    assert late_submission["status"] == "Terlambat"
    assert late_submission["late_hours"] > 0
    assert late_submission["late_days"] >= 0
    assert "Terlambat" in late_submission["late_text"]


def test_comment_image_attachment_upload(admin_auth, state):
    # Comment module: image attachment endpoint stores attachment metadata.
    files = {"image": ("comment-proof.png", b"\x89PNG\r\n\x1a\ncomment", "image/png")}
    data = {"content": "Komentar dengan lampiran gambar", "parent_id": ""}
    response = requests.post(
        f"{API_BASE}/materials/{state['material_id']}/comments",
        headers=admin_auth,
        files=files,
        data=data,
        timeout=40,
    )
    assert response.status_code == 200, response.text
    comment_doc = response.json()
    state["created_comment_id"] = comment_doc["id"]
    assert comment_doc["material_id"] == state["material_id"]
    assert isinstance(comment_doc.get("attachment"), dict)
    assert comment_doc["attachment"]["file_url"].startswith("/api/files/")
    assert comment_doc["attachment"]["storage_provider"] == "server_local"


def test_bulk_grading_endpoint(admin_auth, state):
    # Grading module: bulk grading supports many students in one action.
    payload = {
        "grades": [
            {
                "submission_id": state["submission_id"],
                "score": 88,
                "feedback": "Bulk graded",
                "revision_note": "",
            }
        ]
    }
    response = requests.post(f"{API_BASE}/submissions/bulk-grade", json=payload, headers=admin_auth, timeout=40)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["updated"] >= 1
    assert any(item["submission_id"] == state["submission_id"] and item["status"] == "graded" for item in body["results"])


def test_settings_get_put_and_rollover_preview(admin_auth, state):
    # App settings module: settings persistence and academic rollover guidance endpoint.
    get_response = requests.get(f"{API_BASE}/settings", headers=admin_auth, timeout=40)
    assert get_response.status_code == 200, get_response.text
    before = get_response.json()
    assert "campus_name" in before
    assert "active_academic_year" in before

    payload = {
        "campus_name": f"Kampus TEST {state['suffix']}",
        "campus_address": "Jl. Test Akademik 123",
        "program_name": "Teknik Informatika",
        "lecturer_name": "Dosen Uji",
        "lecturer_email": "dosenuji@demo.id",
        "app_logo_url": "https://example.com/app-logo.png",
        "campus_logo_url": "https://example.com/logo.png",
        "active_academic_year": "2026/2027",
        "active_semester": "Ganjil",
    }
    put_response = requests.put(f"{API_BASE}/settings", headers=admin_auth, json=payload, timeout=40)
    assert put_response.status_code == 200, put_response.text
    saved = put_response.json()
    assert saved["campus_name"] == payload["campus_name"]
    assert saved["app_logo_url"] == payload["app_logo_url"]
    assert saved["program_name"] == payload["program_name"]
    assert saved["active_academic_year"] == payload["active_academic_year"]

    rollover = requests.post(f"{API_BASE}/academic-years/rollover-preview", headers=admin_auth, timeout=40)
    assert rollover.status_code == 200, rollover.text
    rollover_doc = rollover.json()
    assert isinstance(rollover_doc.get("recommended_flow"), list)
    assert len(rollover_doc["recommended_flow"]) >= 4


def test_upload_field_name_file_is_accepted_for_submit(admin_auth, state):
    # Validation module: endpoint accepts legacy `file` and current `files` field names for one-file submissions.
    assignment_resp = requests.post(
        f"{API_BASE}/assignments",
        headers=admin_auth,
        json={
            "class_id": state["class_id"],
            "title": f"File field submit {state['suffix']}",
            "description": "Fresh assignment for legacy file field validation",
            "deadline": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
            "allowed_formats": ["pdf"],
            "rubric": [{"criterion": "File", "weight": 100}],
            "practicum_steps": [],
        },
        timeout=40,
    )
    assert assignment_resp.status_code == 200, assignment_resp.text
    assignment_id = assignment_resp.json()["id"]
    student_auth = {"Authorization": f"Bearer {state['pending_student_token']}"}
    response = requests.post(
        f"{API_BASE}/assignments/{assignment_id}/submit",
        headers=student_auth,
        files={"file": ("wrongfield.pdf", b"wrong", "application/pdf")},
        data={"note": "wrong field name"},
        timeout=40,
    )
    assert response.status_code == 200, response.text
    submission = response.json()
    assert submission["file"]["upload_status"] == "stored_on_server"
