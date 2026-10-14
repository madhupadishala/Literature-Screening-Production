"""Internal Nexus agent invocation endpoint (WSGI).

Nexus must supply a scoped machine token and a *server-issued* signed context.
This endpoint is not public/user-login authentication and is disabled by default.
"""
from __future__ import annotations
import hmac
import json
import os
from .canonical_adapters import CANONICAL_ADAPTERS
from .module_dispatch import CanonicalAgentDispatcher
from .workflow_context import ContextError


def _response(start_response, status: int, body: dict):
    labels = {200: "OK", 400: "Bad Request", 401: "Unauthorized",
              403: "Forbidden", 404: "Not Found", 413: "Payload Too Large",
              503: "Service Unavailable"}
    data = json.dumps(body, ensure_ascii=False, allow_nan=False).encode("utf-8")
    start_response(f"{status} {labels[status]}", [
        ("Content-Type", "application/json"),
        ("Cache-Control", "no-store"), ("Content-Length", str(len(data)))])
    return [data]


def create_app(*, secret: bytes, scopes: dict[str, dict],
               adapters: dict | None = None):
    """Scopes: bearer token => server-configured tenant/client authorization.

    Add canonical adapters only when reviewed and operational.
    """
    dispatcher = CanonicalAgentDispatcher(
        signing_secret=secret,
        adapters=CANONICAL_ADAPTERS if adapters is None else adapters,
        enforce_governed_kb=(adapters is None))

    def app(environ, start_response):
        if environ.get("PATH_INFO") != "/internal/v1/nexus-agents/execute" or environ.get("REQUEST_METHOD") != "POST":
            return _response(start_response, 404, {"error": "not_found"})
        if os.environ.get("NEXUS_CANONICAL_AGENTS_ENABLED") != "true":
            return _response(start_response, 503, {"error": "agents_not_enabled"})
        bearer = environ.get("HTTP_AUTHORIZATION", "")
        if not bearer.startswith("Bearer "):
            return _response(start_response, 401, {"error": "unauthorized"})
        matched = next((s for t, s in scopes.items() if hmac.compare_digest(t, bearer[7:])), None)
        if not isinstance(matched, dict) or not matched.get("tenant_id") or not matched.get("client_id"):
            return _response(start_response, 403, {"error": "invalid_scope"})
        try:
            size = int(environ.get("CONTENT_LENGTH") or "0")
            if size < 1 or size > 2_000_000:
                return _response(start_response, 413, {"error": "invalid_payload_size"})
            request = json.loads(environ["wsgi.input"].read(size))
            if not isinstance(request, dict) or set(request) != {"agent_id", "envelope", "payload"}:
                raise ValueError("invalid request")
            result = dispatcher.execute(
                agent_id=request["agent_id"], envelope=request["envelope"],
                payload=request["payload"], authorized_tenant=matched["tenant_id"],
                authorized_client=matched["client_id"])
            return _response(start_response, 200, result)
        except (ContextError, ValueError, TypeError, KeyError):
            return _response(start_response, 400, {"error": "invalid_or_unauthorized_job"})
        except Exception:
            # Fail closed; never send source text or traces to clients.
            return _response(start_response, 503, {"error": "worker_unavailable", "review_required": True})
    return app


def create_application():
    """Opt-in service bootstrap; do not reuse public-user tokens here."""
    secret = os.environ["NEXUS_AGENT_CONTEXT_SIGNING_SECRET"].encode("utf-8")
    scopes = json.loads(os.environ["NEXUS_AGENT_MACHINE_TOKEN_SCOPES"])
    if len(secret) < 32 or not isinstance(scopes, dict):
        raise ValueError("Invalid Nexus agent service configuration")
    return create_app(secret=secret, scopes=scopes)
