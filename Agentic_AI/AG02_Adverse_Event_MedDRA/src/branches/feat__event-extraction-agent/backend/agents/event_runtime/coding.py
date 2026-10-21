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
        if not data.get("version") or data.get("license_confirmed") is not True:
            raise ValueError("version and license confirmation are required")
        self.version = data["version"]
        self.index = {}
        hierarchy = {}
        for term in data["terms"]:
            required = {"llt_code", "llt_name", "pt_code", "pt_name", "language", "current"}
            if not isinstance(term, dict) or not required.issubset(term) or term["current"] is not True:
                continue
            for key in ("llt_code", "pt_code"):
                code = term[key]
                if not isinstance(code, str) or len(code) != 8 or not code.isascii() or not code.isdecimal():
                    raise ValueError("invalid MedDRA code")
            mapping = (term["pt_code"], term["pt_name"])
            if term["llt_code"] in hierarchy and hierarchy[term["llt_code"]] != mapping:
                raise ValueError("conflicting LLT to PT mapping")
            hierarchy[term["llt_code"]] = mapping
            self.index.setdefault((term["language"], term["llt_name"].casefold()), []).append(term)
    def suggest(self, text: str, language: str):
        matches = self.index.get((language, text.casefold()), [])
        if len({(m["llt_code"], m["pt_code"]) for m in matches}) != 1:
            return None
        return {**matches[0], "version": self.version, "method": "exact_llt",
                "approved": False, "review_required": True}
