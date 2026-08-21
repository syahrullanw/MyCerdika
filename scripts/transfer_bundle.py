#!/usr/bin/env python3
"""Create and restore portable MyCerdika data-transfer bundles.

The bundle intentionally contains application data only:

* a PostgreSQL custom-format dump;
* the complete ``backend/storage`` tree;
* a manifest with SHA-256 checksums.

Environment files, service-account keys, and other credentials are never added.
Restore is preflight-only unless ``--execute`` is supplied explicitly.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple
from urllib.parse import quote, unquote, urlsplit, urlunsplit

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPOSITORY_ROOT / "backend"
STORAGE_ROOT = BACKEND_ROOT / "storage"
BACKUP_ROOT = REPOSITORY_ROOT / "backups"
DEFAULT_BUNDLE = BACKUP_ROOT / "mycerdika-transfer-latest.tar.gz"
BUNDLE_FORMAT = "mycerdika-transfer-bundle"
BUNDLE_FORMAT_VERSION = 1
DATABASE_DUMP_NAME = "database.dump"
STORAGE_ARCHIVE_NAME = "storage.tar.gz"
MANIFEST_NAME = "manifest.json"
DEFAULT_CONTAINER = "backend-postgres-1"
SAFE_DATABASE_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_$-]*$")


class TransferError(RuntimeError):
    """User-facing transfer failure."""


@dataclass(frozen=True)
class DatabaseRuntime:
    mode: str
    database: str
    user: str
    container: str = ""
    database_url: str = ""

    @property
    def label(self) -> str:
        if self.mode == "docker":
            return f"Docker {self.container} / database {self.database}"
        parsed = urlsplit(self.database_url)
        host = parsed.hostname or "local"
        port = f":{parsed.port}" if parsed.port else ""
        return f"PostgreSQL {host}{port} / database {self.database}"


def timestamp() -> str:
    return datetime.now(timezone.utc).astimezone().strftime("%Y%m%d_%H%M%S")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_version() -> str:
    version_file = REPOSITORY_ROOT / "VERSION"
    return version_file.read_text(encoding="utf-8").strip() if version_file.exists() else "unknown"


def human_size(value: int) -> str:
    size = float(value)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if size < 1024 or unit == "TB":
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{value} B"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_dotenv(path: Path) -> Dict[str, str]:
    values: Dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if value and value[0] in {'"', "'"} and value[-1:] == value[0]:
            value = value[1:-1]
        values[key] = value
    return values


def command_available(name: str) -> bool:
    return shutil.which(name) is not None


def run_command(
    command: Sequence[str],
    *,
    stdin_path: Optional[Path] = None,
    stdout_path: Optional[Path] = None,
    env: Optional[Dict[str, str]] = None,
) -> None:
    stdin_handle = stdin_path.open("rb") if stdin_path else None
    stdout_handle = stdout_path.open("wb") if stdout_path else None
    try:
        result = subprocess.run(
            list(command),
            stdin=stdin_handle,
            stdout=stdout_handle if stdout_handle else subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            env=env,
            check=False,
        )
    finally:
        if stdin_handle:
            stdin_handle.close()
        if stdout_handle:
            stdout_handle.close()
    if result.returncode:
        detail = result.stderr.decode("utf-8", errors="replace").strip()
        raise TransferError(detail or f"Perintah gagal dengan kode {result.returncode}")


def running_postgres_containers() -> List[str]:
    if not command_available("docker"):
        return []
    result = subprocess.run(
        ["docker", "ps", "--format", "{{.Names}}\t{{.Image}}"],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=False,
        text=True,
    )
    if result.returncode:
        return []
    containers: List[str] = []
    for line in result.stdout.splitlines():
        name, _, image = line.partition("\t")
        if "postgres" in name.lower() or "postgres" in image.lower():
            containers.append(name.strip())
    return containers


def database_identity_from_url(database_url: str) -> Tuple[str, str]:
    parsed = urlsplit(database_url)
    database = unquote(parsed.path.lstrip("/"))
    user = unquote(parsed.username or "")
    return database, user


def database_url_for_target(database_url: str, database: str) -> str:
    """Return the same connection URL pointed at an explicitly selected DB."""
    parsed = urlsplit(database_url)
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise TransferError("DATABASE_URL harus menggunakan postgres:// atau postgresql://")
    return urlunsplit(
        (parsed.scheme, parsed.netloc, f"/{quote(database, safe='')}", parsed.query, parsed.fragment)
    )


def resolve_runtime(args: argparse.Namespace) -> DatabaseRuntime:
    dotenv = read_dotenv(BACKEND_ROOT / ".env")
    database_url = (
        args.database_url
        or os.environ.get("DATABASE_URL", "")
        or dotenv.get("DATABASE_URL", "")
    ).strip()
    url_database, url_user = database_identity_from_url(database_url) if database_url else ("", "")
    database = (
        args.database
        or os.environ.get("POSTGRES_DB", "")
        or dotenv.get("POSTGRES_DB", "")
        or url_database
        or "elearning_dosen"
    ).strip()
    user = (
        args.user
        or os.environ.get("POSTGRES_USER", "")
        or dotenv.get("POSTGRES_USER", "")
        or url_user
        or "nugaslagi"
    ).strip()
    if not SAFE_DATABASE_NAME.fullmatch(database):
        raise TransferError(f"Nama database tidak aman atau tidak valid: {database!r}")
    if not SAFE_DATABASE_NAME.fullmatch(user):
        raise TransferError(f"Nama user database tidak aman atau tidak valid: {user!r}")

    requested_container = (args.container or os.environ.get("POSTGRES_CONTAINER", "")).strip()
    candidates = running_postgres_containers()
    if requested_container:
        if requested_container not in candidates:
            raise TransferError(f"Container PostgreSQL tidak berjalan: {requested_container}")
        return DatabaseRuntime("docker", database, user, container=requested_container)
    if DEFAULT_CONTAINER in candidates:
        return DatabaseRuntime("docker", database, user, container=DEFAULT_CONTAINER)
    if len(candidates) == 1:
        return DatabaseRuntime("docker", database, user, container=candidates[0])
    if len(candidates) > 1:
        names = ", ".join(candidates)
        raise TransferError(
            "Ada beberapa container PostgreSQL. Tentukan target dengan "
            f"--container NAMA. Kandidat: {names}"
        )
    if not database_url:
        raise TransferError(
            "Container PostgreSQL tidak ditemukan dan DATABASE_URL belum tersedia."
        )
    required = ("pg_dump", "pg_restore", "psql")
    missing = [name for name in required if not command_available(name)]
    if missing:
        raise TransferError("Tool PostgreSQL belum tersedia: " + ", ".join(missing))
    return DatabaseRuntime(
        "native",
        database,
        user,
        database_url=database_url_for_target(database_url, database),
    )


def pg_dump(runtime: DatabaseRuntime, output_path: Path) -> None:
    if runtime.mode == "docker":
        command = [
            "docker",
            "exec",
            runtime.container,
            "pg_dump",
            "-U",
            runtime.user,
            "-d",
            runtime.database,
            "--format=custom",
            "--no-owner",
            "--no-acl",
        ]
    else:
        command = [
            "pg_dump",
            "--format=custom",
            "--no-owner",
            "--no-acl",
            "--username",
            runtime.user,
            "--file=-",
            runtime.database_url,
        ]
    run_command(command, stdout_path=output_path)
    verify_dump_header(output_path)


def pg_restore(runtime: DatabaseRuntime, dump_path: Path) -> None:
    restore_args = [
        "pg_restore",
        "--clean",
        "--if-exists",
        "--no-owner",
        "--no-acl",
        "--single-transaction",
        "--exit-on-error",
        "-U",
        runtime.user,
        "-d",
        runtime.database,
    ]
    if runtime.mode == "docker":
        command = ["docker", "exec", "-i", runtime.container, *restore_args]
    else:
        command = [
            "pg_restore",
            "--clean",
            "--if-exists",
            "--no-owner",
            "--no-acl",
            "--single-transaction",
            "--exit-on-error",
            "--username",
            runtime.user,
            "--dbname",
            runtime.database_url,
        ]
    run_command(command, stdin_path=dump_path)


def verify_database_connection(runtime: DatabaseRuntime) -> None:
    if runtime.mode == "docker":
        command = [
            "docker",
            "exec",
            runtime.container,
            "psql",
            "-U",
            runtime.user,
            "-d",
            runtime.database,
            "-v",
            "ON_ERROR_STOP=1",
            "-Atc",
            "SELECT 1",
        ]
    else:
        command = [
            "psql",
            runtime.database_url,
            "--username",
            runtime.user,
            "-v",
            "ON_ERROR_STOP=1",
            "-Atc",
            "SELECT 1",
        ]
    run_command(command)


def verify_dump_header(path: Path) -> None:
    with path.open("rb") as dump_file:
        if dump_file.read(5) != b"PGDMP":
            raise TransferError(f"Dump PostgreSQL tidak valid: {path}")


def directory_stats(path: Path) -> Dict[str, int]:
    count = 0
    size = 0
    if not path.exists():
        return {"file_count": 0, "size_bytes": 0}
    for item in path.rglob("*"):
        if item.is_symlink():
            raise TransferError(f"Storage mengandung symbolic link yang tidak aman: {item}")
        if item.is_file():
            count += 1
            size += item.stat().st_size
    return {"file_count": count, "size_bytes": size}


def create_storage_archive(source: Path, destination: Path) -> Dict[str, int]:
    if not source.is_dir():
        raise TransferError(f"Direktori storage tidak ditemukan: {source}")
    stats = directory_stats(source)
    with tarfile.open(destination, "w:gz") as archive:
        root_info = archive.gettarinfo(str(source), arcname="storage")
        archive.addfile(root_info)
        for item in sorted(source.rglob("*"), key=lambda entry: entry.as_posix()):
            if item.is_symlink():
                raise TransferError(f"Storage mengandung symbolic link yang tidak aman: {item}")
            relative_name = Path("storage") / item.relative_to(source)
            archive.add(str(item), arcname=relative_name.as_posix(), recursive=False)
    return stats


def safe_members(archive: tarfile.TarFile, destination: Path) -> Iterable[tarfile.TarInfo]:
    root = destination.resolve()
    seen = set()
    for member in archive.getmembers():
        member_path = Path(member.name)
        normalized_name = member_path.as_posix().rstrip("/")
        if normalized_name in seen:
            raise TransferError(f"Arsip berisi path duplikat: {member.name}")
        seen.add(normalized_name)
        if member_path.is_absolute() or ".." in member_path.parts:
            raise TransferError(f"Arsip berisi path tidak aman: {member.name}")
        if (
            member.issym()
            or member.islnk()
            or member.isdev()
            or member.isfifo()
            or not (member.isfile() or member.isdir())
        ):
            raise TransferError(f"Arsip berisi tipe file tidak aman: {member.name}")
        target = (destination / member_path).resolve()
        if target != root and root not in target.parents:
            raise TransferError(f"Arsip mencoba menulis di luar tujuan: {member.name}")
        yield member


def safe_extract(archive_path: Path, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    try:
        with tarfile.open(archive_path, "r:*") as archive:
            members = list(safe_members(archive, destination))
            for member in members:
                target = destination / member.name
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                source = archive.extractfile(member)
                if source is None:
                    raise TransferError(f"Isi arsip tidak dapat dibaca: {member.name}")
                with source, target.open("wb") as output:
                    shutil.copyfileobj(source, output)
    except (tarfile.TarError, OSError) as exc:
        raise TransferError(f"Arsip tidak dapat dibaca: {archive_path}: {exc}") from exc


def validate_manifest(manifest: object) -> Dict[str, object]:
    if not isinstance(manifest, dict):
        raise TransferError("Manifest bundle tidak valid")
    if manifest.get("format") != BUNDLE_FORMAT:
        raise TransferError("Format bundle bukan bundle transfer MyCerdika")
    if manifest.get("format_version") != BUNDLE_FORMAT_VERSION:
        raise TransferError(
            f"Versi format bundle tidak didukung: {manifest.get('format_version')}"
        )
    contents = manifest.get("contents")
    if not isinstance(contents, dict) or DATABASE_DUMP_NAME not in contents:
        raise TransferError("Manifest tidak memuat dump database")
    return manifest


def validate_content(stage: Path, name: str, metadata: object) -> Path:
    if not isinstance(metadata, dict):
        raise TransferError(f"Metadata {name} tidak valid")
    path = stage / name
    if not path.is_file():
        raise TransferError(f"Isi bundle tidak ditemukan: {name}")
    expected_size = metadata.get("size_bytes")
    expected_hash = metadata.get("sha256")
    if expected_size != path.stat().st_size:
        raise TransferError(f"Ukuran {name} tidak sesuai manifest")
    if expected_hash != sha256_file(path):
        raise TransferError(f"Checksum SHA-256 {name} tidak sesuai")
    return path


def load_and_validate_bundle(bundle_path: Path, stage: Path) -> Tuple[Dict[str, object], Path, Optional[Path]]:
    if not bundle_path.is_file():
        raise TransferError(f"Bundle tidak ditemukan: {bundle_path}")
    safe_extract(bundle_path, stage)
    manifest_path = stage / MANIFEST_NAME
    if not manifest_path.is_file():
        raise TransferError("Bundle tidak memiliki manifest.json")
    try:
        manifest = validate_manifest(json.loads(manifest_path.read_text(encoding="utf-8")))
    except (json.JSONDecodeError, OSError) as exc:
        raise TransferError(f"Manifest tidak dapat dibaca: {exc}") from exc
    contents = manifest["contents"]
    assert isinstance(contents, dict)
    database_dump = validate_content(stage, DATABASE_DUMP_NAME, contents[DATABASE_DUMP_NAME])
    verify_dump_header(database_dump)
    storage_archive: Optional[Path] = None
    if STORAGE_ARCHIVE_NAME in contents:
        storage_archive = validate_content(stage, STORAGE_ARCHIVE_NAME, contents[STORAGE_ARCHIVE_NAME])
        with tempfile.TemporaryDirectory(prefix="mycerdika-storage-check-") as check_dir:
            safe_extract(storage_archive, Path(check_dir))
            if not (Path(check_dir) / "storage").is_dir():
                raise TransferError("Arsip storage tidak memiliki direktori storage")
    return manifest, database_dump, storage_archive


def write_bundle(stage: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(destination.name + ".partial")
    if temporary.exists():
        temporary.unlink()
    try:
        with tarfile.open(temporary, "w:gz") as archive:
            for name in (MANIFEST_NAME, DATABASE_DUMP_NAME, STORAGE_ARCHIVE_NAME):
                item = stage / name
                if item.exists():
                    archive.add(str(item), arcname=name, recursive=False)
        temporary.replace(destination)
    finally:
        if temporary.exists():
            temporary.unlink()


def backup_command(args: argparse.Namespace) -> None:
    runtime = resolve_runtime(args)
    destination = Path(args.output).expanduser().resolve() if args.output else (
        BACKUP_ROOT / f"mycerdika-transfer-v{read_version()}-{timestamp()}.tar.gz"
    )
    BACKUP_ROOT.mkdir(parents=True, exist_ok=True)
    print(f"Database : {runtime.label}")
    print(f"Storage  : {STORAGE_ROOT}")
    print(f"Output   : {destination}")
    with tempfile.TemporaryDirectory(prefix="mycerdika-transfer-") as temporary_dir:
        stage = Path(temporary_dir)
        database_dump = stage / DATABASE_DUMP_NAME
        storage_archive = stage / STORAGE_ARCHIVE_NAME
        print("Membuat dump PostgreSQL...")
        pg_dump(runtime, database_dump)
        print("Mengarsipkan file upload...")
        storage_stats = create_storage_archive(STORAGE_ROOT, storage_archive)
        manifest: Dict[str, object] = {
            "format": BUNDLE_FORMAT,
            "format_version": BUNDLE_FORMAT_VERSION,
            "app_version": read_version(),
            "created_at": utc_now(),
            "database": {
                "engine": "postgresql",
                "name": runtime.database,
                "dump_format": "custom",
            },
            "storage": {
                "root": "backend/storage",
                **storage_stats,
            },
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
            "excluded": [
                ".env",
                "database credentials",
                "Google service-account credentials",
                "tokens and private keys",
            ],
        }
        (stage / MANIFEST_NAME).write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        write_bundle(stage, destination)
    latest = Path(args.latest).expanduser().resolve() if args.latest else DEFAULT_BUNDLE
    if destination != latest:
        latest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(destination, latest)
    print(
        f"Backup selesai: {destination} ({human_size(destination.stat().st_size)}), "
        f"{storage_stats['file_count']} file storage."
    )
    print(f"Salinan terbaru: {latest}")


def replace_storage(storage_archive: Path) -> Optional[Path]:
    BACKUP_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(
        prefix="mycerdika-storage-restore-", dir=str(BACKEND_ROOT)
    ) as temporary_dir:
        stage = Path(temporary_dir)
        safe_extract(storage_archive, stage)
        restored_storage = stage / "storage"
        if not restored_storage.is_dir():
            raise TransferError("Direktori storage tidak ditemukan di arsip")
        previous_storage: Optional[Path] = None
        if STORAGE_ROOT.exists():
            previous_storage = BACKUP_ROOT / f"storage-before-restore-{timestamp()}"
            if previous_storage.exists():
                raise TransferError(f"Lokasi pengaman storage sudah ada: {previous_storage}")
            shutil.move(str(STORAGE_ROOT), str(previous_storage))
        try:
            shutil.move(str(restored_storage), str(STORAGE_ROOT))
        except Exception:
            if previous_storage and previous_storage.exists() and not STORAGE_ROOT.exists():
                shutil.move(str(previous_storage), str(STORAGE_ROOT))
            raise
        return previous_storage


def restore_command(args: argparse.Namespace) -> None:
    bundle_path = Path(args.bundle or DEFAULT_BUNDLE).expanduser().resolve()
    restore_database = not args.storage_only
    restore_storage = not args.database_only
    runtime: Optional[DatabaseRuntime] = resolve_runtime(args) if restore_database else None
    with tempfile.TemporaryDirectory(prefix="mycerdika-restore-") as temporary_dir:
        stage = Path(temporary_dir)
        manifest, database_dump, storage_archive = load_and_validate_bundle(bundle_path, stage)
        storage_meta = manifest.get("storage") if isinstance(manifest.get("storage"), dict) else {}
        print(f"Bundle      : {bundle_path}")
        print(f"Versi app   : {manifest.get('app_version', 'unknown')}")
        print(f"Dibuat      : {manifest.get('created_at', '-')}")
        print(f"Ukuran      : {human_size(bundle_path.stat().st_size)}")
        print(f"File storage: {storage_meta.get('file_count', 0)}")
        if runtime:
            print(f"Target DB   : {runtime.label}")
            verify_database_connection(runtime)
        if restore_storage:
            if not storage_archive:
                raise TransferError("Bundle tidak memuat storage")
            print(f"Target file : {STORAGE_ROOT}")
        print("Preflight berhasil: format, checksum, dump database, dan arsip storage valid.")
        if not args.execute:
            print("Belum ada data yang diubah. Tambahkan --execute untuk menjalankan restore.")
            return

        print("PERINGATAN: hentikan backend/worker pada server target selama restore.")
        if runtime:
            pre_restore_dump = BACKUP_ROOT / f"pre-restore-{runtime.database}-{timestamp()}.dump"
            BACKUP_ROOT.mkdir(parents=True, exist_ok=True)
            print(f"Membuat backup pengaman target: {pre_restore_dump}")
            pg_dump(runtime, pre_restore_dump)
            print("Memulihkan database dalam satu transaksi...")
            pg_restore(runtime, database_dump)
        previous_storage: Optional[Path] = None
        if restore_storage and storage_archive:
            print("Mengganti storage dengan salinan dari bundle...")
            previous_storage = replace_storage(storage_archive)
        print("Restore selesai.")
        if previous_storage:
            print(f"Storage sebelumnya diamankan di: {previous_storage}")
        print("Jalankan ulang backend; path file lokal akan disesuaikan otomatis.")


def add_database_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--container", help="Nama container PostgreSQL target")
    parser.add_argument("--database-url", help="DATABASE_URL untuk mode PostgreSQL native")
    parser.add_argument("--database", help="Nama database (default mengikuti environment)")
    parser.add_argument("--user", help="User PostgreSQL (default mengikuti environment)")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Backup dan restore portabel database + storage MyCerdika"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    backup_parser = subparsers.add_parser("backup", help="Buat bundle transfer")
    add_database_arguments(backup_parser)
    backup_parser.add_argument("--output", help="Path bundle keluaran")
    backup_parser.add_argument("--latest", help="Path salinan bundle latest")
    backup_parser.set_defaults(handler=backup_command)

    restore_parser = subparsers.add_parser(
        "restore", help="Periksa atau pulihkan bundle transfer"
    )
    add_database_arguments(restore_parser)
    restore_parser.add_argument(
        "bundle",
        nargs="?",
        help=f"Bundle yang dipulihkan (default: {DEFAULT_BUNDLE})",
    )
    restore_parser.add_argument(
        "--execute",
        action="store_true",
        help="Jalankan restore; tanpa opsi ini hanya preflight",
    )
    mode = restore_parser.add_mutually_exclusive_group()
    mode.add_argument("--database-only", action="store_true", help="Pulihkan database saja")
    mode.add_argument("--storage-only", action="store_true", help="Pulihkan storage saja")
    restore_parser.set_defaults(handler=restore_command)
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        args.handler(args)
        return 0
    except TransferError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("Dibatalkan pengguna.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
