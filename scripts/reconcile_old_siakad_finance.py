#!/usr/bin/env python3
"""CLI wrapper dry-run/migrasi pembiayaan OLD-SIAKAD."""

from pathlib import Path
import sys


BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from old_siakad_finance_migration import main  # noqa: E402


if __name__ == "__main__":
    main()
