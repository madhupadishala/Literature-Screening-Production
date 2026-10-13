"""Opt-in canonical agent Render WSGI entry point.

Configure Render start: gunicorn Agentic_AI.shared.render_wsgi:application
No clinical execution until NEXUS_CANONICAL_AGENTS_ENABLED=true and
authorized machine scopes + signing key are configured.
"""
import json
import os


def application(environ, start_response):
    path = environ.get("PATH_INFO", "")
    method = environ.get("REQUEST_METHOD", "")
    if path == "/healthz" and method == "GET":
        body = json.dumps({"service": "nexus-canonical-agents",
                           "ready_for_clinical_use": False,
                           "enabled": os.environ.get("NEXUS_CANONICAL_AGENTS_ENABLED") == "true"}).encode()
        start_response("200 OK", [("Content-Type", "application/json"),
                                   ("Cache-Control", "no-store"),
                                   ("Content-Length", str(len(body)))])
        return [body]

    from .agent_api import create_application
    return create_application()(environ, start_response)
