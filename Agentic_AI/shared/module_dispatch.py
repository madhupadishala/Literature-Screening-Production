"""Module-scoped dispatch boundary for canonical Nexus agents.

Production callers must authenticate/authorize before issuing the context envelope.
This module does not pretend to deploy, discover or execute missing agent code.
"""
from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any

from .workflow_context import ContextError, bind_result, verify_context

# Explicit, auditable module contracts. No LLM-based routing.
MODULE_AGENTS = {
    "literature_screening": frozenset(("AG01", "AG02", "AG03", "AG04", "AG08", "AG10",
        "AG11", "AG12", "AG13", "AG17", "AG18", "AG22", "AG25", "AG27")),
    "intake_triage": frozenset(("AG01", "AG02", "AG03", "AG04", "AG05", "AG06",
        "AG07", "AG08", "AG09", "AG10", "AG11", "AG13", "AG16", "AG17",
        "AG19", "AG25", "AG26", "AG27")),
    "case_processing": frozenset(("AG01", "AG02", "AG03", "AG04", "AG05", "AG06",
        "AG07", "AG08", "AG09", "AG10", "AG11", "AG12", "AG13", "AG14",
        "AG15", "AG16", "AG17", "AG19", "AG20", "AG21", "AG23", "AG24", "AG25", "AG27")),
    "submissions": frozenset(("AG01", "AG02", "AG08", "AG09", "AG10", "AG11", "AG12",
        "AG16", "AG20", "AG25", "AG27")),
}
# Mappings are preliminary workflow selections, not regulatory approval or complete
# business rules; other modules are deliberately unconfigured and fail closed.


@dataclass(frozen=True)
class AgentExecution:
    agent_id: str
    module_id: str
    document_id: str
    tenant_id: str
    client_id: str
    workflow_id: str
    job_id: str


class CanonicalAgentDispatcher:
    """One dispatcher, shared agent implementations, isolated per-job executions.

    Workers must be stateless with respect to document content. A queue system
    can supply module-specific channels externally; worker ID does not determine
    tenant, client or output routing.
    """

    def __init__(self, *, signing_secret: bytes,
                 adapters: Mapping[str, Callable[[AgentExecution, Any], dict]]):
        self._secret = signing_secret
        # Adapter bindings are deliberately explicit; absent code fails closed.
        self._adapters = dict(adapters)

    def execute(self, *, agent_id: str, envelope: dict, payload: Any,
                authorized_tenant: str, authorized_client: str) -> dict:
        ctx = verify_context(envelope, expected_agent=agent_id,
                             signing_secret=self._secret,
                             expected_tenant=authorized_tenant,
                             expected_client=authorized_client)
        if agent_id not in MODULE_AGENTS.get(ctx.module_id, frozenset()):
            raise ContextError("agent not authorized for module")
        adapter = self._adapters.get(agent_id)
        if adapter is None:
            raise ContextError("canonical agent adapter not connected")
        execution = AgentExecution(
            agent_id=ctx.agent_id, module_id=ctx.module_id,
            document_id=ctx.document_id, tenant_id=ctx.tenant_id,
            client_id=ctx.client_id, workflow_id=ctx.workflow_id,
            job_id=ctx.job_id)
        output = adapter(execution, payload)
        if not isinstance(output, dict):
            raise ContextError("agent returned non-object output")
        # Forbid ambiguous routing: only the verified envelope supplies keys.
        return bind_result(ctx, output)
