"""Canonical agent adapters with explicit implementation activation.

Never substitute a stub clinical decision for an unavailable specialist.
"""
from __future__ import annotations
from typing import Any
from .module_dispatch import AgentExecution


def drug_extraction_adapter(context: AgentExecution, payload: Any) -> dict:
    """AG01: execute the canonical migrated drug-role agent, scoped per job."""
    if not isinstance(payload, dict) or not isinstance(payload.get("text"), str):
        raise ValueError("AG01 expects text evidence")
    from Agentic_AI.AG01_Drug_Extraction_Classification.src.backend.nexus_agent import NexusDrugRoleAgent
    package = {
        "case_id": context.document_id,
        "evidence_package_id": context.workflow_id,
        "text": payload["text"],
        "source_type": payload.get("source_type", "unknown"),
    }
    # A new instance prevents job-scoped state leaking between executions.
    result = NexusDrugRoleAgent().run(
        tenant_id=context.tenant_id,
        client_id=context.client_id,
        evidence_package=package,
    )
    if not isinstance(result, dict):
        raise ValueError("AG01 returned invalid output")
    result["review_required"] = True
    return result


# Every other agent requires an explicitly registered, verified callable from
# its canonical Agentic_AI/AGxx directory. In particular, the registry currently
# has no runnable canonical AG07, AG16, AG25 or AG27.
CANONICAL_ADAPTERS = {"AG01": drug_extraction_adapter}


def register_verified_adapter(registry: dict, agent_id: str, adapter) -> None:
    """Register only a reviewed canonical implementation, never a mock."""
    if agent_id not in {f"AG{i:02}" for i in range(1, 28)}:
        raise ValueError("Unknown agent ID")
    if not callable(adapter):
        raise TypeError("Adapter must be callable")
    if agent_id in registry:
        raise ValueError("Agent already registered")
    registry[agent_id] = adapter
