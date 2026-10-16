"""Construct the opt-in Nexus dispatcher. Importing this file does not enable endpoints."""
from __future__ import annotations
from Agentic_AI.shared.execution.dispatcher import AgentDispatcher
from Agentic_AI.shared.execution.specialists import VERIFIED_BINDINGS
from Agentic_AI.shared.execution.additional_bindings import ADDITIONAL_BINDINGS
from Agentic_AI.shared.execution.grounded_specialists import GROUNDED_BINDINGS
from backend.knowledge.knowledge_router import KnowledgeRouter

def build_dispatcher(*, signing_secret: bytes, router=None, duplicate_repository=None, approved_llm=None, specialist_services=None, seriousness_pipeline=None, causality_pipeline=None, use_approved_batch1_provider=False, native_runtimes=None, native_socket_path=None, native_ts_agents=(), ag02_runtime=None, audit_failure=None) -> AgentDispatcher:
    bindings = {**VERIFIED_BINDINGS, **ADDITIONAL_BINDINGS, **GROUNDED_BINDINGS}
    if duplicate_repository is not None:
        # Never bind duplicate engines without an authorized persistence adapter.
        from Agentic_AI.shared.execution.duplicate_bindings import make_duplicate_bindings
        bindings.update(make_duplicate_bindings(duplicate_repository))
    if use_approved_batch1_provider:
        if approved_llm is not None:
            raise ValueError('Choose either explicit approved_llm or environment provider, not both')
        from Agentic_AI.shared.execution.approved_json_provider import PrivateStructuredJSONClient
        approved_llm = PrivateStructuredJSONClient.from_server_env()
    if approved_llm is not None:
        from Agentic_AI.shared.execution.v25_bindings import make_v25_bindings
        bindings.update(make_v25_bindings(approved_llm))
    if native_socket_path is not None or native_ts_agents or ag02_runtime is not None:
        if native_runtimes is not None:
            raise ValueError("Choose injected native runtimes or approved native socket composition")
        from .node_socket_runtime import approved_native_engines
        native_runtimes = approved_native_engines(
            socket_path=native_socket_path or "/run/nexus-agents/agent.sock",
            ag02_runtime=ag02_runtime, configured_agents=native_ts_agents)
    if native_runtimes is not None:
        from Agentic_AI.shared.execution.native_runtime_bindings import make_native_runtime_bindings
        native_runtime_bindings = make_native_runtime_bindings(native_runtimes)
        if set(native_runtime_bindings) & set(bindings):
            raise ValueError("Duplicate native runtime binding")
        bindings.update(native_runtime_bindings)
    if specialist_services is not None:
        from Agentic_AI.shared.execution.service_bindings import make_service_bindings
        service_ports = make_service_bindings(specialist_services)
        if set(service_ports) & set(bindings):
            raise ValueError("Duplicate specialist engine binding")
        bindings.update(service_ports)
    if seriousness_pipeline is not None or causality_pipeline is not None:
        from Agentic_AI.shared.execution.native_pipeline_bindings import make_native_pipeline_bindings
        native = make_native_pipeline_bindings(seriousness_pipeline=seriousness_pipeline,
                                               causality_pipeline=causality_pipeline)
        if set(native) & set(bindings):
            raise ValueError('duplicate specialist registration: choose native engine or service port')
        bindings.update(native)
    if not isinstance(signing_secret, bytes) or len(signing_secret) < 32:
        raise ValueError('Nexus dispatcher requires a server-side 32-byte signing secret')
    return AgentDispatcher(
        router=router if router is not None else KnowledgeRouter(),
        secret=signing_secret,
        specialists=bindings,
    )
