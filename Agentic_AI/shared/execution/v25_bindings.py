"""Executable AG03/AG04/AG09/AG24 bindings to recovered v2.5 clinical engines.

Only trusted server code injects a structured JSON provider. Production must
supply an approved privacy-preserving provider; no fallback or remote call is
performed by this module. All outputs remain unqualified/review-only.
"""
from __future__ import annotations
from hashlib import sha256
from typing import Any

BATCH1_IDS = ("AG03", "AG04", "AG09", "AG24")
BATCH1_ROUTES = {
    "AG03": {"module": "intake_triage", "engine": "PatientAgent", "input": "text"},
    "AG04": {"module": "intake_triage", "engine": "ReporterAgent", "input": "text"},
    "AG09": {"module": "intake_triage", "engine": "DayZeroAgent", "input": "day_zero_input"},
    "AG24": {"module": "case_processing", "engine": "HistoricalAgent", "input": "text"},
}

def make_v25_bindings(llm):
    if llm is None or not callable(getattr(llm, "complete_json", None)):
        raise ValueError("Approved structured LLM adapter implementing complete_json required")

    def source_text(evidence: dict[str, Any]) -> str:
        text = evidence.get("text")
        if not isinstance(text, str) or not text.strip() or len(text) > 100_000:
            raise ValueError("Nonempty bounded authorized source text required")
        return text

    def validated_result(agent_id, result, pack):
        out = result.model_dump(mode="json")
        return {
            "agent_id": agent_id,
            "status": "review_required",
            "requires_human_review": True,
            "qualified_for_autonomous_use": False,
            "scope": {"tenant_id": pack.tenant_id, "client_id": pack.client_id},
            "engine_output": out,
            "rulepack_version": out.get("rulepack_version"),
        }

    def patient(evidence, pack):
        from Agentic_AI.AG03_Patient_Identification.src.v2_5.patient.agent import PatientAgent
        return validated_result("AG03", PatientAgent(llm).run(source_text(evidence)), pack)

    def reporter(evidence, pack):
        from Agentic_AI.AG04_Reporter_Identification.src.v2_5.reporter.agent import ReporterAgent
        return validated_result("AG04", ReporterAgent(llm).run(source_text(evidence)), pack)

    def day_zero(evidence, pack):
        from Agentic_AI.AG09_Clock_Start_Date.src.v2_5.day_zero.agent import DayZeroAgent, DayZeroInput
        raw = evidence.get("day_zero_input")
        if not isinstance(raw, dict) or raw.get("case_id") != evidence.get("document_id"):
            raise ValueError("Authorized day-zero input and matching case ID required")
        inp = DayZeroInput.model_validate(raw)
        if not inp.receipts:
            raise ValueError("At least one source receipt required")
        for receipt in inp.receipts:
            if not receipt.text.strip():
                raise ValueError("Receipt source text required")
        return validated_result("AG09", DayZeroAgent(llm).run(inp), pack)

    def history(evidence, pack):
        from Agentic_AI.AG24_Clinical_History_Capture.src.v2_5.history.agent import HistoricalAgent
        return validated_result("AG24", HistoricalAgent(llm).run(source_text(evidence)), pack)

    return {"AG03": patient, "AG04": reporter, "AG09": day_zero, "AG24": history}
