"""Regression coverage for Drive retry and local-retention rules."""

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from backend.storage_policy import (
    DRIVE_LOCAL_RETENTION_DAYS,
    DRIVE_SYNC_MAX_ATTEMPTS_PER_DAY,
    local_copy_is_expired,
    next_drive_retry_at,
    portable_storage_path_from_local_path,
    resolve_storage_local_path,
    retry_is_due,
    sync_attempt_day,
)

JAKARTA = ZoneInfo("Asia/Jakarta")


def test_drive_sync_retry_uses_five_attempt_daily_cap():
    now = datetime(2026, 7, 24, 8, 0, tzinfo=timezone.utc)

    assert DRIVE_SYNC_MAX_ATTEMPTS_PER_DAY == 5
    first_retry = datetime.fromisoformat(next_drive_retry_at(1, now, JAKARTA))
    fourth_retry = datetime.fromisoformat(next_drive_retry_at(4, now, JAKARTA))
    capped_retry = datetime.fromisoformat(next_drive_retry_at(5, now, JAKARTA))

    assert first_retry == now + timedelta(minutes=5)
    assert fourth_retry == now + timedelta(hours=6)
    assert capped_retry.astimezone(JAKARTA).hour == 0
    assert capped_retry.astimezone(JAKARTA).date().isoformat() == "2026-07-25"


def test_attempt_day_follows_configured_policy_timezone():
    before_jakarta_midnight = datetime(2026, 7, 24, 16, 59, tzinfo=timezone.utc)
    after_jakarta_midnight = before_jakarta_midnight + timedelta(minutes=2)

    assert sync_attempt_day(before_jakarta_midnight, JAKARTA) == "2026-07-24"
    assert sync_attempt_day(after_jakarta_midnight, JAKARTA) == "2026-07-25"


def test_synced_local_copy_expires_only_after_fourteen_days():
    now = datetime(2026, 7, 24, 8, 0, tzinfo=timezone.utc)

    assert DRIVE_LOCAL_RETENTION_DAYS == 14
    assert local_copy_is_expired((now - timedelta(days=14)).isoformat(), now)
    assert not local_copy_is_expired(
        (now - timedelta(days=13, hours=23, minutes=59)).isoformat(),
        now,
    )
    assert not local_copy_is_expired("", now)


def test_retry_due_accepts_empty_schedule_and_respects_future_time():
    now = datetime(2026, 7, 24, 8, 0, tzinfo=timezone.utc)

    assert retry_is_due("", now)
    assert retry_is_due((now - timedelta(seconds=1)).isoformat(), now)
    assert not retry_is_due((now + timedelta(seconds=1)).isoformat(), now)


def test_portable_storage_path_is_rebased_below_current_storage_root(tmp_path):
    storage_root = tmp_path / "backend" / "storage"

    resolved = resolve_storage_local_path(
        storage_root,
        "E-Learning Dosen/Tugas/mahasiswa/bukti.pdf",
    )

    assert resolved == (
        storage_root / "E-Learning Dosen" / "Tugas" / "mahasiswa" / "bukti.pdf"
    ).resolve()


def test_portable_storage_path_rejects_absolute_and_parent_traversal(tmp_path):
    storage_root = tmp_path / "backend" / "storage"

    assert resolve_storage_local_path(storage_root, "/etc/passwd") is None
    assert resolve_storage_local_path(storage_root, "../secrets.env") is None
    assert resolve_storage_local_path(storage_root, "E-Learning Dosen/../../secrets.env") is None
    assert resolve_storage_local_path(storage_root, "") is None


def test_portable_storage_path_is_inferred_from_old_mac_or_windows_path():
    assert portable_storage_path_from_local_path(
        "/Users/operator/MyCerdika/backend/storage/E-Learning Dosen/Branding/logo.png"
    ) == "E-Learning Dosen/Branding/logo.png"
    assert portable_storage_path_from_local_path(
        r"D:\apps\MyCerdika\backend\storage\pmb\branding\logo.png"
    ) == "pmb/branding/logo.png"
    assert portable_storage_path_from_local_path("/tmp/unrelated/logo.png") == ""
