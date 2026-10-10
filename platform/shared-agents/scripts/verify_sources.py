#!/usr/bin/env python3
"""Source migration verification, not clinical qualification."""
from pathlib import Path
import ast
import json
import hashlib
import sys

root = Path(__file__).resolve().parents[2]
p = root / "platform/shared-agents"
catalog = json.loads((p / "AGENT_CATALOG.json").read_text())
errors = []
count = 0
for entry in catalog["agents"]:
    for item in entry["files"]:
        src = root / item["source"]
        dest = root / item["canonical"]
        if not src.is_file() or not dest.is_file():
            errors.append("missing source or staged file: " + item["canonical"])
            continue
        if src.read_bytes() != dest.read_bytes():
            errors.append("different content: " + item["canonical"])
        if src.suffix == ".py":
            try:
                ast.parse(dest.read_text(encoding="utf-8"), filename=str(dest))
            except Exception as exc:
                errors.append(f"Python syntax: {dest}: {exc}")
        count += 1
print(f"Checked {count} migrated source files in {len(catalog['agents'])} directories")
if errors:
    print("\n".join(errors), file=sys.stderr)
    sys.exit(1)
print("PASS: matching source hashes (content equality), paths and Python syntax")
