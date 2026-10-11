"""Render staging WSGI entrypoint. No credentials or clinical execution in standby."""
import json
import os


def application(environ, start_response):
    if os.environ.get("NEXUS_PV_AGENTS_ENABLED") != "true":
        if environ.get("REQUEST_METHOD") == "GET" and environ.get("PATH_INFO") == "/healthz":
            status, payload = "200 OK", {"service": "nexus-pv-agents", "state": "disabled"}
        else:
            status, payload = "503 Service Unavailable", {
                "error": "Specialist service disabled pending staging qualification",
                "route": "hitl",
            }
        body = json.dumps(payload).encode("utf-8")
        start_response(status, [
            ("Content-Type", "application/json"),
            ("Cache-Control", "no-store"),
            ("Content-Length", str(len(body))),
        ])
        return [body]

    from .service import create_application
    # Initialization deliberately fails closed if credentials or durable DB are absent.
    return create_application()(environ, start_response)
