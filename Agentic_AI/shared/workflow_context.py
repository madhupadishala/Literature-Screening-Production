"""Nexus backend-only, authenticated per-execution context for all shared agents.

Only a trusted Nexus backend may mint envelopes after checking tenant/client,
module and document authorization. Never accept browser-created envelopes.
"""
from __future__ import annotations
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
import hashlib
import hmac
import json
import re
import secrets

class ContextError(ValueError):
    pass

_AGENT = re.compile(r"AG(?:0[1-9]|1[0-9]|2[0-7])$")
_MAX_AGE_SECONDS = 3600
_FIELDS = ("tenant_id", "client_id", "module_id", "document_id", "workflow_id",
           "job_id", "agent_id", "principal_id", "task_type", "issued_at", "nonce")

@dataclass(frozen=True)
class WorkflowContext:
    tenant_id: str
    client_id: str
    module_id: str
    document_id: str
    workflow_id: str
    job_id: str
    agent_id: str
    principal_id: str
    task_type: str
    issued_at: int
    nonce: str

    def __post_init__(self):
        for field in _FIELDS:
            value = getattr(self, field)
            if isinstance(value, str) and (not value.strip() or len(value) > 256):
                raise ContextError(f"invalid {field}")
        if not _AGENT.fullmatch(self.agent_id):
            raise ContextError("unknown agent identity")
        if not isinstance(self.issued_at, int) or isinstance(self.issued_at, bool):
            raise ContextError("invalid issued_at")
        if self.module_id not in ("literature_screening", "intake_triage",
                                  "case_processing", "submissions", "signal",
                                  "aggregate_reporting", "medical_information",
                                  "pv_documentation"):
            raise ContextError("unknown module")

    def data(self) -> dict:
        return asdict(self)

def _serialize(data: dict) -> bytes:
    return json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")

def issue_context(*, verified_principal: str, authorized_tenant: str,
                  authorized_client: str, module_id: str, document_id: str,
                  workflow_id: str, job_id: str, agent_id: str, task_type: str,
                  signing_secret: bytes) -> dict:
    """Call only after Nexus authorization; caller controls no tenant claims."""
    if not signing_secret or len(signing_secret) < 32:
        raise ContextError("server signing secret must be at least 32 bytes")
    ctx = WorkflowContext(authorized_tenant, authorized_client, module_id,
                          document_id, workflow_id, job_id, agent_id,
                          verified_principal, task_type,
                          int(datetime.now(timezone.utc).timestamp()),
                          secrets.token_hex(16))
    payload = ctx.data()
    signature = hmac.new(signing_secret, _serialize(payload), hashlib.sha256).hexdigest()
    return {"context": payload, "signature": signature}

def verify_context(envelope: dict, *, expected_agent: str, signing_secret: bytes,
                   expected_tenant: str | None = None,
                   expected_client: str | None = None,
                   now: int | None = None) -> WorkflowContext:
    if not signing_secret or len(signing_secret) < 32:
        raise ContextError("server signing secret must be at least 32 bytes")
    if not isinstance(envelope, dict) or set(envelope) != {"context", "signature"}:
        raise ContextError("invalid envelope")
    raw = envelope["context"]
    if not isinstance(raw, dict) or set(raw) != set(_FIELDS):
        raise ContextError("invalid context fields")
    signature = envelope["signature"]
    if not isinstance(signature, str) or len(signature) != 64:
        raise ContextError("invalid signature")
    expected = hmac.new(signing_secret, _serialize(raw), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise ContextError("context signature mismatch")
    ctx = WorkflowContext(**raw)
    current = now if now is not None else int(datetime.now(timezone.utc).timestamp())
    if ctx.issued_at > current + 30 or current - ctx.issued_at > _MAX_AGE_SECONDS:
        raise ContextError("context expired or not yet valid")
    if ctx.agent_id != expected_agent:
        raise ContextError("agent mismatch")
    if expected_tenant is not None and ctx.tenant_id != expected_tenant:
        raise ContextError("tenant mismatch")
    if expected_client is not None and ctx.client_id != expected_client:
        raise ContextError("client mismatch")
    return ctx

def bind_result(context: WorkflowContext, result: dict) -> dict:
    """Attach routing keys from verified context, not model-generated values."""
    if not isinstance(result, dict):
        raise ContextError("result must be a mapping")
    return {"routing": {k: getattr(context, k) for k in
            ("tenant_id", "client_id", "module_id", "document_id",
             "workflow_id", "job_id", "agent_id")},
            "result": result}
