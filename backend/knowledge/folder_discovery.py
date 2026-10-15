"""Discover newly approved Nexus knowledge folders without changing agent bindings.

Every folder/file is discovered at execution time but only an explicitly approved
manifest can enter a signed client-scoped knowledge pack. No automatic document
approval, client scope inference or use of draft content as regulated rules.
"""
from __future__ import annotations
from datetime import date
from pathlib import Path
import hashlib
import json
import re

ALLOWED_EXTENSIONS = {".md", ".txt", ".json"}
SCOPE_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,128}$")

def discover_approved_documents(root, *, tenant_id, client_id, agent_id,
                                jurisdiction=None, as_of=None, query=""):
    """Return citations to approved files, including newly created folders.

    Scope values and manifest must be controlled by trusted server storage.
    Unapproved/unverifiable knowledge is excluded, not silently indexed.
    """
    if not tenant_id or not client_id or not all(
        SCOPE_PATTERN.fullmatch(v) for v in (tenant_id, client_id, agent_id)
    ):
        raise ValueError("explicit authorized tenant, client and agent required")
    base = Path(root).resolve()
    if not base.is_dir():
        raise RuntimeError("knowledge root missing")
    on = date.fromisoformat(str(as_of)) if as_of else date.today()
    tokens = set(re.findall(r"[a-z0-9]{4,}", query.lower()))
    matched = []
    # Filesystem-based discovery means new folders require no hard-coded agent map.
    for manifest in sorted(base.rglob("knowledge.manifest.json")):
        if manifest.is_symlink() or not manifest.resolve().is_relative_to(base):
            continue
        try:
            data = json.loads(manifest.read_text(encoding="utf-8"))
            if data.get("status") != "approved" or not data.get("approved_by"):
                continue
            scopes = data["scope"]
            if scopes.get("tenant_id") not in ("GLOBAL", tenant_id):
                continue
            if scopes.get("tenant_id") != "GLOBAL" and scopes.get("client_id") not in (client_id, "GLOBAL"):
                continue
            if scopes.get("tenant_id") == "GLOBAL" and scopes.get("client_id") != "GLOBAL":
                continue
            if agent_id not in data["agent_scope"] and "GLOBAL" not in data["agent_scope"]:
                continue
            if jurisdiction and jurisdiction not in data["jurisdiction_scope"] and "GLOBAL" not in data["jurisdiction_scope"]:
                continue
            start = date.fromisoformat(data["effective_date"])
            end = date.fromisoformat(data["expiry_date"]) if data.get("expiry_date") else None
            if start > on or (end and end < on):
                continue
            for item in data["documents"]:
                name = item["path"]
                relative = Path(name)
                if relative.is_absolute() or ".." in relative.parts or relative.suffix not in ALLOWED_EXTENSIONS:
                    continue
                path = (manifest.parent / relative).resolve()
                if not path.is_relative_to(manifest.parent.resolve()) or not path.is_relative_to(base):
                    continue
                if not path.is_file() or path.is_symlink():
                    continue
                raw = path.read_bytes()
                if len(raw) > 2_000_000 or hashlib.sha256(raw).hexdigest() != item["sha256"]:
                    continue
                content = raw.decode("utf-8")
                # Candidate discovery is deterministic; downstream decisions still use
                # exact-rule resolution and governed retrieval, not token similarity.
                if tokens and not tokens.intersection(re.findall(r"[a-z0-9]{4,}", content.lower())):
                    continue
                matched.append({
                    "rule_id": item["document_id"],
                    "source": str(path.relative_to(base)),
                    "content_sha256": item["sha256"],
                    "approved_by": data["approved_by"],
                    "knowledge_version": data["version"],
                    "scope": scopes.copy(),
                    "knowledge_type": data["knowledge_type"],
                    "read_only_reference": True,
                })
        except (OSError, ValueError, KeyError, TypeError, UnicodeError, json.JSONDecodeError):
            continue
    return matched
