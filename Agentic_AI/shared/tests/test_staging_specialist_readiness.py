"""Authenticated staging diagnostics prove registry status without clinical activation."""
import io
import json
import os
import unittest
from unittest.mock import patch
from backend.services.pv_agents.render_wsgi import application

TOKEN = "synthetic-authorization-token-for-automated-testing-123"
SCOPE = {"tenant_id":"nexus-staging-tenant","client_id":"nexus-staging-client",
         "workspace_id":"nexus-staging-workspace"}

class InMemoryAudit:
    def __init__(self, db_url):
        self.records = []
    def append(self, request, agent, output):
        self.records.append((request, agent))
        return {**output, "audit_id": "synthetic-audit-record"}

def invoke(path, *, token=None):
    payload = json.dumps({"request_id": "synthetic-agent-registry-1"}).encode()
    env = {"REQUEST_METHOD": "POST", "PATH_INFO": path, "CONTENT_LENGTH": str(len(payload)),
           "wsgi.input": io.BytesIO(payload)}
    if token is not None:
        env["HTTP_AUTHORIZATION"] = "Bearer " + token
    out = {}
    def start(status, headers):
        out["status"] = status
    raw = b"".join(application(env, start))
    return out["status"], json.loads(raw)

class StagingReadinessTest(unittest.TestCase):
    def setUp(self):
        self.ctx = patch.dict(os.environ, {
            "NEXUS_PV_STAGING_PROBE_ENABLED":"true", "NEXUS_PV_AGENTS_ENABLED":"false",
            "NEXUS_PV_AUDIT_DATABASE_URL":"postgresql://synthetic-never-connect",
            "NEXUS_PV_SERVICE_TOKEN_SCOPES":json.dumps({TOKEN:[SCOPE]}),
        })
        self.ctx.start()
        self.addCleanup(self.ctx.stop)

    def test_authenticated_inventory_has_27_slots_and_no_clinical_execution(self):
        with patch("backend.services.pv_agents.staging_probe.PostgresAuditStore", InMemoryAudit):
            status, result = invoke("/v1/staging/specialist-readiness", token=TOKEN)
        self.assertEqual(status, "200 OK")
        self.assertEqual(result["total_slots"], 27)
        self.assertEqual(len(result["bound_unqualified"]) + len(result["not_bound"]), 27)
        self.assertEqual(result["executed_specialists"], 0)
        self.assertFalse(result["knowledge_retrieval_proven"])
        self.assertFalse(result["clinical_release_authorized"])
        self.assertEqual(result["audit_id"], "synthetic-audit-record")

    def test_real_signed_dispatch_executes_synthetic_native_engines(self):
        with patch("backend.services.pv_agents.staging_probe.PostgresAuditStore", InMemoryAudit):
            status, result = invoke("/v1/staging/synthetic-dispatch", token=TOKEN)
        self.assertEqual(status, "200 OK")
        self.assertEqual(result["total_slots"], 27)
        self.assertGreaterEqual(result["executed_specialists"], 4)
        for agent in ("AG05", "AG07", "AG16", "AG27", "AG25"):
            self.assertEqual(result["outcomes"][agent], "executed_review_only")
        self.assertFalse(result["knowledge_retrieval_proven"])
        self.assertFalse(result["clinical_release_authorized"])

    def test_invalid_token_rejected(self):
        with patch("backend.services.pv_agents.staging_probe.PostgresAuditStore", InMemoryAudit):
            status, result = invoke("/v1/staging/specialist-readiness", token="incorrect-secret")
        self.assertEqual(status, "401 Unauthorized")

    def test_missing_auth_rejected(self):
        status, result = invoke("/v1/staging/specialist-readiness")
        self.assertEqual(status, "401 Unauthorized")

    def test_diagnostic_disabled_by_default(self):
        os.environ["NEXUS_PV_STAGING_PROBE_ENABLED"] = "false"
        with patch("backend.services.pv_agents.staging_probe.PostgresAuditStore", InMemoryAudit):
            status, result = invoke("/v1/staging/specialist-readiness", token=TOKEN)
        self.assertEqual(status, "503 Service Unavailable")

if __name__ == "__main__":
    unittest.main()
