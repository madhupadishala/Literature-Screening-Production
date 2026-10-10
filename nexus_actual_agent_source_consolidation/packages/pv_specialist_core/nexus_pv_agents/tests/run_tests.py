"""Minimal executable test harness (pytest unavailable in this environment).

Discovers test_* functions in tests/test_*.py, executes them, and reports
real results. Exit code 0 only if every test passes.
"""
from __future__ import annotations

import importlib.util
import sys
import time
import traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))


def load_module(path: Path):
    spec = importlib.util.spec_from_file_location(path.stem, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    passed = failed = 0
    failures = []
    started = time.time()
    for path in sorted(HERE.glob("test_*.py")):
        mod = load_module(path)
        for name in sorted(dir(mod)):
            if not name.startswith("test_"):
                continue
            fn = getattr(mod, name)
            if not callable(fn):
                continue
            try:
                fn()
                passed += 1
                print(f"PASS {path.stem}::{name}")
            except Exception as exc:  # noqa: BLE001
                failed += 1
                failures.append((path.stem, name, traceback.format_exc()))
                print(f"FAIL {path.stem}::{name}: {exc}")
    dur = time.time() - started
    print(f"\n{passed} passed, {failed} failed in {dur:.2f}s")
    for mod, name, tb in failures:
        print(f"\n--- FAILURE {mod}::{name}\n{tb}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
