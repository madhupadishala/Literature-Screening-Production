"""Nexus Step 2.6–2.10: source-grounded clinical agent contracts.

These functions normalize externally validated clinical facts; they do not infer
facts from narrative, imply clinical qualification, or activate draft rules.
"""
from __future__ import annotations
from typing import Any
from datetime import date

DOMAINS = {
    "2.6": ("dechallenge_rechallenge", ("DCH-001", "DCH-002", "DCH-003", "RCH-001")),
    "2.7": ("initial_receipt_date", tuple(f"IRD-00{i}" for i in range(1, 7))),
    "2.8": ("medical_history", ("HIST-001",)),
    "2.9": ("remaining_clinical_contracts", ()),
    "2.10": ("schema_harmonization", ()),
}

def evidence_record(item: dict[str, Any], *, required: tuple[str, ...]) -> dict[str, Any]:
    if not isinstance(item, dict):
        raise ValueError("validated clinical fact must be an object")
    if not isinstance(item.get("source_evidence"), str) or not item["source_evidence"].strip():
        raise ValueError("source evidence is required")
    for field in required:
        if not isinstance(item.get(field), str) or not item[field].strip():
            raise ValueError(f"required source-grounded field: {field}")
    return dict(item)

def dechallenge_rechallenge(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep withdrawal, treatment, event response and readministration separate."""
    results = []
    for original in items:
        item = evidence_record(original, required=("product_id", "event_id"))
        # A withdrawal alone is not evidence of a positive dechallenge.
        if item.get("dechallenge") == "positive" and not (
            item.get("event_improved_after_withdrawal") is True
            and item.get("improvement_source_evidence")
        ):
            raise ValueError("positive dechallenge requires documented event response")
        if item.get("rechallenge") == "positive" and not (
            item.get("readministration_confirmed") is True
            and item.get("recurrence_source_evidence")
        ):
            raise ValueError("positive rechallenge requires documented readministration and recurrence")
        results.append(item)
    return results

def day_zero_receipts(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Retain every reported awareness/validity/receipt timestamp and recipient."""
    return [evidence_record(item, required=("receipt_date", "recipient_type"))
            for item in items]

def medical_history(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep patient linkage, condition and its source evidence; never invent dates."""
    return [evidence_record(item, required=("patient_id", "reported_condition"))
            for item in items]

def derive_day_zero(items: list[dict[str, Any]]) -> dict[str, Any]:
    """Determine a candidate ONLY from explicitly validated qualifying receipts.

    Validity completion and jurisdiction/client interpretation must be supplied
    upstream; an unqualified receipt must never become Day Zero by date alone.
    """
    candidates = []
    for row in day_zero_receipts(items):
        try:
            parsed = date.fromisoformat(row["receipt_date"])
        except ValueError as exc:
            raise ValueError("receipt_date must be an exact ISO calendar date") from exc
        if row.get("qualifying_mah_receipt") is True and row.get("icsr_valid_at_receipt") is True:
            candidates.append((parsed, row))
    if not candidates:
        return {"day_zero": None, "status": "REVIEW_REQUIRED",
                "rationale": "No source-validated qualifying receipt with all ICSR validity criteria"}
    first = min(candidates, key=lambda pair: pair[0])
    return {"day_zero": first[0].isoformat(), "status": "CANDIDATE_FOR_REVIEW",
            "source_evidence": first[1]["source_evidence"],
            "rationale": "Earliest validated qualifying MAH receipt; policy review still required"}


def normalize_clinical_packet(packet: dict[str, Any]) -> dict[str, Any]:
    """Stable plug-in boundary for clinical modules; preserve provenance."""
    if not isinstance(packet, dict) or not isinstance(packet.get("case_id"), str):
        raise ValueError("case_id is required")
    allowed = {"case_id", "dechallenge_rechallenge", "receipt_events", "medical_history"}
    if set(packet) - allowed:
        raise ValueError("unknown clinical packet fields")
    return {
        "schema_version": "nexus.clinical_shared/1",
        "case_id": packet["case_id"],
        "dechallenge_rechallenge": dechallenge_rechallenge(packet.get("dechallenge_rechallenge", [])),
        "receipt_events": day_zero_receipts(packet.get("receipt_events", [])),
        "day_zero_candidate": derive_day_zero(packet.get("receipt_events", [])),
        "medical_history": medical_history(packet.get("medical_history", [])),
        "requires_clinical_review": True,
        "clinical_release_authorized": False,
    }
