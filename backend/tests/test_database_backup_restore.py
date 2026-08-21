"""Validation checks for uploaded database backup files."""

import gzip
import json
import os

import pytest

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")

from backend.server import (  # noqa: E402
    DATABASE_BACKUP_FORMAT,
    DATABASE_BACKUP_VERSION,
    parse_database_backup_payload,
)


def compressed_payload(**overrides):
    payload = {
        "format": DATABASE_BACKUP_FORMAT,
        "version": DATABASE_BACKUP_VERSION,
        "database": "test",
        "created_at": "2026-08-21T00:00:00+00:00",
        "collections": {"users": [{"id": "user-1", "name": "Admin"}]},
    }
    payload.update(overrides)
    return gzip.compress(json.dumps(payload).encode("utf-8"))


def test_backup_parser_accepts_application_backup_and_counts_documents():
    parsed = parse_database_backup_payload(
        compressed_payload(collections={"users": [{"id": "user-1"}], "empty": []})
    )

    assert parsed["document_count"] == 1
    assert parsed["collections"]["users"] == [{"id": "user-1"}]


@pytest.mark.parametrize(
    "content, message",
    [
        (b"not-gzip", "bukan gzip"),
        (compressed_payload(format="unexpected"), "tidak dikenali"),
        (
            compressed_payload(
                collections={"users": [{"id": "same"}, {"id": "same"}]}
            ),
            "duplikat",
        ),
    ],
)
def test_backup_parser_rejects_invalid_or_ambiguous_backups(content, message):
    with pytest.raises(ValueError, match=message):
        parse_database_backup_payload(content)
