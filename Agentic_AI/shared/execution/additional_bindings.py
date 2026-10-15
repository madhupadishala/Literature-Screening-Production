"""Additional canonical specialist bindings with explicit execution gates.

Only bind specialist logic with real execution paths; never fabricate outcomes.
"""
from __future__ import annotations


def translation(evidence: dict, pack) -> dict:
    """AG10: approved private provider required for cross-language translation."""
    from Agentic_AI.AG10_Translation.translation_agent import translate_article
    source_language = evidence.get("source_language")
    target_language = evidence.get("target_language", "English")
    if not isinstance(source_language, str):
        raise ValueError("source_language must be specified by an authorized source")
    text = evidence.get("text", "")
    if not isinstance(text, str) or not text.strip():
        raise ValueError("translation source text is required")
    result = translate_article(
        text, source_language=source_language, target_language=target_language,
        tenant_id=pack.tenant_id, client_id=pack.client_id,
    )
    return result.to_dict()


def validity(evidence: dict, pack) -> dict:
    """AG25: deterministic ICSR minimum-criteria assessment, no LLM guesswork."""
    from Agentic_AI.shared.kimi8_core.schemas import ICSR
    raw = evidence.get("case")
    if not isinstance(raw, dict) or raw.get("case_id") != evidence.get("document_id"):
        raise ValueError("authorized structured ICSR required")
    case = ICSR.model_validate(raw)
    missing = case.missing_minimum_criteria()
    return {
        "agent": "AG25", "case_id": case.case_id,
        "minimum_criteria_met": not missing,
        "missing_criteria": missing,
        "decision": "review_required" if missing else "criteria_present_pending_reviewer",
        "requires_human_review": True,
    }


ADDITIONAL_BINDINGS = {"AG10": translation, "AG25": validity}
