"""Shared validation primitives. No clinical decision, storage or provider access."""
from __future__ import annotations
from collections.abc import Mapping
import re

_SHA256 = re.compile(r"[a-f0-9]{64}")
_SCOPE = re.compile(r"[A-Za-z0-9_.:-]{1,128}")

def exact_concept_score(gold: list[dict], predictions: list[dict], *, fields: tuple[str, ...]) -> dict:
    """Score reference concepts including missing and extra concepts."""
    def keyed(rows):
        out = {}
        for row in rows:
            key = (row["case_id"], row["concept_id"])
            if key in out:
                raise ValueError("duplicate concept")
            out[key] = row
        return out
    g, p = keyed(gold), keyed(predictions)
    common = g.keys() & p.keys()
    correct = {field: sum(bool(g[k].get(field)) and g[k][field] == p[k].get(field)
                          for k in common) for field in fields}
    return {"reference_concepts": len(g), "predicted_concepts": len(p),
            "missing_concepts": len(g.keys() - p.keys()),
            "extra_concepts": len(p.keys() - g.keys()),
            "correct": correct,
            "recall": {field: count / len(g) if g else None for field, count in correct.items()},
            "clinical_qualification": False}

def require_blinded_reference(metadata: Mapping) -> None:
    reviewers = metadata.get("reviewer_ids")
    if (metadata.get("dataset_kind") != "expert_adjudicated"
        or metadata.get("split") != "blinded_test"
        or metadata.get("adjudication_complete") is not True
        or not isinstance(reviewers, list)
        or len({r for r in reviewers if isinstance(r, str) and r.strip()}) < 2):
        raise ValueError("independent clinical adjudication required")

def safe_audit_metadata(*, tenant: str, client: str, case_digest: str,
                        decision_digest: str, event_type: str) -> dict:
    """Allowlisted only: no verbatim, prompt, bearer token or patient identifier."""
    for value in (tenant, client, event_type):
        if not isinstance(value, str) or not _SCOPE.fullmatch(value):
            raise ValueError("invalid audit scope")
    for digest in (case_digest, decision_digest):
        if not isinstance(digest, str) or not _SHA256.fullmatch(digest):
            raise ValueError("invalid audit digest")
    return dict(tenant=tenant, client=client, case_digest=case_digest,
                decision_digest=decision_digest, event_type=event_type)
