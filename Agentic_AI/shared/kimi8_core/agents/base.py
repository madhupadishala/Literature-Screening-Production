"""Compatibility base for archived Kimi8 specialists, backed by Nexus KB rules."""
from __future__ import annotations
from Agentic_AI.shared.kimi8_core.schemas import AgentResult, ResultStatus

class BaseAgent:
    NAME = "base"
    VERSION = "1.0.0"
    REQUIRED_RULES = []

    def __init__(self, register=None):
        if register is None:
            raise ValueError("A Nexus-governed rule register is mandatory")
        self.register = register
        self.register.require_approved(self.REQUIRED_RULES)

    def result(self, **kwargs):
        kwargs.setdefault("regulatory_references", list(self.REQUIRED_RULES))
        return AgentResult(agent=self.NAME, agent_version=self.VERSION, **kwargs)

    def safe_run(self, fn, *args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except Exception:
            r = self.result(status=ResultStatus.PROCESSING_FAILURE)
            r.uncertainties.append("Specialist processing failed; manual review is required")
            r.payload["manual_review"] = True
            return r
