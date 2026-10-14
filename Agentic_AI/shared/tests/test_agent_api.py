import io
import json
import os
import unittest
from unittest.mock import patch

from Agentic_AI.shared.agent_api import create_app
from Agentic_AI.shared.workflow_context import issue_context

SECRET = b"local-only-test-signature-secret-long-enough"
SCOPES = {"machine-secret": {"tenant_id": "t1", "client_id": "c1"}}


def request(agent="AG11", module="literature_screening"):
    env = issue_context(
        verified_principal="employee-1", authorized_tenant="t1", authorized_client="c1",
        module_id=module, document_id="doc-1", workflow_id="wf-1",
        job_id="job-1", agent_id=agent, task_type="assess", signing_secret=SECRET)
    return {"agent_id": agent, "envelope": env, "payload": {"text": "source"}}


class WsgiBoundaryTests(unittest.TestCase):
    def invoke(self, body, bearer="machine-secret", *, enabled=True, adapters=None):
        app = create_app(secret=SECRET, scopes=SCOPES, adapters=adapters)
        data = json.dumps(body).encode()
        environ = {
            "PATH_INFO": "/internal/v1/nexus-agents/execute", "REQUEST_METHOD": "POST",
            "CONTENT_LENGTH": str(len(data)), "wsgi.input": io.BytesIO(data),
            "HTTP_AUTHORIZATION": "Bearer " + bearer,
        }
        status = []
        with patch.dict(os.environ, {"NEXUS_CANONICAL_AGENTS_ENABLED": "true" if enabled else "false"}):
            response = app(environ, lambda s, h: status.append(s))
        return status[0], json.loads(b"".join(response))

    def test_disabled_by_default(self):
        code, result = self.invoke(request(), enabled=False)
        self.assertTrue(code.startswith("503"))

    def test_machine_token_scope(self):
        code, result = self.invoke(request(), bearer="incorrect", adapters={})
        self.assertTrue(code.startswith("403"))

    def test_unimplemented_agent_fails_closed(self):
        code, result = self.invoke(request(agent="AG25"), adapters={})
        self.assertTrue(code.startswith("400"))
        self.assertNotIn("decision", result)

    def test_successful_scoped_adapter(self):
        code, result = self.invoke(
            request(),
            adapters={"AG11": lambda ctx, payload: {"review_required": True, "suggestion": "review"}})
        self.assertTrue(code.startswith("200"))
        self.assertEqual(result["routing"]["tenant_id"], "t1")
        self.assertEqual(result["routing"]["document_id"], "doc-1")
        self.assertEqual(result["result"]["suggestion"], "review")

    def test_tampering_is_rejected(self):
        body = request()
        body["envelope"]["context"]["document_id"] = "other"
        code, result = self.invoke(body, adapters={"AG11": lambda ctx, payload: {}})
        self.assertTrue(code.startswith("400"))


if __name__ == "__main__":
    unittest.main()
