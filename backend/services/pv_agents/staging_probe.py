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
    # Dedicated staging-only credential: never place it into general clinical
    # NEXUS_PV_SERVICE_TOKEN_SCOPES or grant access to clinical agent endpoints.
    import hmac
    diagnostic_token = os.environ.get("NEXUS_PV_STAGING_DIAGNOSTIC_TOKEN", "")
    if len(diagnostic_token) < 64 or len(token) != len(diagnostic_token) or not hmac.compare_digest(token, diagnostic_token):
        raise ServiceError(401, "Staging diagnostic authentication required")
    record = dict(SCOPE, request_id=request_id, case_id="staging-probe",
                  input_sha256=hashlib.sha256(TEXT.encode()).hexdigest())
    output = dict(record, schema_version="nexus.staging-probe/1",
                  route="hitl", review_required=True,
                  synthetic_only=True, clinical_release_authorized=False,
                  agent="staging-probe", knowledge_version="none; diagnostic only")
    scopes = {diagnostic_token: [dict(SCOPE, role="staging_diagnostic_runner",
                allowed_routes=["/v1/staging/*"])]}
    app = PVAgentService(scopes, PostgresAuditStore(os.environ["NEXUS_PV_AUDIT_DATABASE_URL"]),
                         drug_agent=_UnusedAgent(), workers={}, causality_adapter=_UnusedAgent())
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

def synthetic_dispatch_batch(token, request_id):
    """Execute available canonical specialists on fixed non-patient test content.

    Never selects runtime providers, tenants, clients, documents or engine inputs
    from an HTTP payload. Read-only synthetic context router is explicitly NOT a
    test of live client KB retrieval. No clinical flag is enabled.
    """
    receipt = assess_probe(token, request_id)
    from types import SimpleNamespace
    from Agentic_AI.shared.execution.factory import build_dispatcher
    from Agentic_AI.shared.workflow_context import issue_context

    class SyntheticRouter:
        def build_context_pack(self, *, tenant_id, client_id, agent_name, task, evidence_package):
            if (tenant_id, client_id) != (SCOPE["tenant_id"], SCOPE["client_id"]):
                raise PermissionError("synthetic scope mismatch")
            return SimpleNamespace(
                tenant_id=tenant_id, client_id=client_id, citations=[],
                product_master_matches=[{"trade_name": "Metformin", "client_id": client_id}],
                approved_documents=[],
            )

    signing = b"only-a-fixed-synthetic-test-key-never-for-production-use"
    dispatcher = build_dispatcher(signing_secret=signing, router=SyntheticRouter())
    document_id = "nexus-synthetic-icsr-0001"
    narrative = ("SYNTHETIC TEST: A 45-year-old patient was hospitalized. "
                 "Metformin prescribed for diabetes. ALT 120 U/L recorded. "
                 "A clinician reported nausea following medication.")
    evidence = {
        "document_id": document_id, "case_id": document_id,
        "text": narrative, "title": "Synthetic safety case",
        "source_type": "spontaneous", "candidate_drugs": ["Metformin"],
        "source_language": "English", "target_language": "English",
        "case": {"case_id": document_id, "narrative": narrative,
                 "drugs": [{"name": "Metformin", "role": "suspect"}],
                 "events": [{"verbatim": "Nausea"}]},
        "article": {"record_id": document_id, "title": "Synthetic safety case",
                    "abstract": narrative, "mentions_products": ["Metformin"]},
    }
    outcomes = {}
    for agent_id in sorted(dispatcher.registry):
        if agent_id not in dispatcher.specialists:
            outcomes[agent_id] = "not_bound"
            continue
        try:
            envelope = issue_context(
                verified_principal="synthetic-staging-probe",
                authorized_tenant=SCOPE["tenant_id"], authorized_client=SCOPE["client_id"],
                module_id="case_processing", document_id=document_id,
                workflow_id="synthetic-workflow", job_id=f"synthetic-{agent_id}",
                agent_id=agent_id, task_type="synthetic_readiness",
                signing_secret=signing)
            result = dispatcher.execute(
                agent_id, envelope=envelope, evidence=evidence,
                expected_tenant=SCOPE["tenant_id"], expected_client=SCOPE["client_id"])
            if result.get("result", {}).get("status") != "review_required":
                raise RuntimeError("synthetic specialist bypassed mandatory review")
            outcomes[agent_id] = "executed_review_only"
        except Exception:
            # Never reflect source content or provider error details from a probe.
            outcomes[agent_id] = "execution_failed_closed"
    return {
        **receipt,
        "diagnostic": "synthetic_dispatch_execution",
        "total_slots": len(outcomes),
        "outcomes": outcomes,
        "executed_specialists": sum(x == "executed_review_only" for x in outcomes.values()),
        "knowledge_retrieval_proven": False,
        "clinical_release_authorized": False,
    }
