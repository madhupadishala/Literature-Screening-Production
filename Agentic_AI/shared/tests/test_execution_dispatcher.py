import unittest
from types import SimpleNamespace
from Agentic_AI.shared.workflow_context import issue_context, ContextError
from Agentic_AI.shared.execution import AgentDispatcher, AgentNotReady, ExecutionFailure

KEY = b"test-key-is-at-least-thirty-two-bytes-long"
class Router:
    def __init__(self): self.calls=[]
    def build_context_pack(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(tenant_id=kwargs["tenant_id"], citations=[])

class ExecutionTests(unittest.TestCase):
    def setUp(self):
        self.router=Router()
        self.dispatcher=AgentDispatcher(router=self.router, secret=KEY, specialists={"AG01":lambda e,p:{"ok": True}})
    def envelope(self, tenant="tenant1", client="client1", agent="AG01"):
        return issue_context(verified_principal="reviewer1", authorized_tenant=tenant,
            authorized_client=client, module_id="literature_screening",
            document_id="document1", workflow_id="workflow1", job_id="job1",
            agent_id=agent, task_type="extract", signing_secret=KEY)
    def test_registry_and_unbound_specialist(self):
        self.assertEqual(len(self.dispatcher.readiness()),27)
        with self.assertRaises(AgentNotReady):
            self.dispatcher.execute("AG02",envelope=self.envelope(agent="AG02"),
                evidence={"document_id":"document1"},expected_tenant="tenant1",expected_client="client1")
    def test_scope_and_document(self):
        def run(token,evidence):
            return self.dispatcher.execute("AG01",envelope=token,evidence=evidence,
                expected_tenant="tenant1",expected_client="client1")
        result=run(self.envelope(),{"document_id":"document1","text":"synthetic"})
        self.assertEqual(result["routing"]["client_id"],"client1")
        self.assertEqual(self.router.calls[0]["tenant_id"],"tenant1")
        self.router.calls.clear()
        with self.assertRaises(ContextError):
            run(self.envelope(tenant="another"),{"document_id":"document1"})
        with self.assertRaises(ExecutionFailure):
            run(self.envelope(),{"document_id":"wrong"})
        self.assertFalse(self.router.calls)

if __name__=="__main__": unittest.main()
