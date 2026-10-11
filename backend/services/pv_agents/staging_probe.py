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
