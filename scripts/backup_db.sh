#!/usr/bin/env bash
# Membuat satu bundle portabel berisi PostgreSQL + backend/storage + checksum.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec "${PYTHON:-python3}" "${PROJECT_ROOT}/scripts/transfer_bundle.py" backup "$@"
