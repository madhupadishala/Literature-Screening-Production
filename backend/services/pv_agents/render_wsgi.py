"""Render staging WSGI entrypoint with non-clinical liveness and readiness."""
import json
import os


def _json(start_response, status, payload):
    body = json.dumps(payload).encode("utf-8")
    start_response(status, [
        ("Content-Type", "application/json"),
        ("Cache-Control", "no-store"),
        ("Content-Length", str(len(body))),
    ])
    return [body]


def application(environ, start_response):
    method = environ.get("REQUEST_METHOD")
    path = environ.get("PATH_INFO", "")
    if method == "GET" and path == "/healthz":
        return _json(start_response, "200 OK", {
            "service": "nexus-pv-agents",
            "state": "enabled" if os.environ.get("NEXUS_PV_AGENTS_ENABLED") == "true" else "disabled",
        })

    if method == "GET" and path == "/readyz":
        # Check only connectivity/configuration; never run clinical code or disclose secrets.
        try:
            if os.environ.get("NEXUS_PV_AUDIT_BACKEND") != "postgres":
                raise RuntimeError("Durable audit required")
            from .postgres_audit import PostgresAuditStore
            PostgresAuditStore(os.environ["NEXUS_PV_AUDIT_DATABASE_URL"])
            scopes = json.loads(os.environ["NEXUS_PV_SERVICE_TOKEN_SCOPES"])
            if not isinstance(scopes, dict) or not scopes:
                raise RuntimeError("Scoped tokens required")
        except Exception:
            return _json(start_response, "503 Service Unavailable", {
                "service": "nexus-pv-agents", "ready": False,
            })
        return _json(start_response, "200 OK", {
            "service": "nexus-pv-agents", "ready": True,
            "clinical_execution_enabled": os.environ.get("NEXUS_PV_AGENTS_ENABLED") == "true",
        })

    if os.environ.get("NEXUS_PV_AGENTS_ENABLED") != "true":
        return _json(start_response, "503 Service Unavailable", {
            "error": "Specialist service disabled pending staging qualification",
            "route": "hitl",
        })

    from .service import create_application
    return create_application()(environ, start_response)
