"""Executable Nexus clinical gates for approved clinical rule IDs.

These gates consume evidence-grounded facts provided by a validated extraction
adapter; they do not infer clinical facts from free text. Unimplemented rule IDs
raise rather than silently fall back to draft placeholder policy.
"""
from __future__ import annotations
from typing import Any
from backend.knowledge.clinical_rule_store import ClinicalRuleError

IMPLEMENTED_RULES = frozenset({"AE-002", "AE-003", "AE-004", "AE-009"})

def evaluate_approved_gate(rule_id: str, facts: dict[str, Any]) -> dict[str, Any]:
    if rule_id not in IMPLEMENTED_RULES:
        raise ClinicalRuleError(f"{rule_id} has no qualified executable gate")
    if not isinstance(facts, dict):
        raise ClinicalRuleError("Evidence-grounded fact map required")

    if rule_id == "AE-002":
        # No diagnosis or adverse event inference from lab/vital data alone.
        reported = facts.get("explicit_ae_reported")
        if reported is True:
            decision = "ALLOW_REPORTED_EVENT_FOR_REVIEW"
        elif reported is False and facts.get("measurement_only") is True:
            decision = "DO_NOT_CREATE_INFERRED_EVENT"
        else:
            decision = "HUMAN_REVIEW"
    elif rule_id == "AE-003":
        # A commercial complaint is not automatically a clinical event.
        reported = facts.get("explicit_clinical_event")
        if reported is False and facts.get("nonclinical_complaint_only") is True:
            decision = "NO_ADVERSE_EVENT"
        elif reported is True:
            decision = "ALLOW_REPORTED_EVENT_FOR_REVIEW"
        else:
            decision = "HUMAN_REVIEW"
    elif rule_id == "AE-004":
        # Figurative death statements must not be coded as death.
        if facts.get("death_confirmed_from_source") is True:
            decision = "REPORTED_FATAL_OUTCOME_FOR_REVIEW"
        elif facts.get("figurative_death_statement") is True:
            decision = "DO_NOT_INFER_DEATH"
        else:
            decision = "HUMAN_REVIEW"
    else:  # AE-009
        # Severity and seriousness must not be equated.
        if facts.get("severity") == "severe" and facts.get("seriousness_reported") is None:
            decision = "SERIOUSNESS_UNKNOWN"
        elif facts.get("seriousness_reported") in (True, False):
            decision = "RETAIN_INDEPENDENT_SERIOUSNESS"
        else:
            decision = "HUMAN_REVIEW"
    return {"rule_id": rule_id, "decision": decision, "review_required": True,
            "executable": True, "clinical_release_authorized": False}
