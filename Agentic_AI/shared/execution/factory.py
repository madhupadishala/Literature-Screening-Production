"""Construct the opt-in Nexus dispatcher. Importing this file does not enable endpoints."""
from __future__ import annotations
from Agentic_AI.shared.execution.dispatcher import AgentDispatcher
from Agentic_AI.shared.execution.specialists import VERIFIED_BINDINGS
from backend.knowledge.knowledge_router import KnowledgeRouter

def build_dispatcher(*, signing_secret: bytes, router=None) -> AgentDispatcher:
    return AgentDispatcher(
        router=router if router is not None else KnowledgeRouter(),
        secret=signing_secret,
        specialists=VERIFIED_BINDINGS,
    )
