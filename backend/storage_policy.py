"""Pure scheduling rules for attachment storage maintenance."""

from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo

DRIVE_SYNC_MAX_ATTEMPTS_PER_DAY = 5
DRIVE_LOCAL_RETENTION_DAYS = 14
DRIVE_SYNC_RETRY_DELAYS_MINUTES = (5, 30, 120, 360)


def resolve_storage_local_path(storage_base: Path, storage_path: str) -> Optional[Path]:
    """Resolve a portable database storage path below ``backend/storage``.

    Stored file records historically included an absolute ``local_path`` from
    the machine that created them. ``storage_path`` is the portable source of
    truth and must never be allowed to escape the configured storage root.
    """
    normalized = str(storage_path or "").strip().replace("\\", "/")
    if not normalized:
        return None
    relative_path = Path(normalized)
    if relative_path.is_absolute() or ".." in relative_path.parts:
        return None
    storage_root = storage_base.resolve()
    candidate = (storage_root / relative_path).resolve()
    if candidate != storage_root and storage_root not in candidate.parents:
        return None
    return candidate


def portable_storage_path_from_local_path(local_path: str) -> str:
    """Recover ``storage_path`` from an absolute path created on another host."""
    parts = [part for part in str(local_path or "").strip().replace("\\", "/").split("/") if part]
    for index, part in enumerate(parts[:-1]):
        if part.lower() != "storage":
            continue
        remainder = parts[index + 1 :]
        if remainder and remainder[0] in {"E-Learning Dosen", "pmb"}:
            return "/".join(remainder)
    return ""


def parse_policy_datetime(value: str) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def sync_attempt_day(now: datetime, policy_timezone: ZoneInfo) -> str:
    return now.astimezone(policy_timezone).date().isoformat()


def next_drive_retry_at(
    attempts_today: int,
    now: datetime,
    policy_timezone: ZoneInfo,
) -> str:
    """Return a UTC retry timestamp without exceeding the daily attempt cap."""
    current = now if now.tzinfo else now.replace(tzinfo=timezone.utc)
    if attempts_today >= DRIVE_SYNC_MAX_ATTEMPTS_PER_DAY:
        local_now = current.astimezone(policy_timezone)
        next_day = local_now.date() + timedelta(days=1)
        retry = datetime.combine(next_day, time.min, tzinfo=policy_timezone)
    else:
        delay_index = max(0, min(attempts_today - 1, len(DRIVE_SYNC_RETRY_DELAYS_MINUTES) - 1))
        retry = current + timedelta(minutes=DRIVE_SYNC_RETRY_DELAYS_MINUTES[delay_index])
    return retry.astimezone(timezone.utc).isoformat()


def retry_is_due(next_retry_at: str, now: datetime) -> bool:
    scheduled = parse_policy_datetime(next_retry_at)
    if scheduled is None:
        return True
    current = now if now.tzinfo else now.replace(tzinfo=timezone.utc)
    return scheduled <= current


def local_copy_is_expired(
    drive_uploaded_at: str,
    now: datetime,
    retention_days: int = DRIVE_LOCAL_RETENTION_DAYS,
) -> bool:
    uploaded = parse_policy_datetime(drive_uploaded_at)
    if uploaded is None:
        return False
    current = now if now.tzinfo else now.replace(tzinfo=timezone.utc)
    return uploaded <= current - timedelta(days=max(1, retention_days))
