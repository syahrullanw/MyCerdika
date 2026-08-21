"""Safety and integrity checks for portable data-transfer bundles."""

import io
import json
import tarfile

import pytest

from scripts import transfer_bundle
from scripts.transfer_bundle import (
    BUNDLE_FORMAT,
    BUNDLE_FORMAT_VERSION,
    DATABASE_DUMP_NAME,
    MANIFEST_NAME,
    STORAGE_ARCHIVE_NAME,
    TransferError,
    create_storage_archive,
    database_url_for_target,
    load_and_validate_bundle,
    safe_extract,
    sha256_file,
    write_bundle,
)


def test_valid_bundle_preserves_database_and_storage_with_checksums(tmp_path):
    stage = tmp_path / "stage"
    stage.mkdir()
    database_dump = stage / DATABASE_DUMP_NAME
    database_dump.write_bytes(b"PGDMP-portable-test")

    storage_source = tmp_path / "storage-source"
    stored_file = storage_source / "E-Learning Dosen" / "Tugas" / "bukti.txt"
    stored_file.parent.mkdir(parents=True)
    stored_file.write_text("bukti transfer", encoding="utf-8")
    storage_archive = stage / STORAGE_ARCHIVE_NAME
    stats = create_storage_archive(storage_source, storage_archive)

    manifest = {
        "format": BUNDLE_FORMAT,
        "format_version": BUNDLE_FORMAT_VERSION,
        "app_version": "test",
        "created_at": "2026-08-21T00:00:00+00:00",
        "storage": stats,
        "contents": {
            DATABASE_DUMP_NAME: {
                "size_bytes": database_dump.stat().st_size,
                "sha256": sha256_file(database_dump),
            },
            STORAGE_ARCHIVE_NAME: {
                "size_bytes": storage_archive.stat().st_size,
                "sha256": sha256_file(storage_archive),
            },
        },
    }
    (stage / MANIFEST_NAME).write_text(json.dumps(manifest), encoding="utf-8")
    bundle = tmp_path / "transfer.tar.gz"
    write_bundle(stage, bundle)

    extracted = tmp_path / "extracted"
    loaded_manifest, loaded_database, loaded_storage = load_and_validate_bundle(
        bundle,
        extracted,
    )

    assert loaded_manifest["app_version"] == "test"
    assert loaded_database.read_bytes() == b"PGDMP-portable-test"
    assert loaded_storage is not None
    assert stats == {"file_count": 1, "size_bytes": len("bukti transfer")}


def test_bundle_rejects_checksum_mismatch(tmp_path):
    stage = tmp_path / "stage"
    stage.mkdir()
    database_dump = stage / DATABASE_DUMP_NAME
    database_dump.write_bytes(b"PGDMP-original")
    manifest = {
        "format": BUNDLE_FORMAT,
        "format_version": BUNDLE_FORMAT_VERSION,
        "contents": {
            DATABASE_DUMP_NAME: {
                "size_bytes": database_dump.stat().st_size,
                "sha256": "0" * 64,
            }
        },
    }
    (stage / MANIFEST_NAME).write_text(json.dumps(manifest), encoding="utf-8")
    bundle = tmp_path / "tampered.tar.gz"
    write_bundle(stage, bundle)

    with pytest.raises(TransferError, match="Checksum"):
        load_and_validate_bundle(bundle, tmp_path / "extracted")


def test_safe_extract_rejects_parent_directory_traversal(tmp_path):
    archive_path = tmp_path / "malicious.tar.gz"
    payload = b"do not write outside destination"
    with tarfile.open(archive_path, "w:gz") as archive:
        member = tarfile.TarInfo("../outside.txt")
        member.size = len(payload)
        archive.addfile(member, io.BytesIO(payload))

    with pytest.raises(TransferError, match="path tidak aman"):
        safe_extract(archive_path, tmp_path / "destination")

    assert not (tmp_path / "outside.txt").exists()


def test_storage_restore_keeps_recoverable_copy_of_previous_files(tmp_path, monkeypatch):
    backend_root = tmp_path / "backend"
    current_storage = backend_root / "storage"
    backup_root = tmp_path / "backups"
    current_storage.mkdir(parents=True)
    (current_storage / "old.txt").write_text("old data", encoding="utf-8")

    source_storage = tmp_path / "new-storage"
    source_storage.mkdir()
    (source_storage / "new.txt").write_text("new data", encoding="utf-8")
    archive = tmp_path / "storage.tar.gz"
    create_storage_archive(source_storage, archive)

    monkeypatch.setattr(transfer_bundle, "BACKEND_ROOT", backend_root)
    monkeypatch.setattr(transfer_bundle, "STORAGE_ROOT", current_storage)
    monkeypatch.setattr(transfer_bundle, "BACKUP_ROOT", backup_root)

    previous_storage = transfer_bundle.replace_storage(archive)

    assert (current_storage / "new.txt").read_text(encoding="utf-8") == "new data"
    assert previous_storage is not None
    assert (previous_storage / "old.txt").read_text(encoding="utf-8") == "old data"


def test_native_database_url_keeps_credentials_but_targets_selected_database():
    target = database_url_for_target(
        "postgresql://operator:secret@db.internal:5432/old_db?sslmode=require",
        "mycerdika_online",
    )

    assert target == (
        "postgresql://operator:secret@db.internal:5432/"
        "mycerdika_online?sslmode=require"
    )
