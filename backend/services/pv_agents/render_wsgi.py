"""Render staging WSGI entrypoint with non-clinical liveness and readiness."""
import json
import os
import logging


def _json(start_response, status, payload, *, head=False):
    body = json.dumps(payload).encode("utf-8")
    start_response(status, [
        ("Content-Type", "application/json"),
        ("Cache-Control", "no-store"),
        ("Content-Length", str(len(body))),
    ])
    return [] if head else [body]


def application(environ, start_response):
    method = environ.get("REQUEST_METHOD")
    path = environ.get("PATH_INFO", "")
    if method in ("GET", "HEAD") and path == "/healthz":
        return _json(start_response, "200 OK", {
            "service": "nexus-pv-agents",
            "state": "enabled" if os.environ.get("NEXUS_PV_AGENTS_ENABLED") == "true" else "disabled",
        }, head=method == "HEAD")

    if method in ("GET", "HEAD") and path == "/readyz":
        # Check only connectivity/configuration; never run clinical code or disclose secrets.
        try:
            if os.environ.get("NEXUS_PV_AUDIT_BACKEND") != "postgres":
                raise RuntimeError("Durable audit required")
            from .postgres_audit import PostgresAuditStore
            PostgresAuditStore(os.environ["NEXUS_PV_AUDIT_DATABASE_URL"])
            scopes = json.loads(os.environ["NEXUS_PV_SERVICE_TOKEN_SCOPES"])
            if not isinstance(scopes, dict) or not scopes:
                raise RuntimeError("Scoped tokens required")
        except Exception as exc:
            # Log exception type only. Never log database URLs, passwords, or source text.
            logging.getLogger("nexus.pv.readiness").warning(
                "Staging readiness unavailable: %s", type(exc).__name__)
            return _json(start_response, "503 Service Unavailable", {
                "service": "nexus-pv-agents", "ready": False,
            }, head=method == "HEAD")
        return _json(start_response, "200 OK", {
            "service": "nexus-pv-agents", "ready": True,
            "clinical_execution_enabled": os.environ.get("NEXUS_PV_AGENTS_ENABLED") == "true",
        }, head=method == "HEAD")

    if path in ("/v1/staging/synthetic-assess", "/v1/staging/specialist-readiness") and method == "POST":
        from .service import ServiceError
        from .staging_probe import assess_probe, specialist_readiness_probe
        try:
            size = int(environ.get("CONTENT_LENGTH") or 0)
            if not 1 <= size <= 512:
                raise ServiceError(400, "Invalid test payload size")
            raw = environ["wsgi.input"].read(size)
            body = json.loads(raw)
            if not isinstance(body, dict) or set(body) != {"request_id"}:
                raise ServiceError(400, "Only a synthetic request ID is allowed")
            authorization = environ.get("HTTP_AUTHORIZATION", "")
            if not authorization.startswith("Bearer "):
                raise ServiceError(401, "Service authentication required")
            probe = specialist_readiness_probe if path.endswith("/specialist-readiness") else assess_probe
            result = probe(authorization[7:], body["request_id"])
            return _json(start_response, "200 OK", result)
        except ServiceError as exc:
            status = {400: "400 Bad Request", 401: "401 Unauthorized",
                      403: "403 Forbidden", 409: "409 Conflict",
                      503: "503 Service Unavailable"}.get(exc.status, "503 Service Unavailable")
            return _json(start_response, status, {"error": exc.message, "route": "hitl"})
        except Exception:
            return _json(start_response, "503 Service Unavailable",
                         {"error": "Staging probe unavailable", "route": "hitl"})

    if os.environ.get("NEXUS_PV_AGENTS_ENABLED") != "true":
        return _json(start_response, "503 Service Unavailable", {
            "error": "Specialist service disabled pending staging qualification",
            "route": "hitl",
        })

    from .service import create_application
    return create_application()(environ, start_response)
