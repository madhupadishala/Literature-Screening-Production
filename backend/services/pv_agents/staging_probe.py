"""Synthetic-only authenticated staging probe for actual Neon audit + replay.

This is NOT a clinical agent, KB citation, or production-facing assessment.
The input and output are fixed and non-identifying; no arbitrary user data accepted.
"""
import hashlib
import json
import os
from datetime import datetime
from uuid import uuid4

from .service import PVAgentService, ServiceError
from .postgres_audit import PostgresAuditStore

TEXT = "SYNTHETIC STAGING TEST ONLY: no patient, drug, or event data."
SCOPE = {"tenant_id": "nexus-staging-tenant", "client_id": "nexus-staging-client",
         "workspace_id": "nexus-staging-workspace"}


def assess_probe(token, request_id):
    if os.environ.get("NEXUS_PV_STAGING_PROBE_ENABLED") != "true" or os.environ.get("NEXUS_PV_AGENTS_ENABLED") == "true":
        raise ServiceError(503, "Staging probe unavailable")
    if not isinstance(request_id, str) or not 1 <= len(request_id) <= 100 or any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for c in request_id):
        raise ServiceError(400, "Invalid request ID")
    scopes = json.loads(os.environ["NEXUS_PV_SERVICE_TOKEN_SCOPES"])
    # Require a valid registered token scoped exclusively to synthetic identifiers.
    app = PVAgentService(scopes, PostgresAuditStore(os.environ["NEXUS_PV_AUDIT_DATABASE_URL"]),
                         drug_agent=_UnusedAgent(), workers={}, causality_adapter=_UnusedAgent())
    allowed = next((v for k, v in scopes.items() if __import__("hmac").compare_digest(k, token)), None)
    if allowed is None:
        raise ServiceError(401, "Service authentication required")
    if SCOPE not in allowed:
        raise ServiceError(403, "Synthetic scope required")
    record = dict(SCOPE, request_id=request_id, case_id="staging-probe",
                  input_sha256=hashlib.sha256(TEXT.encode()).hexdigest())
    output = dict(record, schema_version="nexus.staging-probe/1",
                  route="hitl", review_required=True,
                  synthetic_only=True, clinical_release_authorized=False,
                  agent="staging-probe", knowledge_version="none; diagnostic only")
    return app.audit.append(record, "staging-probe", output)


class _UnusedAgent:
    pass

def specialist_readiness_probe(token, request_id):
    """Authenticated, synthetic-only 27-slot readiness. No patient input or model calls.

    The current host has no injected provider/candidate corpus; preserve explicit
    not_bound status instead of pretending all 27 are clinically executable.
    """
    from Agentic_AI.shared.execution.factory import build_dispatcher
    from Agentic_AI.shared.execution.grounded_specialists import GROUNDED_BINDINGS
    from Agentic_AI.shared.execution.additional_bindings import ADDITIONAL_BINDINGS
    from Agentic_AI.shared.execution.specialists import VERIFIED_BINDINGS

    audited = assess_probe(token, request_id)
    registrations = {
        **VERIFIED_BINDINGS, **ADDITIONAL_BINDINGS, **GROUNDED_BINDINGS
    }
    # Read registry from canonical source and verify exactly 27 slots.
    from pathlib import Path
    registry = json.loads(
        (Path(__file__).resolve().parents[3] /
         "Agentic_AI/shared/agent_context_registry.json").read_text(encoding="utf-8")
    )
    if set(registry) != {f"AG{i:02d}" for i in range(1, 28)}:
        raise ServiceError(503, "27-agent registry unavailable")
    return {
        **audited,
        "diagnostic": "synthetic_readiness_inventory",
        "total_slots": 27,
        "bound_unqualified": sorted(registrations),
        "not_bound": sorted(set(registry) - set(registrations)),
        "executed_specialists": 0,
        "knowledge_retrieval_proven": False,
        "clinical_release_authorized": False,
    }
