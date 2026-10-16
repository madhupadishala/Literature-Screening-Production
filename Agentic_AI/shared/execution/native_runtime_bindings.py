"""Native runtime bridge contracts for Nexus AG02/08/12/17/20/26.

Runtime engines are injected from trusted server composition, never from browser
payloads. An unconfigured runtime is NOT registered. No network discovery,
provider fallback or clinical autonomous routing is permitted.
"""
from __future__ import annotations

from collections.abc import Mapping
from typing import Any

RUNTIME_ROUTES = {
    "AG02": {"runtime": "python-event-engine", "module": ("literature_screening", "intake_triage", "case_processing"), "input": "event_request"},
    "AG08": {"runtime": "typescript-country-of-incident", "module": ("intake_triage", "case_processing"), "input": "text"},
    "AG12": {"runtime": "typescript-listedness", "module": ("case_processing",), "input": "labeling_request"},
    "AG17": {"runtime": "typescript-safety-assessment", "module": ("literature_screening", "intake_triage"), "input": "text"},
    "AG20": {"runtime": "typescript-narrative", "module": ("case_processing",), "input": "narrative_request"},
    "AG26": {"runtime": "typescript-triage", "module": ("intake_triage",), "input": "triage_request"},
}

def make_native_runtime_bindings(runtimes: Mapping[str, Any]) -> dict:
    """runtimes: server-authorized implementations implementing execute(request).

    Runtime implementations must be wired to actual specialist engines before
    registration. This adapter enforces route identity, evidence ownership, and
    return contract even if the native engine process is remote.
    """
    if not isinstance(runtimes, Mapping) or not set(runtimes).issubset(RUNTIME_ROUTES):
        raise ValueError("Unknown or invalid native runtime registration")
    bindings = {}
    for agent_id, runtime in runtimes.items():
        execute = getattr(runtime, "execute", None)
        if not callable(execute):
            raise TypeError(f"{agent_id} requires callable native runtime.execute")

        def run(evidence, pack, *, _id=agent_id, _execute=execute):
            route = RUNTIME_ROUTES[_id]
            doc = evidence.get("document_id")
            if not isinstance(doc, str) or not doc.strip():
                raise ValueError("Authorized source document ID required")
            if not getattr(pack, "tenant_id", None) or not getattr(pack, "client_id", None):
                raise PermissionError("Verified tenant and client required")
            payload = evidence.get(route["input"]) if route["input"] != "text" else evidence.get("text")
            if not isinstance(payload, (str, dict)) or not payload:
                raise ValueError(f"{_id}: required source input missing")
            if isinstance(payload, dict):
                if payload.get("document_id") != doc:
                    raise ValueError("Specialist input/document identity mismatch")
                if _id == "AG02" and (not isinstance(payload.get("case"), dict) or
                                        payload["case"].get("case_id") != doc or
                                        not isinstance(payload["case"].get("documents"), list) or
                                        not payload["case"]["documents"]):
                    raise ValueError("AG02 requires source-linked case and nonempty documents")
                if _id in ("AG12", "AG20", "AG26") and not isinstance(payload.get("source"), dict):
                    raise ValueError("Structured specialist request requires source evidence object")
            request = {"agent_id": _id, "document_id": doc,
                       "tenant_id": pack.tenant_id, "client_id": pack.client_id,
                       "input": payload,
                       "knowledge_citations": list(getattr(pack, "citations", []))}
            output = _execute(request)
            if not isinstance(output, dict) or output.get("agent_id") != _id:
                raise ValueError("Native specialist identity mismatch")
            for key in ("document_id", "tenant_id", "client_id"):
                if output.get(key) != request[key]:
                    raise PermissionError(f"Native specialist {key} scope mismatch")
            if output.get("requires_human_review") is not True or output.get("status") != "review_required":
                raise ValueError("Native specialist must fail closed to human review")
            if not isinstance(output.get("assessment"), dict):
                raise ValueError("Native specialist assessment missing")
            return output
        bindings[agent_id] = run
    return bindings
