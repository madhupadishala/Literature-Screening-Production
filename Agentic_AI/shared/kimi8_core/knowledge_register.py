"""Controlled regulatory knowledge register (Phase 1.3).

Rules may only drive decisions when approval_status == APPROVED.
Online discovery never overwrites this store (Phase 1.2).
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Optional

_DEFAULT_PATH = Path(__file__).resolve().parent.parent / "data" / "regulatory_register.json"


class KnowledgeRegister:
    def __init__(self, path: str | Path = _DEFAULT_PATH):
        self.path = Path(path)
        raw = json.loads(self.path.read_text(encoding="utf-8"))
        self.register_id = raw["register_id"]
        self.register_version = raw["register_version"]
        self.checksum = hashlib.sha256(self.path.read_bytes()).hexdigest()
        self.entries = {e["requirement_id"]: e for e in raw["entries"]}

    def get(self, requirement_id: str) -> dict:
        return self.entries[requirement_id]

    def approved(self, requirement_id: str) -> bool:
        return self.entries[requirement_id]["approval_status"] == "APPROVED"

    def rules_for_agent(self, agent: str, approved_only: bool = True) -> list[dict]:
        out = []
        for e in self.entries.values():
            if agent in e.get("applicable_agents", []):
                if approved_only and e["approval_status"] != "APPROVED":
                    continue
                out.append(e)
        return out

    def require_approved(self, requirement_ids: list[str]) -> None:
        """Hard gate: refuse to run decision logic on unapproved knowledge."""
        blocked = [r for r in requirement_ids if not self.approved(r)]
        if blocked:
            raise PermissionError(f"Knowledge not approved for decision use: {blocked}")

    def summary(self) -> dict:
        return {
            "register_id": self.register_id,
            "version": self.register_version,
            "checksum_sha256": self.checksum,
            "entries": len(self.entries),
        }
