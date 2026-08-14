"""Regression tests for front auth additions: register, forgot password, change password, unified login."""

import os
import uuid

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
    suffix = uuid.uuid4().hex[:8]
    return {
        "suffix": suffix,
        "student_email": f"reg.student.{suffix}@demo.id",
        "student_nim": f"REG{suffix[:6]}",
        "student_username": f"reg{suffix[:6]}",
        "student_whatsapp": f"62812{suffix[:8]}",
        "student_password": "Mahasiswa123!",
        "student_new_password": f"MhsBaru{suffix}!",
    }


# Auth module: unified login compatibility for seeded admin/student credentials
def test_unified_login_existing_accounts_still_work():
    admin = _login("dosenadmin", "Dosen123!")
    assert admin["user"]["role"] == "admin"
    assert admin["user"]["email"] == "dosen@demo.id"

    student = _login("230001001", "Mahasiswa123!")
    assert student["user"]["role"] == "student"
    assert student["user"]["email"] == "alya@demo.id"


# Register module: create new student account and return active authenticated session
def test_register_student_creates_account_and_returns_token(state):
    payload = {
        "username": state["student_username"],
        "nim": state["student_nim"],
        "name": f"TEST Register {state['suffix']}",
        "email": state["student_email"],
        "whatsapp": state["student_whatsapp"],
        "password": state["student_password"],
    }
    response = requests.post(f"{API_BASE}/auth/register-student", json=payload, timeout=40)
    assert response.status_code == 200, response.text
    data = response.json()
    assert isinstance(data.get("token"), str) and data["token"]
    assert data["user"]["role"] == "student"
    assert data["user"]["email"] == payload["email"].lower()
    assert data["user"]["nim"] == payload["nim"]


# Register/Login module: newly registered account can login by both email and username
def test_registered_student_can_login_with_email_and_username(state):
    by_email = _login(state["student_email"], state["student_password"])
    assert by_email["user"]["email"] == state["student_email"]

    by_username = _login(state["student_username"], state["student_password"])
    assert by_username["user"]["email"] == state["student_email"]


# Forgot-password module: request endpoint is idempotent and creates admin-visible request for known account
def test_forgot_password_request_succeeds_and_visible_in_admin_list(state):
    forgot_response = requests.post(
        f"{API_BASE}/auth/forgot-password",
        json={"identifier": state["student_email"]},
        timeout=40,
    )
    assert forgot_response.status_code == 200, forgot_response.text
    forgot_body = forgot_response.json()
    assert forgot_body["ok"] is True
    assert "permintaan" in forgot_body["message"].lower()

    admin = _login("dosen@demo.id", "Dosen123!")
    admin_headers = {"Authorization": f"Bearer {admin['token']}"}
    list_response = requests.get(f"{API_BASE}/password-reset-requests", headers=admin_headers, timeout=40)
    assert list_response.status_code == 200, list_response.text
    items = list_response.json()
    assert any(item.get("identifier") == state["student_email"].lower() for item in items)


# Forgot-password module: unknown identifier still returns success response (no account enumeration)
def test_forgot_password_unknown_identifier_still_returns_success():
    unknown = f"nouser.{uuid.uuid4().hex[:6]}@demo.id"
    response = requests.post(f"{API_BASE}/auth/forgot-password", json={"identifier": unknown}, timeout=40)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["ok"] is True
    assert "akun" in data["message"].lower()


# Change-password module: registered student changes password and can login using new password
def test_change_password_student_success(state):
    student = _login(state["student_email"], state["student_password"])
    headers = {"Authorization": f"Bearer {student['token']}"}

    change_response = requests.post(
        f"{API_BASE}/auth/change-password",
        json={"current_password": state["student_password"], "new_password": state["student_new_password"]},
        headers=headers,
        timeout=40,
    )
    assert change_response.status_code == 200, change_response.text
    assert change_response.json()["ok"] is True

    login_new = _login(state["student_email"], state["student_new_password"])
    assert login_new["user"]["email"] == state["student_email"]


# Change-password module: endpoint validates wrong current password
def test_change_password_wrong_current_password_rejected(state):
    student = _login(state["student_email"], state["student_new_password"])
    headers = {"Authorization": f"Bearer {student['token']}"}
    response = requests.post(
        f"{API_BASE}/auth/change-password",
        json={"current_password": "SalahBanget123!", "new_password": "AnyNew123!"},
        headers=headers,
        timeout=40,
    )
    assert response.status_code == 400, response.text
    assert "lama" in response.json().get("detail", "").lower()


def test_authenticated_user_can_update_own_profile():
    suffix = uuid.uuid4().hex[:8]
    create_payload = {
        "username": f"profile{suffix}",
        "nim": f"PRF{suffix[:6]}",
        "name": f"TEST Profile Before {suffix}",
        "email": f"profile.before.{suffix}@demo.id",
        "whatsapp": f"62813{suffix[:7]}",
        "password": "Mahasiswa123!",
    }
    register = requests.post(f"{API_BASE}/auth/register-student", json=create_payload, timeout=40)
    assert register.status_code == 200, register.text
    headers = {"Authorization": f"Bearer {register.json()['token']}"}
    update_payload = {
        "name": f"TEST Profile Updated {suffix}",
        "username": f"updated{suffix}",
        "email": f"profile.updated.{suffix}@demo.id",
        "whatsapp": f"62814{suffix[:7]}",
    }
    updated = requests.put(f"{API_BASE}/auth/me", headers=headers, json=update_payload, timeout=40)
    assert updated.status_code == 200, updated.text
    updated_doc = updated.json()
    assert updated_doc["name"] == update_payload["name"]
    assert updated_doc["username"] == update_payload["username"]
    assert updated_doc["email"] == update_payload["email"]
    assert updated_doc["nim"] == create_payload["nim"]

    me_response = requests.get(f"{API_BASE}/auth/me", headers=headers, timeout=40)
    assert me_response.status_code == 200, me_response.text
    assert me_response.json()["email"] == update_payload["email"]


def test_public_branding_matches_saved_application_identity():
    admin = _login("dosenadmin", "Dosen123!")
    headers = {"Authorization": f"Bearer {admin['token']}"}
    settings = requests.get(f"{API_BASE}/settings", headers=headers, timeout=40)
    public = requests.get(f"{API_BASE}/settings/public", timeout=40)
    assert settings.status_code == 200, settings.text
    assert public.status_code == 200, public.text
    settings_doc = settings.json()
    public_doc = public.json()
    assert public_doc["app_name"] == settings_doc["app_name"]
    assert public_doc["campus_name"] == settings_doc["campus_name"]
    assert public_doc["app_logo_url"] == settings_doc["app_logo_url"]
    assert public_doc["campus_logo_url"] == settings_doc["campus_logo_url"]
    assert "campus_address" not in public_doc
