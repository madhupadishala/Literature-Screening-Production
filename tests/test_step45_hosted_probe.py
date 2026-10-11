"""Pure contract tests for a fixed, synthetic-only hosted audit probe."""
import hashlib
import io
import json
import os
import unittest
from unittest.mock import Mock, patch

from backend.services.pv_agents.render_wsgi import application
from backend.services.pv_agents.staging_probe import TEXT, SCOPE


TOKEN = "controlled-staging-test-bearer-token-1234567890"


def invoke(body, token=TOKEN):
    raw = json.dumps(body).encode()
    env = {"REQUEST_METHOD": "POST", "PATH_INFO": "/v1/staging/synthetic-assess",
           "CONTENT_LENGTH": str(len(raw)), "wsgi.input": io.BytesIO(raw),
           "HTTP_AUTHORIZATION": "Bearer " + token}
    status = []
    response = json.loads(b"".join(application(env, lambda s, h: status.append(s))))
    return int(status[0].split()[0]), response


class StagingProbeTests(unittest.TestCase):
    def setUp(self):
        self.config = patch.dict(os.environ, {
            "NEXUS_PV_STAGING_PROBE_ENABLED": "true", "NEXUS_PV_AGENTS_ENABLED": "false",
            "NEXUS_PV_SERVICE_TOKEN_SCOPES": json.dumps({TOKEN: [SCOPE]}),
            "NEXUS_PV_AUDIT_DATABASE_URL": "postgresql://fake/db",
        })
        self.config.start()
        self.addCleanup(self.config.stop)
        self.audit = Mock()
        self.audit.append.side_effect = lambda req, agent, output: dict(output, audit_id="audit-fixture")
        self.mock_store = patch("backend.services.pv_agents.staging_probe.PostgresAuditStore",
                                return_value=self.audit)
        self.mock_store.start()
        self.addCleanup(self.mock_store.stop)

    def test_auth_and_audit_with_only_synthetic_digest(self):
        status, body = invoke({"request_id": "controlled-1"})
        self.assertEqual(status, 200)
        self.assertTrue(body["synthetic_only"])
        self.assertTrue(body["review_required"])
        self.assertEqual(body["input_sha256"], hashlib.sha256(TEXT.encode()).hexdigest())
        self.assertNotIn("narrative", body)
        self.assertEqual(self.audit.append.call_count, 1)

    def test_wrong_token_and_payload_rejected_before_audit(self):
        self.assertEqual(invoke({"request_id": "bad-token"}, token="wrong")[0], 401)
        self.assertEqual(invoke({"request_id": "bad", "narrative": "not allowed"})[0], 400)
        self.assertEqual(invoke({"request_id": "../../bad"})[0], 400)
        self.audit.append.assert_not_called()

    def test_wrong_client_scope_denied(self):
        with patch.dict(os.environ, {"NEXUS_PV_SERVICE_TOKEN_SCOPES": json.dumps({
            TOKEN: [{**SCOPE, "client_id": "wrong-client"}]
        })}):
            self.assertEqual(invoke({"request_id": "wrong-client"})[0], 403)
        self.audit.append.assert_not_called()

    def test_clinical_execution_or_probe_disabled_fails_closed(self):
        with patch.dict(os.environ, {"NEXUS_PV_AGENTS_ENABLED": "true"}):
            self.assertEqual(invoke({"request_id": "no-clinical"})[0], 503)
        with patch.dict(os.environ, {"NEXUS_PV_STAGING_PROBE_ENABLED": "false"}):
            self.assertEqual(invoke({"request_id": "disabled"})[0], 503)
        self.audit.append.assert_not_called()

    def test_duplicate_replay_is_409(self):
        from backend.services.pv_agents.service import ServiceError
        self.audit.append.side_effect = ServiceError(409, "Request ID already recorded")
        self.assertEqual(invoke({"request_id": "duplicate"})[0], 409)


if __name__ == "__main__":
    unittest.main()
