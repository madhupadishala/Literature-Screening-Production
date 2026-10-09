"""Shared agent base: versioned, register-gated, failure-safe (Phase 4.3)."""
from __future__ import annotations

from ..knowledge_register import KnowledgeRegister
from ..schemas import AgentResult, ResultStatus


class BaseAgent:
    NAME = "base"
    VERSION = "1.0.0"
    REQUIRED_RULES: list[str] = []

    def __init__(self, register: KnowledgeRegister | None = None):
        self.register = register or KnowledgeRegister()
        # Gate: all mandatory rules must be APPROVED before decisions run.
        self.register.require_approved(self.REQUIRED_RULES)

    def result(self, **kwargs) -> AgentResult:
        kwargs.setdefault("regulatory_references", list(self.REQUIRED_RULES))
        return AgentResult(agent=self.NAME, agent_version=self.VERSION, **kwargs)

    def safe_run(self, fn, *args, **kwargs) -> AgentResult:
        """A processing failure must never become a false negative."""
        try:
            return fn(*args, **kwargs)
        except Exception as exc:  # noqa: BLE001 - deliberate failure envelope
            r = self.result(status=ResultStatus.PROCESSING_FAILURE)
            r.uncertainties.append(f"processing failure: {type(exc).__name__}: {exc}")
            r.payload["manual_review"] = True
            return r
