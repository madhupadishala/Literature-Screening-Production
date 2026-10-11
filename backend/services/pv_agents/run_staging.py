"""Controlled development/staging-only launcher for the Nexus PV specialist WSGI service.

Bind loopback by default; any remote staging exposure requires a separately managed
HTTPS reverse proxy and authorization. Do not use wsgiref as a production server.
"""
import os
from wsgiref.simple_server import make_server

from backend.services.pv_agents.service import create_application


def main():
    host = os.environ.get("NEXUS_PV_BIND_HOST", "127.0.0.1")
    if host != "127.0.0.1":
        raise RuntimeError("Development WSGI launcher must bind loopback only")
    port = int(os.environ.get("NEXUS_PV_BIND_PORT", "8765"))
    if not 1024 <= port <= 65535:
        raise ValueError("Use an unprivileged development service port")
    if os.environ.get("NEXUS_PV_AGENTS_ENABLED") != "true":
        raise RuntimeError("Explicit staging-only enablement required")
    app = create_application()
    with make_server(host, port, app) as server:
        print(f"Nexus PV service ready on loopback:{port}", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    main()
