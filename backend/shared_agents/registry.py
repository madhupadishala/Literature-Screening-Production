"""Canonical source inventory for uploaded Nexus specialist agents.

This is a source registry, NOT a clinical readiness or service activation registry.
The eight Kimi agents and five v2 agents use different package namespaces.
Keep their Python sources immutable until semantic deduplication is reviewed.
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent
KIMI = "vendor/kimi_8/nexus_pv_agents/nexus_agents/agents"
V2 = "vendor/v2_5/nexus_agents_v2/nexus_agents"

AGENT_SOURCES: dict[str, str] = {
    "action_taken": f"{KIMI}/action_taken.py",
    "dechallenge": f"{KIMI}/dechallenge.py",
    "followup": f"{KIMI}/followup.py",
    "icsr_duplicate": f"{KIMI}/icsr_duplicate.py",
    "inclusion_exclusion": f"{KIMI}/inclusion_exclusion.py",
    "literature_duplicate": f"{KIMI}/lit_duplicate.py",
    "medical_history": f"{KIMI}/med_history.py",
    "rechallenge": f"{KIMI}/rechallenge.py",
    "day_zero": f"{V2}/day_zero/agent.py",
    "history_capture": f"{V2}/history/agent.py",
    "current_case": f"{V2}/current/agent.py",
    "patient_identifier": f"{V2}/patient/agent.py",
    "reporter": f"{V2}/reporter/agent.py",
}

# Overlaps needing clinical/code review; do not silently merge algorithms.
OVERLAP_REVIEW = {
    "medical_history": ("medical_history", "history_capture"),
    "followup_and_current": ("followup", "current_case"),
}

def source_inventory() -> dict[str, dict[str, str | bool]]:
    return {
        name: {"path": path, "source_present": (ROOT / path).is_file(),
               "runtime_registered": False, "clinically_qualified": False}
        for name, path in AGENT_SOURCES.items()
    }

# Earlier engines are preserved at their original import locations while
# mirrored in this unified custody layer; no silent runtime switch.
LEGACY_COMPONENTS: dict[str, str] = {
    "drug_role": "drug_role/nexus_agent.py",
    "adverse_event": "event_runtime/engine.py",
    "seriousness": "seriousness_runtime/pipeline.py",
    "causality": "causality_runtime/pipeline.py",
    "literature_screening": "screening/orchestrator.py",
    "literature_hits": "hits/orchestrator.py",
    "product_resolver": "product_resolver_agent.py",
    "article_fetch": "article_fetch_agent.py",
}

def legacy_source_inventory() -> dict[str, dict[str, str | bool]]:
    """Record old import path and mirrored shared-layer source only."""
    return {
        name: {
            "runtime_path": f"backend/agents/{path}",
            "shared_mirror_path": f"backend/shared_agents/legacy/{path}",
            "mirror_present": (ROOT / "legacy" / path).is_file(),
            "runtime_migrated": False,
        }
        for name, path in LEGACY_COMPONENTS.items()
    }
