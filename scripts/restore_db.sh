#!/usr/bin/env bash
# Memeriksa bundle secara default; perubahan data membutuhkan opsi --execute.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec "${PYTHON:-python3}" "${PROJECT_ROOT}/scripts/transfer_bundle.py" restore "$@"
