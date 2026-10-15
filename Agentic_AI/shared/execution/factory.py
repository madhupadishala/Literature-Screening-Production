"""Construct the opt-in Nexus dispatcher. Importing this file does not enable endpoints."""
from __future__ import annotations
from Agentic_AI.shared.execution.dispatcher import AgentDispatcher
from Agentic_AI.shared.execution.specialists import VERIFIED_BINDINGS
from Agentic_AI.shared.execution.additional_bindings import ADDITIONAL_BINDINGS
from backend.knowledge.knowledge_router import KnowledgeRouter

def build_dispatcher(*, signing_secret: bytes, router=None, duplicate_repository=None, approved_llm=None, specialist_services=None, seriousness_pipeline=None, causality_pipeline=None) -> AgentDispatcher:
    bindings = {**VERIFIED_BINDINGS, **ADDITIONAL_BINDINGS}
    if duplicate_repository is not None:
        # Never bind duplicate engines without an authorized persistence adapter.
        from Agentic_AI.shared.execution.duplicate_bindings import make_duplicate_bindings
        bindings.update(make_duplicate_bindings(duplicate_repository))
    if approved_llm is not None:
        from Agentic_AI.shared.execution.v25_bindings import make_v25_bindings
        bindings.update(make_v25_bindings(approved_llm))
    if specialist_services is not None:
        from Agentic_AI.shared.execution.service_bindings import make_service_bindings
        bindings.update(make_service_bindings(specialist_services))
    if seriousness_pipeline is not None or causality_pipeline is not None:
        from Agentic_AI.shared.execution.native_pipeline_bindings import make_native_pipeline_bindings
        native = make_native_pipeline_bindings(seriousness_pipeline=seriousness_pipeline,
                                               causality_pipeline=causality_pipeline)
        if set(native) & set(bindings):
            raise ValueError('duplicate specialist registration: choose native engine or service port')
        bindings.update(native)
    return AgentDispatcher(
        router=router if router is not None else KnowledgeRouter(),
        secret=signing_secret,
        specialists=bindings,
    )
