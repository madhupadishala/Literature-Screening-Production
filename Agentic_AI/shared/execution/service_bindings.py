"""Explicit service-bound adapters for specialist engines not yet safely importable in Python.

The caller supplies approved, authenticated INTERNAL specialist services; no dynamic
HTTP provider, environment-selected host, synthetic output, or default fallback.
Unconfigured engines remain not_bound in dispatcher readiness. Service results
are review-only and must prove their source and scope.
"""
from __future__ import annotations
from collections.abc import Callable, Mapping
from typing import Any

# Native engines exist in recovered sources but have separate dependencies and/or
# TypeScript runtime boundaries; register them only when the host injects adapters.
SERVICE_BOUND_AGENTS = frozenset({
    "AG02",  # Adverse event extraction / MedDRA
    "AG05",  # Indication
    "AG07",  # Lab data
    "AG08",  # Country of incident / TypeScript service
    "AG11",  # Seriousness
    "AG12",  # Labeling and expectedness / TypeScript service
    "AG13",  # Causality
    "AG16",  # AESI / AOAC checker
    "AG17",  # Safety information / TypeScript service
    "AG20",  # Narrative writer / TypeScript service
    "AG26",  # Intake triage / TypeScript service
    "AG27",  # Patient vs aggregate relevance
})
_ALLOWED_STATUSES = frozenset({"review_required", "unresolved", "completed_unqualified"})

def make_service_bindings(services: Mapping[str, Callable[..., dict[str, Any]]]):
    """Each service must have run(*, evidence, knowledge_pack) or be an injected callable.

    Services are provisioned on the trusted host ONLY, not from request body.
    """
    if not isinstance(services, Mapping):
        raise TypeError("approved specialist service mapping is required")
    if not set(services).issubset(SERVICE_BOUND_AGENTS):
        raise ValueError("unrecognized or already bound agent service")
    result = {}
    for agent_id, service in services.items():
        if not callable(service):
            raise TypeError(f"{agent_id} service must be callable")

        def bind(evidence, knowledge_pack, *, _agent_id=agent_id, _service=service):
            if not isinstance(evidence, dict) or not evidence.get("document_id"):
                raise ValueError("authorized source document identity required")
            tenant_id = getattr(knowledge_pack, "tenant_id", None)
            client_id = getattr(knowledge_pack, "client_id", None)
            if not tenant_id or not client_id:
                raise ValueError("server-issued tenant and client scope required")
            # Restrict this contract to in-process, server-wired adapters. The host
            # must validate downstream permissions before registering a service.
            output = _service(evidence=evidence, knowledge_pack=knowledge_pack)
            if not isinstance(output, dict):
                raise TypeError("specialist returned non-dict")
            if output.get("agent_id") != _agent_id:
                raise ValueError("specialist response agent identity mismatch")
            if output.get("document_id") != evidence["document_id"]:
                raise ValueError("specialist response document identity mismatch")
            if output.get("tenant_id") != tenant_id or output.get("client_id") != client_id:
                raise PermissionError("specialist response cross-scope mismatch")
            if output.get("status") not in _ALLOWED_STATUSES:
                raise ValueError("specialist must return explicit unqualified status")
            if output.get("requires_human_review") is not True:
                raise ValueError("clinical review cannot be bypassed")
            if not isinstance(output.get("assessment"), dict):
                raise ValueError("missing specialist assessment")
            return output
        result[agent_id] = bind
    return result
