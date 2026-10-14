"""Common execution lifecycle for all Nexus specialist agents.

Step 1 foundation: no specialist agents are auto-registered by this module.
The trusted dispatcher verifies signed identity/module authorization first.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Callable
from .governed_knowledge_adapter import resolve_agent_knowledge_adapter

MAX_TEXT_LENGTH = 100_000

class ExecutionContractError(ValueError):
    """Invalid or unauthorized execution input."""


@dataclass(frozen=True)
class SpecialistBinding:
    agent_id: str
    invoke: Callable[[Any, dict, dict], dict]


class BaseExecutionAdapter:
    """Stateless, fail-closed execution wrapper for a single specialist.

    This class deliberately does not perform network retrieval: the Nexus
    backend must retrieve and authorize controlled knowledge beforehand.
    """

    def __init__(self, binding: SpecialistBinding):
        if not callable(binding.invoke):
            raise TypeError("specialist invoke must be callable")
        if not isinstance(binding.agent_id, str) or not (
            len(binding.agent_id) == 4 and binding.agent_id[:2] == "AG"
            and binding.agent_id[2:].isdigit() and 1 <= int(binding.agent_id[2:]) <= 27
        ):
            raise ExecutionContractError("unknown specialist")
        self._binding = binding

    @property
    def agent_id(self) -> str:
        return self._binding.agent_id

    def __call__(self, execution: Any, payload: Any) -> dict:
        if execution.agent_id != self.agent_id:
            raise ExecutionContractError("agent binding mismatch")
        if not isinstance(payload, dict):
            raise ExecutionContractError("payload must be an object")
        source = payload.get("text")
        if not isinstance(source, str) or not source.strip() or len(source) > MAX_TEXT_LENGTH:
            raise ExecutionContractError("source text is missing or too long")
        # Re-evaluate the KB scope at the specialist boundary, even if a caller
        # already supplied resolved_governed_context; never trust that field.
        context = resolve_agent_knowledge_adapter(self.agent_id)(execution, payload)
        specialist_result = self._binding.invoke(execution, payload, context)
        if not isinstance(specialist_result, dict):
            raise ExecutionContractError("specialist returned invalid result")
        if any(k in specialist_result for k in ("routing", "execution_context")):
            raise ExecutionContractError("specialist cannot supply trusted routing")
        # Never silently allow a PV specialist's result to become an
        # automatically released regulated decision.
        output = dict(specialist_result)
        output["review_required"] = True
        output["auto_release_allowed"] = False
        output["knowledge_provenance"] = {
            "tenant_id": execution.tenant_id,
            "client_id": execution.client_id,
            "manifest_sha256": context["repository_manifest_sha256"],
            "citation_ids": [c["citationId"] for c in context["citations"]],
        }
        output["execution_context"] = {
            "agent_id": self.agent_id,
            "module_id": execution.module_id,
            "document_id": execution.document_id,
            "workflow_id": execution.workflow_id,
            "job_id": execution.job_id,
        }
        return output
