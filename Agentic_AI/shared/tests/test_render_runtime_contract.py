"""Runtime contract tests for the exact Render staging WSGI entrypoint.
Pure liveness must not touch the DB; readiness must fail closed without dependencies.
"""
import io
import json
import os
import unittest
from unittest.mock import patch
from backend.services.pv_agents.render_wsgi import application

def request(path, method="GET", body=b""):
    output = {}
    def start(status, headers):
        output["status"] = status
        output["headers"] = dict(headers)
    environ = {"REQUEST_METHOD": method, "PATH_INFO": path, "wsgi.input": io.BytesIO(body),
               "CONTENT_LENGTH": str(len(body))}
    output["body"] = b"".join(application(environ, start))
    return output

class RenderRuntimeContract(unittest.TestCase):
    def test_healthz_200_even_when_clinical_disabled(self):
        with patch.dict(os.environ, {"NEXUS_PV_AGENTS_ENABLED":"false"}):
            response = request("/healthz")
        self.assertEqual(response["status"], "200 OK")
        self.assertEqual(json.loads(response["body"])["state"], "disabled")

    def test_root_is_liveness_when_clinical_disabled(self):
        with patch.dict(os.environ, {"NEXUS_PV_AGENTS_ENABLED":"false"}):
            response = request("/")
        self.assertEqual(response["status"], "200 OK")
        self.assertEqual(json.loads(response["body"])["state"], "disabled")

    def test_head_root_has_no_body(self):
        response = request("/", "HEAD")
        self.assertEqual(response["status"], "200 OK")
        self.assertEqual(response["body"], b"")

    def test_head_healthz_supported(self):
        response = request('/healthz', 'HEAD')
        self.assertEqual(response['status'], '200 OK')
        self.assertEqual(response['body'], b'')

    def test_readyz_503_when_audit_backend_missing(self):
        with patch.dict(os.environ, {"NEXUS_PV_AUDIT_BACKEND":"sqlite"}):
            response = request("/readyz")
        self.assertEqual(response["status"], "503 Service Unavailable")

    def test_readyz_200_with_healthy_scoped_deps(self):
        with patch.dict(os.environ, {
            "NEXUS_PV_AUDIT_BACKEND": "postgres",
            "NEXUS_PV_AUDIT_DATABASE_URL": "synthetic-non-network",
            "NEXUS_PV_SERVICE_TOKEN_SCOPES": json.dumps({
                "synthetic-not-for-production-auth-token-12345": [{
                    "tenant_id":"orcimed", "client_id":"hetero", "workspace_id":"w1"
                }]
            })
        }):
            with patch("backend.services.pv_agents.postgres_audit.PostgresAuditStore"):
                response = request("/readyz")
        self.assertEqual(response["status"], "200 OK")
        self.assertEqual(json.loads(response["body"])["ready"], True)
        with patch.dict(os.environ, {"NEXUS_PV_AUDIT_BACKEND":"postgres", "NEXUS_PV_AUDIT_DATABASE_URL":"synthetic-non-network", "NEXUS_PV_SERVICE_TOKEN_SCOPES": json.dumps({"synthetic-token":[{"tenant_id":"orcimed", "client_id":"hetero", "workspace_id":"w1"}]})}):
            with patch("backend.services.pv_agents.postgres_audit.PostgresAuditStore"):
                head = request("/readyz", "HEAD")
        self.assertEqual(head["status"], "200 OK")
        self.assertEqual(head["body"], b"")

    def test_host_factory_uses_postgres_not_local_sqlite(self):
        from backend.services.pv_agents.service import create_application
        with patch.dict(os.environ, {
            "NEXUS_PV_AUDIT_BACKEND": "postgres",
            "NEXUS_PV_AUDIT_DATABASE_URL": "postgresql://synthetic-never-connect",
            "NEXUS_PV_SERVICE_TOKEN_SCOPES": json.dumps({
                "synthetic-not-for-production-auth-token-12345": [{
                    "tenant_id": "orcimed", "client_id": "hetero", "workspace_id": "w1"
                }]
            }),
            "NEXUS_PV_REGISTER_SPECIALISTS": "false",
        }):
            with patch("backend.services.pv_agents.postgres_audit.PostgresAuditStore") as store:
                app = create_application()
                store.assert_called_once_with("postgresql://synthetic-never-connect")
                self.assertIs(app.audit, store.return_value)

    def test_host_factory_rejects_sqlite(self):
        from backend.services.pv_agents.service import create_application
        with patch.dict(os.environ, {"NEXUS_PV_AUDIT_BACKEND": "sqlite"}):
            with self.assertRaises(RuntimeError):
                create_application()

    def test_disabled_agent_route_returns_503(self):
        with patch.dict(os.environ, {"NEXUS_PV_AGENTS_ENABLED":"false"}):
            response = request("/v1/agents/drug-role/assess", "POST", b"{}")
        self.assertEqual(response["status"], "503 Service Unavailable")

if __name__ == "__main__":
    unittest.main()
