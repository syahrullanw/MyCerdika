#!/usr/bin/env python3
"""CLI wrapper untuk rekonsiliasi OLD-SIAP yang digunakan backend."""

from pathlib import Path
import sys


BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from old_siakad_migration import main  # noqa: E402


if __name__ == "__main__":
    main()
