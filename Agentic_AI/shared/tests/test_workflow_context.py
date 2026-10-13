import unittest
from Agentic_AI.shared.workflow_context import issue_context, verify_context, bind_result, ContextError

KEY = b"local-test-only-secret-not-for-production-123456"
class WorkflowContextTests(unittest.TestCase):
    def issue(self, agent="AG02", module="literature_screening", document="PMID-1"):
        return issue_context(verified_principal="user-1", authorized_tenant="tenant-1",
            authorized_client="client-1", module_id=module, document_id=document,
            workflow_id="workflow-1", job_id="job-1", agent_id=agent,
            task_type="extract", signing_secret=KEY)

    def test_each_agent_identity(self):
        for i in range(1, 28):
            agent=f"AG{i:02}"
            c=verify_context(self.issue(agent=agent), expected_agent=agent, signing_secret=KEY)
            self.assertEqual(c.agent_id, agent)

    def test_cross_module_isolation(self):
        a=verify_context(self.issue(), expected_agent="AG02", signing_secret=KEY)
        b=verify_context(self.issue(module="intake_triage", document="DOC-2"),
                         expected_agent="AG02", signing_secret=KEY)
        self.assertNotEqual(bind_result(a, {})["routing"], bind_result(b, {})["routing"])

    def test_tampered_tenant_fails(self):
        token=self.issue()
        token["context"]["tenant_id"]="another-tenant"
        with self.assertRaises(ContextError):
            verify_context(token, expected_agent="AG02", signing_secret=KEY)

    def test_wrong_agent_fails(self):
        with self.assertRaises(ContextError):
            verify_context(self.issue(), expected_agent="AG01", signing_secret=KEY)

    def test_expired_fails(self):
        token=self.issue()
        with self.assertRaises(ContextError):
            verify_context(token, expected_agent="AG02", signing_secret=KEY,
                           now=token["context"]["issued_at"] + 3601)

if __name__ == "__main__":
    unittest.main()
