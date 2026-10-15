"""Opt-in recovered v2.5 specialists; requires a server-injected approved LLM adapter."""
from __future__ import annotations


def make_v25_bindings(llm):
    if llm is None or not callable(getattr(llm, "complete", None)):
        # Recovered common.LLMClient interface requires structured completion.
        raise ValueError("Approved server-side structured LLM adapter required")

    def source_text(evidence):
        text = evidence.get("text")
        if not isinstance(text, str) or not text.strip():
            raise ValueError("source text required")
        return text

    def patient(evidence, pack):
        from Agentic_AI.AG03_Patient_Identification.src.v2_5.patient.agent import PatientAgent
        return PatientAgent(llm).run(source_text(evidence)).model_dump(mode="json")

    def reporter(evidence, pack):
        from Agentic_AI.AG04_Reporter_Identification.src.v2_5.reporter.agent import ReporterAgent
        return ReporterAgent(llm).run(source_text(evidence)).model_dump(mode="json")

    def day_zero(evidence, pack):
        from Agentic_AI.AG09_Clock_Start_Date.src.v2_5.day_zero.agent import DayZeroAgent, DayZeroInput
        incoming = evidence.get("day_zero_input")
        if not isinstance(incoming, dict) or incoming.get("case_id") != evidence.get("document_id"):
            raise ValueError("authorized day-zero input with matching case ID required")
        return DayZeroAgent(llm).run(DayZeroInput.model_validate(incoming)).model_dump(mode="json")

    def history(evidence, pack):
        from Agentic_AI.AG24_Clinical_History_Capture.src.v2_5.history.agent import HistoricalAgent
        return HistoricalAgent(llm).run(source_text(evidence)).model_dump(mode="json")

    return {"AG03": patient, "AG04": reporter, "AG09": day_zero, "AG24": history}
