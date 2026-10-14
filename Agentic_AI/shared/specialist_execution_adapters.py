"""Specialist execution bindings for Nexus AG01–AG27.

Only source-backed, callable engines are registered. Unwired agent slots
are recorded explicitly, not silently treated as operational.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any
from .base_execution_adapter import BaseExecutionAdapter, SpecialistBinding

RECOVERED = ("AG07", "AG16", "AG25", "AG27")
NATIVE = ("AG05", "AG10")
CONNECTED = ("AG01",) + RECOVERED + NATIVE
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


def _indication(execution: Any, payload: dict, knowledge: dict) -> dict:
    """AG05 accepts only documented upstream product facts, never guessed text."""
    from importlib import util
    from pathlib import Path
    import re
    source = (Path(__file__).resolve().parents[1] /
        "AG05_Indication_Identification/src/branches/"
        "integration__nexus-agent-five-steps-20261011/backend/agents/"
        "drug_role/indication_action_policy.py")
    spec = util.spec_from_file_location("nexus_ag05_indication_action_policy", source)
    if spec is None or spec.loader is None:
        raise ValueError("AG05 engine unavailable")
    module = util.module_from_spec(spec)
    spec.loader.exec_module(module)
    facts = payload.get("product_facts")
    if not isinstance(facts, list) or not facts or len(facts) > 100:
        raise ValueError("AG05 needs validated product_facts (1–100 records)")
    approved = {p["product_id"] for p in knowledge["client_products"]}
    for item in facts:
        if not isinstance(item, dict) or item.get("product_id") not in approved:
            raise ValueError("AG05 product is not in the approved client Product Master")
        for field in ("indication_evidence", "action_evidence"):
            quote = item.get(field)
            if quote is not None and (not isinstance(quote, str) or
                    quote.strip().casefold() not in payload["text"].casefold()):
                raise ValueError("AG05 evidence must be verbatim source text")
    result = module.normalize_indications_actions(facts)
    return {"agent_id": "AG05", "status": "review_required",
            "normalized_product_facts": result}


def _translation(execution: Any, payload: dict, knowledge: dict) -> dict:
    """AG10 fails closed unless a real, approved provider is configured."""
    from Agentic_AI.AG10_Translation.translation_agent import translate_article
    language = payload.get("source_language")
    target = payload.get("target_language", "English")
    if not isinstance(language, str) or not isinstance(target, str):
        raise ValueError("AG10 requires verified source/target languages")
    result = translate_article(payload["text"], source_language=language,
        target_language=target, tenant_id=execution.tenant_id,
        client_id=execution.client_id)
    return {"agent_id": "AG10", "status": result.status,
            "translation": result.to_dict()}


def build_specialist_adapters() -> dict[str, BaseExecutionAdapter]:
    """Explicitly bind the five confirmed callable engines to Step 1 base."""
    registry = {"AG01": BaseExecutionAdapter(
        SpecialistBinding("AG01", _ag01))}
    for agent_id in RECOVERED:
        registry[agent_id] = BaseExecutionAdapter(
            SpecialistBinding(agent_id, _recovered(agent_id)))
    registry["AG05"] = BaseExecutionAdapter(SpecialistBinding("AG05", _indication))
    registry["AG10"] = BaseExecutionAdapter(SpecialistBinding("AG10", _translation))
    return registry


def specialist_status() -> list[SpecialistStatus]:
    return [
        SpecialistStatus(
            agent_id=agent_id,
            connected=agent_id in CONNECTED,
            implementation=("canonical_drug_role" if agent_id == "AG01"
                            else "recovered_b2" if agent_id in RECOVERED
                            else "controlled_indication_policy" if agent_id == "AG05"
                            else "translation_engine" if agent_id == "AG10"
                            else "source_present_unmapped"),
            reason=("Callable engine bound through BaseExecutionAdapter"
                    if agent_id in CONNECTED
                    else "Specialist input/output and runtime dependencies require mapping"),
        )
        for agent_id in ALL_AGENT_IDS
    ]
