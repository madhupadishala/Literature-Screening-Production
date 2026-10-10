"""Exact-match coding with an externally supplied, licensed dictionary export.
No LLM-generated MedDRA codes. No terminology corpus shipped in this package.
"""
import json
from hashlib import sha256
from pathlib import Path

class MedDRADictionary:
    def __init__(self, path: str):
        raw = Path(path).read_bytes()
        self.fingerprint = sha256(raw).hexdigest()
        data = json.loads(raw)
        if not data.get("version") or not data.get("license_confirmed"):
            raise ValueError("version and license confirmation are required")
        self.version = data["version"]
        self.index = {}
        for term in data["terms"]:
            required = {"llt_code", "llt_name", "pt_code", "pt_name", "language", "current"}
            if set(term) != required or not term["current"]:
                continue
            self.index.setdefault((term["language"], term["llt_name"].casefold()), []).append(term)
    def suggest(self, text: str, language: str):
        matches = self.index.get((language, text.casefold()), [])
        if len(matches) != 1:
            return None
        return {**matches[0], "version": self.version, "method": "exact_llt",
                "approved": False, "review_required": True}
