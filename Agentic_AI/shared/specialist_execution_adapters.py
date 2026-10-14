"""Specialist execution bindings for Nexus AG01–AG27.

Only source-backed, callable engines are registered. Unwired agent slots
are recorded explicitly, not silently treated as operational.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any
from .base_execution_adapter import BaseExecutionAdapter, SpecialistBinding

RECOVERED = ("AG07", "AG16", "AG25", "AG27")
CONNECTED = ("AG01",) + RECOVERED
ALL_AGENT_IDS = tuple(f"AG{i:02}" for i in range(1, 28))


@dataclass(frozen=True)
class SpecialistStatus:
    agent_id: str
    connected: bool
    implementation: str
    reason: str


def _ag01(execution: Any, payload: dict, knowledge: dict) -> dict:
    from .canonical_adapters import drug_extraction_adapter
    return drug_extraction_adapter(execution, payload)


def _recovered(agent_id: str):
    def invoke(execution: Any, payload: dict, knowledge: dict) -> dict:
        # Import only the chosen specialist; no eager imports of other engines.
        from .recovered_ag_agents.registry import AGENTS
        cls = AGENTS.get(agent_id)
        if cls is None:
            raise ValueError(f"specialist {agent_id} has no registered implementation")
        result = cls().run(
            text=payload["text"],
            audit_reason="Nexus governed safety evidence assessment for human review",
            context=knowledge,
        ).to_dict()
        if not isinstance(result, dict) or result.get("agent_id") != agent_id:
            raise ValueError("specialist identity or result contract mismatch")
        result["needs_human_review"] = True
        result["auto_release_allowed"] = False
        return result
    return invoke


def build_specialist_adapters() -> dict[str, BaseExecutionAdapter]:
    """Explicitly bind the five confirmed callable engines to Step 1 base."""
    registry = {"AG01": BaseExecutionAdapter(
        SpecialistBinding("AG01", _ag01))}
    for agent_id in RECOVERED:
        registry[agent_id] = BaseExecutionAdapter(
            SpecialistBinding(agent_id, _recovered(agent_id)))
    return registry


def specialist_status() -> list[SpecialistStatus]:
    return [
        SpecialistStatus(
            agent_id=agent_id,
            connected=agent_id in CONNECTED,
            implementation=("canonical_drug_role" if agent_id == "AG01"
                            else "recovered_b2" if agent_id in RECOVERED
                            else "source_present_unmapped"),
            reason=("Callable engine bound through BaseExecutionAdapter"
                    if agent_id in CONNECTED
                    else "Specialist input/output and runtime dependencies require mapping"),
        )
        for agent_id in ALL_AGENT_IDS
    ]
