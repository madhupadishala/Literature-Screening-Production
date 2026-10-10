"""Typed, explicit causality orchestration.

The graph is intentionally transparent: every specialist node records a step result and operates on one
shared state contract. The built-in executor is deterministic and CI-friendly; `build_langgraph` binds the
same nodes to LangGraph for production execution.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Any

from pydantic import BaseModel, ConfigDict, Field


NODE_ORDER = (
    "pair_formation",
    "timeline",
    "fact_extraction",
    "clinical_evidence",
    "knowledge_retrieval",
    "alternative_etiology",
    "dechallenge_rechallenge",
    "method_engine",
    "regulatory_grounding",
    "conflict_quality_gate",
    "rationale_synthesis",
    "routing_audit",
)


class CausalityState(BaseModel):
    """Shared state contract between causality specialist agents."""
    model_config = ConfigDict(extra="allow", arbitrary_types_allowed=True)

    case_id: str
    drug: str
    event: str
    tenant_id: str
    client_id: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    completed_nodes: list[str] = Field(default_factory=list)


@dataclass
class OrchestrationTrace:
    nodes: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    node_updates: dict[str, list[str]] = field(default_factory=dict)


class CausalityOrchestrator:
    """Graph executor with a LangGraph-compatible state/node shape."""

    def __init__(self, nodes: dict[str, Callable[[dict[str, Any]], dict[str, Any]]] | None = None):
        self.nodes = nodes or {}

    def run(self, state: dict[str, Any]) -> tuple[dict[str, Any], OrchestrationTrace]:
        trace = OrchestrationTrace()
        for name in NODE_ORDER:
            fn = self.nodes.get(name)
            trace.nodes.append(name)
            if fn is None:
                trace.node_updates[name] = []
                continue
            try:
                update = fn(state) or {}
                state.update(update)
                trace.node_updates[name] = sorted(update.keys())
            except Exception as exc:
                # Orchestration never swallows errors silently; caller decides whether to fail or HITL.
                warning = f"{name}:failed:{type(exc).__name__}"
                trace.warnings.append(warning)
                state.setdefault("orchestration_errors", []).append(warning)
                trace.node_updates[name] = ["orchestration_errors"]
        return state, trace

    @staticmethod
    def technology() -> dict[str, str]:
        return {
            "state_contract": "Pydantic v2 CausalityState + strict I/O schemas",
            "graph": "LangGraph explicit DAG with deterministic offline executor",
            "api": "FastAPI",
            "audit": "hash-chained append-only audit records + review/override events",
            "knowledge": "tenant/client-scoped governed Nexus retrieval adapter",
            "rules": "versioned deterministic WHO-UMC/Naranjo rule packs",
            "uncertainty": "unknown is preserved; unresolved critical evidence routes to HITL",
        }


def build_langgraph(nodes: dict[str, Callable[[dict[str, Any]], dict[str, Any]]]):
    """Build production LangGraph from the same node contract used in CI."""
    try:
        from langgraph.graph import StateGraph, START, END
        from typing_extensions import TypedDict
    except ImportError as exc:
        raise RuntimeError("langgraph is not installed; install project dependencies for production graph") from exc

    class GraphState(TypedDict, total=False):
        payload: dict[str, Any]
        orchestration_errors: list[str]

    g = StateGraph(GraphState)
    for name in NODE_ORDER:
        fn = nodes.get(name, lambda state: {})

        def _node(state, _fn=fn, _name=name):
            payload = state.get("payload", {})
            try:
                update = _fn(payload) or {}
                return {"payload": {**payload, **update}}
            except Exception as exc:
                errors = list(state.get("orchestration_errors", []))
                errors.append(f"{_name}:failed:{type(exc).__name__}")
                return {"payload": payload, "orchestration_errors": errors}

        g.add_node(name, _node)
    g.add_edge(START, NODE_ORDER[0])
    for a, b in zip(NODE_ORDER, NODE_ORDER[1:]):
        g.add_edge(a, b)
    g.add_edge(NODE_ORDER[-1], END)
    return g.compile()
