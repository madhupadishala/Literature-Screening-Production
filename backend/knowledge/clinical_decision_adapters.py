"""Nexus shared clinical agentic decision services, Step 2.6-2.10.

All conclusions require structured source-grounded findings. Missing facts resolve
to UNKNOWN/REVIEW; never turn an NLP guess into authoritative safety state.
"""
from __future__ import annotations
from datetime import date
from typing import Any
from backend.knowledge.shared_clinical_contracts import (
    evidence_record, dechallenge_rechallenge, day_zero_receipts,
    medical_history, derive_day_zero, normalize_clinical_packet,
)

SCHEMA_VERSION = "nexus.clinical_decisions/1"

def _date(value):
    return date.fromisoformat(value) if isinstance(value, str) and value else None

def assess_drug_event_pair(item: dict[str, Any]) -> dict[str, Any]:
    row = dechallenge_rechallenge([item])[0]
    withdrawal = row.get("withdrawal_or_reduction_confirmed") is True
    improvement = row.get("event_improved_after_withdrawal") is True
    treatment = row.get("ae_specific_treatment_confirmed") is True
    no_improvement = row.get("documented_no_improvement") is True
    action_date, course_date = _date(row.get("action_date")), _date(row.get("event_course_date"))
    chronology = action_date is not None and course_date is not None and course_date >= action_date
    if withdrawal and chronology and improvement and row.get("improvement_source_evidence"):
        dechallenge = "not_applicable" if treatment else "positive"
    elif withdrawal and chronology and no_improvement and row.get("no_improvement_source_evidence"):
        dechallenge = "negative"
    else:
        dechallenge = "unknown"
    if dechallenge in ("unknown", "not_applicable"):
        rechallenge = "not_applicable"
    elif (row.get("readministration_confirmed") is True
          and row.get("recurrence_after_readministration") is True
          and row.get("recurrence_source_evidence")
          and _date(row.get("readministration_date"))
          and _date(row.get("recurrence_date"))
          and _date(row["recurrence_date"]) >= _date(row["readministration_date"])):
        rechallenge = "positive"
    else:
        rechallenge = "unknown"
    return {
        "product_id": row["product_id"], "event_id": row["event_id"],
        "dechallenge": dechallenge, "rechallenge": rechallenge,
        "source_evidence": row["source_evidence"],
        "readministration_evidence": row.get("recurrence_source_evidence"),
        "requires_clinical_review": True,
        "rule_ids": ["DCH-001","DCH-002","DCH-003","RCH-001"],
    }

def resolve_day_zero(items: list[dict[str, Any]]) -> dict[str, Any]:
    rows = day_zero_receipts(items)
    qualified = []
    for row in rows:
        dt = _date(row["receipt_date"])
        if dt is None:
            raise ValueError("Exact receipt_date required")
        if row.get("qualifying_mah_receipt") is not True or row.get("icsr_valid_at_receipt") is not True:
            continue
        kind = row.get("source_type", "direct_mah")
        if kind in ("partner", "literature", "third_party_social", "owned_social"):
            if row.get("authorized_source_policy") is not True:
                continue
        qualified.append((dt, row))
    if not qualified:
        return {"day_zero": None, "status": "REVIEW_REQUIRED", "source_evidence": None}
    dt, row = min(qualified, key=lambda x: x[0])
    return {"day_zero": dt.isoformat(), "status": "CANDIDATE_FOR_REVIEW",
            "recipient_type": row["recipient_type"], "source_evidence": row["source_evidence"],
            "source_type": row.get("source_type", "direct_mah"),
            "rule_ids": ["IRD-001","IRD-002","IRD-003","IRD-004","IRD-005","IRD-006"]}

def unify_medical_history(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result = []
    for original in medical_history(items):
        item = dict(original)
        item["category"] = "social_history" if item.get("history_type") in (
            "alcohol","tobacco","recreational_substance","suicidal_history","social"
        ) else "medical_history"
        item["source_type"] = item.get("source_type", "unspecified")
        item["rule_ids"] = ["HIST-001"]
        result.append(item)
    return result

class NexusClinicalDecisionAdapter:
    """One shared, call-ready boundary for specialist agents and orchestration."""
    def __init__(self, agent_name: str):
        self.agent_name = agent_name

    def run(self, *, tenant_id: str, client_id: str, packet: dict[str, Any]) -> dict[str, Any]:
        if not tenant_id or not client_id or not isinstance(packet, dict):
            raise ValueError("Explicit tenant, client, and packet required")
        normalized = normalize_clinical_packet(packet)
        normalized["schema_version"] = SCHEMA_VERSION
        normalized["tenant_id"] = tenant_id
        normalized["client_id"] = client_id
        normalized["agent_name"] = self.agent_name
        normalized["dechallenge_rechallenge_decisions"] = [
            assess_drug_event_pair(x) for x in normalized["dechallenge_rechallenge"]
        ]
        normalized["day_zero_candidate"] = resolve_day_zero(normalized["receipt_events"])
        normalized["medical_history"] = unify_medical_history(normalized["medical_history"])
        normalized["clinical_release_authorized"] = False
        return normalized
