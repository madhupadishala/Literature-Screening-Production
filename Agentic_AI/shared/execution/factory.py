"""Construct the opt-in Nexus dispatcher. Importing this file does not enable endpoints."""
from __future__ import annotations
from Agentic_AI.shared.execution.dispatcher import AgentDispatcher
from Agentic_AI.shared.execution.specialists import VERIFIED_BINDINGS
from Agentic_AI.shared.execution.additional_bindings import ADDITIONAL_BINDINGS
from backend.knowledge.knowledge_router import KnowledgeRouter

def build_dispatcher(*, signing_secret: bytes, router=None, duplicate_repository=None, approved_llm=None) -> AgentDispatcher:
    bindings = {**VERIFIED_BINDINGS, **ADDITIONAL_BINDINGS}
    if duplicate_repository is not None:
        # Never bind duplicate engines without an authorized persistence adapter.
        from Agentic_AI.shared.execution.duplicate_bindings import make_duplicate_bindings
        bindings.update(make_duplicate_bindings(duplicate_repository))
    if approved_llm is not None:
        from Agentic_AI.shared.execution.v25_bindings import make_v25_bindings
        bindings.update(make_v25_bindings(approved_llm))
    return AgentDispatcher(
        router=router if router is not None else KnowledgeRouter(),
        secret=signing_secret,
        specialists=bindings,
    )
