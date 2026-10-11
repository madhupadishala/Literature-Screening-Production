"""LangGraph execution bridge for the imported Nexus specialist ICSR agents.

This is an integration candidate, not clinical release authorization.
The shared Nexus KnowledgeRouter is called for every assessment.
No default LLM provider or alternate tenant knowledge store is created.
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from typing import Any, TypedDict

from backend.knowledge.knowledge_router import KnowledgeRouter

PROJECT_ROOT = Path(__file__).resolve().parents[3]
SPECIALIST_PACKAGE = (
    PROJECT_ROOT / "nexus_actual_agent_source_consolidation" / "packages"
    / "pv_specialist_core" / "nexus_pv_agents" / "nexus_agents"
)


class IntegrationUnavailable(RuntimeError):
    """A dependency, knowledge backend, or clinical agent cannot run safely."""


class ClinicalState(TypedDict, total=False):
    request: dict[str, Any]
    knowledge_context: dict[str, Any]
    result: dict[str, Any]
    errors: list[str]
    review_required: bool


def _specialist_package():
    """Load the specialist package under a unique namespace, avoiding the v2 name collision."""
    import sys
    package_name = "nexus_pv_specialist_runtime"
    if package_name in sys.modules:
        return sys.modules[package_name]
    init_file = SPECIALIST_PACKAGE / "__init__.py"
    if not init_file.is_file():
        raise IntegrationUnavailable("Specialist agent source missing from the selected Git ref")
    spec = importlib.util.spec_from_file_location(
        package_name, init_file, submodule_search_locations=[str(SPECIALIST_PACKAGE)]
    )
    if spec is None or spec.loader is None:
        raise IntegrationUnavailable("Could not load specialist agent package")
    module = importlib.util.module_from_spec(spec)
    sys.modules[package_name] = module
    try:
        spec.loader.exec_module(module)
    except Exception:
        sys.modules.pop(package_name, None)
        raise
    return module


def _agents():
    import importlib
    _specialist_package()
    schemas = importlib.import_module("nexus_pv_specialist_runtime.schemas")
    orchestration = importlib.import_module("nexus_pv_specialist_runtime.orchestration")
    return schemas, orchestration.AgentSuite


class NexusSpecialistBridge:
    """Nexus Knowledge Base context + actual specialist source + LangGraph execution.

    Fail closed on missing tenant scope, failed KB, missing graph dependency,
    absent source or unresolved clinical review.
    """

    def __init__(self, *, knowledge_router=None, suite=None):
        self.router = knowledge_router or KnowledgeRouter()
        self.suite = suite

    def _knowledge(self, request: dict[str, Any]) -> dict[str, Any]:
        scope = ("tenant_id", "client_id", "case_id", "narrative")
        if any(not isinstance(request.get(k), str) or not request[k].strip() for k in scope):
            raise ValueError("Explicit tenant_id, client_id, case_id and narrative are mandatory")
        if len(request["narrative"]) > 100_000:
            raise ValueError("ICSR requires chunked full-document ingestion before assessment")
        pack = self.router.build_context_pack(
            tenant_id=request["tenant_id"],
            client_id=request["client_id"],
            agent_name="GLOBAL",
            task="Source-grounded ICSR specialist assessments; require manual approval",
            evidence_package={
                "evidence_package_id": request["case_id"],
                "text": request["narrative"],
                "source_type": request.get("source_type", "spontaneous"),
            },
            jurisdiction=request.get("jurisdiction"),
            as_of=request.get("as_of"),
        )
        if not hasattr(pack, "to_dict"):
            raise IntegrationUnavailable("KnowledgeRouter did not provide a versioned context pack")
        context = pack.to_dict()
        if context.get("tenant_id") != request["tenant_id"]:
            raise IntegrationUnavailable("KnowledgeRouter returned wrong tenant")
        # A missing KB document is UNKNOWN, never negative safety evidence.
        return context

    def compile_icsr_graph(self):
        try:
            from langgraph.graph import END, START, StateGraph
        except ImportError as exc:
            raise IntegrationUnavailable("Install and verify langgraph in the hosted Python runtime") from exc

        def load_knowledge(state: ClinicalState) -> ClinicalState:
            return {"knowledge_context": self._knowledge(state["request"]), "review_required": True}

        def assess(state: ClinicalState) -> ClinicalState:
            schemas, suite_type = _agents()
            suite = self.suite or suite_type()
            req = state["request"]
            # The original source text is preserved, without inventing drugs or events.
            case = schemas.ICSR.model_validate({
                **req.get("structured_case", {}),
                "case_id": req["case_id"],
                "narrative": req["narrative"],
            })
            action = suite.action_taken.extract(case)
            dechallenge = suite.dechallenge.assess(case, action)
            rechallenge = suite.rechallenge.assess(case)
            medical_history = suite.med_history.extract(case)
            followup = suite.followup.generate(case)
            results = {
                "action_taken": action,
                "dechallenge": dechallenge,
                "rechallenge": rechallenge,
                "medical_history": medical_history,
                "followup": followup,
            }
            normalized = {}
            for name, output in results.items():
                if hasattr(output, "model_dump"):
                    normalized[name] = output.model_dump(mode="json")
                elif isinstance(output, dict):
                    normalized[name] = output
                else:
                    raise IntegrationUnavailable(f"Invalid {name} contract")
            return {
                "result": normalized,
                "review_required": True,
                "errors": [],
            }

        graph = StateGraph(ClinicalState)
        graph.add_node("authorized_knowledge", load_knowledge)
        graph.add_node("specialist_icsr", assess)
        graph.add_edge(START, "authorized_knowledge")
        graph.add_edge("authorized_knowledge", "specialist_icsr")
        graph.add_edge("specialist_icsr", END)
        return graph.compile()

    def assess(self, request: dict[str, Any]) -> dict[str, Any]:
        # Authentication must be performed by the existing Nexus service BEFORE this method.
        result = self.compile_icsr_graph().invoke({"request": request, "review_required": True})
        if not result.get("knowledge_context") or "result" not in result:
            raise IntegrationUnavailable("Graph did not produce verified context and assessments")
        return {
            "schema_version": "nexus.specialist-assessment/1",
            "tenant_id": request["tenant_id"],
            "client_id": request["client_id"],
            "case_id": request["case_id"],
            "knowledge_context": result["knowledge_context"],
            "assessments": result["result"],
            "route": "human_review",
            "review_required": True,
            "clinical_release_authorized": False,
        }
