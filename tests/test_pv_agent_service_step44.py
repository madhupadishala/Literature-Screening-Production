"""Sprint 4.4 offline qualification: authenticated service, worker, provenance, durable audit.
Uses controlled mock specialist responses; NOT live clinical/model qualification.
"""
import hashlib
import io
import json
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from backend.services.pv_agents.service import AuditStore, PVAgentService, ServiceError

TOKEN = "controlled-test-token-1234567890"
SCOPE = {"tenant_id": "tenant-a", "client_id": "client-a", "workspace_id": "workspace-a"}
NARRATIVE = "Patient was hospitalized following treatment."
START = NARRATIVE.index("hospitalized")
SPAN = {"start": START, "end": START + len("hospitalized"), "text": "hospitalized"}


def request(**overrides):
    value = dict(SCOPE, request_id="request-1", case_id="case-1",
                 narrative=NARRATIVE, input_sha256=hashlib.sha256(NARRATIVE.encode()).hexdigest())
    value.update(overrides)
    return value


def worker_result(**overrides):
    result = {"review_required": True, "confidence": 0.4, "evidence_spans": [SPAN],
              "knowledge_version": "controlled-kb-test-1", "decision": "needs_review",
              "criteria_met": [], "review_reasons": ["test_only"], "explanation": "Mock result"}
    result.update(overrides)
    return result


class Step44ServiceQualification(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = str(Path(self.temp.name) / "pv-audit.sqlite")
        self.worker = Mock(return_value=worker_result())
        self.app = PVAgentService({TOKEN: [SCOPE]}, AuditStore(self.path),
                                  drug_agent=Mock(), workers={"seriousness": self.worker},
                                  causality_adapter=Mock())

    def test_authenticated_worker_and_persisted_audit(self):
        result = self.app.assess("seriousness", request(), TOKEN)
        self.assertEqual(result["route"], "hitl")
        self.assertTrue(result["review_required"])
        self.assertEqual(result["evidence_spans"], [SPAN])
        with sqlite3.connect(self.path) as db:
            row = db.execute("SELECT audit_id, tenant_id, client_id, workspace_id, output_json FROM pv_agent_audit").fetchone()
        self.assertEqual(row[:4], (result["audit_id"], "tenant-a", "client-a", "workspace-a"))
        self.assertEqual(json.loads(row[4])["request_id"], "request-1")

    def test_token_and_scope_denials_do_not_execute(self):
        for value, token, status in [
            (request(), "invalid-token-1234567890123456", 401),
            (request(tenant_id="tenant-b"), TOKEN, 403),
            (request(client_id="client-b"), TOKEN, 403),
            (request(workspace_id="workspace-b"), TOKEN, 403),
            (request(input_sha256="f"*64), TOKEN, 400),
            (request(narrative="x"*50001), TOKEN, 400),
        ]:
            with self.subTest(status=status, scope=value):
                with self.assertRaises(ServiceError) as raised:
                    self.app.assess("seriousness", value, token)
                self.assertEqual(raised.exception.status, status)
        self.worker.assert_not_called()

    def test_worker_missing_and_provenance_fail_closed(self):
        with self.assertRaises(ServiceError) as missing:
            self.app.assess("causality", request(), TOKEN)
        self.assertEqual(missing.exception.status, 503)
        for invalid in [
            {"review_required": False},
            {"confidence": float("nan")},
            {"confidence": True},
            {"evidence_spans": [dict(SPAN, start=True)]},
            {"evidence_spans": [dict(SPAN, end=START)]},
            {"evidence_spans": [dict(SPAN, text="unrelated")]},
            {"knowledge_version": ""},
        ]:
            with self.subTest(invalid=invalid):
                self.worker.return_value = worker_result(**invalid)
                with self.assertRaises(ServiceError) as raised:
                    self.app.assess("seriousness", request(), TOKEN)
                self.assertEqual(raised.exception.status, 502)
        with sqlite3.connect(self.path) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM pv_agent_audit").fetchone()[0], 0)

    def test_duplicate_request_id_never_overwrites_audit(self):
        original = self.app.assess("seriousness", request(), TOKEN)
        with self.assertRaises(ServiceError) as duplicate:
            self.app.assess("seriousness", request(), TOKEN)
        self.assertEqual(duplicate.exception.status, 409)
        with sqlite3.connect(self.path) as db:
            rows = db.execute("SELECT audit_id FROM pv_agent_audit").fetchall()
        self.assertEqual(rows, [(original["audit_id"],)])

    def test_audit_failure_never_returns_success(self):
        with patch.object(self.app.audit, "append", side_effect=ServiceError(503, "Audit unavailable")):
            with self.assertRaises(ServiceError):
                self.app.assess("seriousness", request(), TOKEN)

    def test_wsgi_authenticated_and_denied_http_contract(self):
        def invoke(payload, token=TOKEN, enabled="true"):
            body = json.dumps(payload).encode()
            env = {"REQUEST_METHOD": "POST", "PATH_INFO": "/v1/agents/seriousness/assess",
                   "CONTENT_LENGTH": str(len(body)), "HTTP_AUTHORIZATION": "Bearer " + token,
                   "wsgi.input": io.BytesIO(body)}
            captured = []
            def start_response(status, headers):
                captured.append((status, dict(headers)))
            with patch.dict(os.environ, {"NEXUS_PV_AGENTS_ENABLED": enabled}):
                output = b"".join(self.app(env, start_response))
            return int(captured[0][0].split()[0]), captured[0][1], json.loads(output)

        status, headers, body = invoke(request())
        self.assertEqual(status, 200)
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertTrue(body["review_required"])
        self.assertEqual(body["route"], "hitl")
        self.assertIn("audit_id", body)
        self.assertEqual(invoke(request(request_id="request-2"), token="not-registered")[0], 401)
        self.assertEqual(invoke(request(request_id="request-3", client_id="client-b"))[0], 403)
        self.assertEqual(invoke(request(request_id="request-4"), enabled="false")[0], 503)
        self.assertEqual(invoke(request())[0], 409)

    def test_invalid_token_registration_fails_at_startup(self):
        for scopes in [{}, {"short": [SCOPE]}, {TOKEN: []},
                       {TOKEN: [{"tenant_id": "tenant-a"}]}]:
            with self.subTest(scopes=scopes):
                with self.assertRaises(ValueError):
                    PVAgentService(scopes, AuditStore(self.path), drug_agent=Mock(), causality_adapter=Mock())


if __name__ == "__main__":
    unittest.main()
