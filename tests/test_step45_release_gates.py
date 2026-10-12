"""Step 4.5 release-blocking integration regression (synthetic/offline only).

These tests explicitly DO NOT constitute hosted provider, KB corpus, or human approval.
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

from backend.services.pv_agents.service import PVAgentService, AuditStore


TOKEN = "synthetic-step45-token-more-than-24"
SCOPE = {"tenant_id": "synthetic-t", "client_id": "synthetic-c", "workspace_id": "synthetic-w"}
TEXT = "A synthetic patient was hospitalized."


def payload(request_id="step45-1", **changes):
    value = dict(SCOPE, request_id=request_id, case_id="synthetic-case",
                 narrative=TEXT, input_sha256=hashlib.sha256(TEXT.encode()).hexdigest())
    value.update(changes)
    return value


def dispatch(app, request, token=TOKEN, enabled="true"):
    raw = json.dumps(request).encode()
    environ = {"REQUEST_METHOD": "POST", "PATH_INFO": "/v1/agents/seriousness/assess",
               "CONTENT_LENGTH": str(len(raw)), "wsgi.input": io.BytesIO(raw),
               "HTTP_AUTHORIZATION": "Bearer " + token}
    response = []
    with patch.dict(os.environ, {"NEXUS_PV_AGENTS_ENABLED": enabled}):
        result = b"".join(app(environ, lambda status, headers: response.append((status, headers))))
    return int(response[0][0].split()[0]), json.loads(result), dict(response[0][1])


class Step45ReleaseSafetyGates(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = str(Path(self.tmp.name) / "audit.db")
        self.worker = Mock(return_value={
            "review_required": True, "confidence": 0.3, "evidence_spans": [],
            "knowledge_version": "synthetic-approved-revision", "decision": "needs_review",
            "criteria_met": [], "review_reasons": ["synthetic"], "explanation": "Expert review required",
        })
        self.service = PVAgentService({TOKEN: [SCOPE]}, AuditStore(self.db),
                                     drug_agent=Mock(), workers={"seriousness": self.worker},
                                     causality_adapter=Mock())

    def test_disabled_service_never_dispatches_or_audits(self):
        status, result, headers = dispatch(self.service, payload(), enabled="false")
        self.assertEqual(status, 503)
        self.assertEqual(result["route"], "hitl")
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.worker.assert_not_called()
        with sqlite3.connect(self.db) as db:
            self.assertEqual(db.execute("select count(*) from pv_agent_audit").fetchone()[0], 0)

    def test_authentication_and_tenant_client_workspace_negative_matrix(self):
        cases = [
            (payload(), "wrong-token-longer-than-twenty-four", 401),
            (payload(tenant_id="foreign"), TOKEN, 403),
            (payload(client_id="foreign"), TOKEN, 403),
            (payload(workspace_id="foreign"), TOKEN, 403),
            (payload(input_sha256="0" * 64), TOKEN, 400),
        ]
        for request, token, expected in cases:
            with self.subTest(expected=expected, request=request):
                status, result, _ = dispatch(self.service, request, token=token)
                self.assertEqual(status, expected)
                self.assertEqual(result["route"], "hitl")
        self.worker.assert_not_called()

    def test_restart_preserves_evidence_and_rejects_replay(self):
        status, response, _ = dispatch(self.service, payload())
        self.assertEqual(status, 200)
        self.assertTrue(response["review_required"])
        self.assertEqual(response["route"], "hitl")
        audit_id = response["audit_id"]
        restarted = PVAgentService({TOKEN: [SCOPE]}, AuditStore(self.db),
                                   drug_agent=Mock(), workers={"seriousness": self.worker},
                                   causality_adapter=Mock())
        replay_status, _, _ = dispatch(restarted, payload())
        self.assertEqual(replay_status, 409)
        with sqlite3.connect(self.db) as db:
            saved = db.execute("SELECT output_json FROM pv_agent_audit WHERE audit_id=?",
                               (audit_id,)).fetchone()
            self.assertEqual(db.execute("SELECT COUNT(*) FROM pv_agent_audit").fetchone()[0], 1)
        self.assertIsNotNone(saved)
        self.assertEqual(json.loads(saved[0])["input_sha256"], payload()["input_sha256"])

    def test_missing_worker_and_audit_outage_never_return_success(self):
        self.service.workers.clear()
        self.assertEqual(dispatch(self.service, payload())[0], 503)
        self.worker.assert_not_called()
        self.service.workers["seriousness"] = self.worker
        with patch.object(self.service.audit, "append", side_effect=OSError("DB disconnected")):
            status, result, _ = dispatch(self.service, payload())
        self.assertEqual(status, 503)
        self.assertEqual(result["route"], "hitl")
        self.assertNotIn("audit_id", result)

    def test_invalid_worker_output_prevents_audit(self):
        self.worker.return_value = {"review_required": False}
        self.assertEqual(dispatch(self.service, payload())[0], 502)
        with sqlite3.connect(self.db) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM pv_agent_audit").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
