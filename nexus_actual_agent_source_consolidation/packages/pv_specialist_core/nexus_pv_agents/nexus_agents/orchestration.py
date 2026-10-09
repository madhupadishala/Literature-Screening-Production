"""Phase 3 — Shared multi-agent orchestration.

A lightweight, deterministic state-machine orchestrator wiring the eight
agents through the governed evidence pipeline. It is deliberately
infrastructure-agnostic: `LangGraphAdapter` documents the integration point
for a LangGraph deployment (the `langgraph` package is an optional runtime
dependency, injected by Nexus shared AI services, not vendored here).
"""
from __future__ import annotations

from typing import Any

from .agents import (ActionTakenAgent, DechallengeAgent,
                     FollowUpQuestionnaireAgent, InclusionExclusionAgent,
                     IcsrDuplicateAgent, LiteratureDuplicateAgent,
                     MedicalHistoryAgent, RechallengeAgent)
from .knowledge_register import KnowledgeRegister
from .schemas import ICSR, LiteratureArticle


class AgentSuite:
    """Versioned container exposing the eight specialist agents."""

    def __init__(self, register: KnowledgeRegister | None = None):
        self.register = register or KnowledgeRegister()
        self.lit_duplicate = LiteratureDuplicateAgent(self.register)
        self.icsr_duplicate = IcsrDuplicateAgent(self.register)
        self.followup = FollowUpQuestionnaireAgent(self.register)
        self.inclusion = InclusionExclusionAgent(self.register)
        self.action_taken = ActionTakenAgent(self.register)
        self.dechallenge = DechallengeAgent(self.register)
        self.rechallenge = RechallengeAgent(self.register)
        self.med_history = MedicalHistoryAgent(self.register)

    def versions(self) -> dict[str, str]:
        return {a.NAME: a.VERSION for a in vars(self).values()
                if hasattr(a, "NAME")}


def literature_workflow(suite: AgentSuite,
                        article: LiteratureArticle,
                        existing: list[LiteratureArticle],
                        product_scope: list[str]) -> dict[str, Any]:
    """PMID -> duplicate check -> inclusion/exclusion -> (intake handoff)."""
    step = {"stage": "literature_duplicate_check", "comparisons": []}
    relation = "new_independent_case"
    for old in existing:
        res = suite.lit_duplicate.assess_pair(article, old)
        step["comparisons"].append(res.payload)
        if res.payload["relationship"] != "new_independent_case":
            relation = res.payload["relationship"]
    dup_suspected = relation in ("duplicate_bibliographic_record",
                                 "duplicate_publication_content",
                                 "overlapping_patient_case")
    screen = suite.inclusion.screen(article, product_scope,
                                    duplicate_suspected=dup_suspected)
    return {
        "workflow": "literature",
        "stages": [step, {"stage": "inclusion_exclusion", **screen.payload}],
        "handoff": ("medical_review" if screen.payload["flag"] != "EXCLUDE"
                    else "excluded_with_reason_codes"),
        "relation_to_existing_literature": relation,
    }


def spontaneous_icsr_workflow(suite: AgentSuite, case: ICSR,
                              existing_cases: list[ICSR]) -> dict[str, Any]:
    """Source -> duplicate check -> action taken -> dechallenge/rechallenge
    -> follow-up -> medical review handoff."""
    stages = []
    dup_stage = {"stage": "case_duplicate_check", "comparisons": []}
    best_cls, best_case = "new_case", None
    for old in existing_cases:
        res = suite.icsr_duplicate.compare(case, old)
        dup_stage["comparisons"].append(res.payload)
        order = ["exact_duplicate", "follow_up_to_existing_icsr", "probable_duplicate",
                 "possible_duplicate", "unresolved", "related_but_distinct_case", "new_case"]
        if order.index(res.payload["classification"]) < order.index(best_cls):
            best_cls, best_case = res.payload["classification"], old.case_id
    dup_stage["conclusion"] = {"classification": best_cls, "against": best_case}
    stages.append(dup_stage)

    at = suite.action_taken.extract(case)
    stages.append({"stage": "action_taken", **at.payload})
    dc = suite.dechallenge.assess(case, at)
    stages.append({"stage": "dechallenge", **dc.payload})
    rc = suite.rechallenge.assess(case)
    stages.append({"stage": "rechallenge", **rc.payload})
    mh = suite.med_history.extract(case)
    stages.append({"stage": "medical_history", **mh.payload})
    fu = suite.followup.generate(case)
    stages.append({"stage": "followup_questions", **fu.payload})

    return {"workflow": "spontaneous_icsr", "case_id": case.case_id,
            "stages": stages, "handoff": "qc_medical_review"}


def followup_icsr_workflow(suite: AgentSuite, new_info: ICSR,
                           existing_cases: list[ICSR]) -> dict[str, Any]:
    """New information -> existing-case matching -> reassessment -> versioning."""
    match_stage = {"stage": "existing_case_matching", "comparisons": []}
    target = None
    for old in existing_cases:
        res = suite.icsr_duplicate.compare(new_info, old)
        match_stage["comparisons"].append(res.payload)
        if res.payload["classification"] in ("exact_duplicate",
                                             "follow_up_to_existing_icsr",
                                             "probable_duplicate"):
            target = old
            break
    if target is None:
        return {"workflow": "followup_icsr", "stages": [match_stage],
                "handoff": "no_existing_case_matched_process_as_new"}
    at = suite.action_taken.extract(new_info)
    dc = suite.dechallenge.assess(new_info, at)
    return {
        "workflow": "followup_icsr",
        "stages": [match_stage,
                   {"stage": "change_detection",
                    "target_case": target.case_id,
                    "new_version": target.version + 1,
                    "significant_new_information": True},
                   {"stage": "reassessment",
                    "action_taken": at.payload, "dechallenge": dc.payload}],
        "handoff": "case_versioning_and_medical_review",
    }


class LangGraphAdapter:
    """Documented integration point for a LangGraph runtime.

    In Nexus, each stage above maps to a node; the pipeline dict maps to the
    graph state; this adapter is where `langgraph.graph.StateGraph` wiring is
    injected by shared AI services. Kept as an adapter so agent logic never
    depends on vendor orchestration infrastructure.
    """

    @staticmethod
    def describe() -> dict[str, str]:
        return {
            "state": "pipeline dict (typed via nexus_agents.schemas contracts)",
            "nodes": "AgentSuite methods, one per stage",
            "edges": "deterministic, as encoded in *_workflow functions",
            "checkpointing": "provided by LangGraph runtime in Nexus (not vendored)",
        }
