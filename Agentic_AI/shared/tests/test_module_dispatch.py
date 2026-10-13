"""Isolation and fail-closed tests for the shared Nexus dispatch boundary."""
import unittest
from concurrent.futures import ThreadPoolExecutor

from Agentic_AI.shared.module_dispatch import CanonicalAgentDispatcher
from Agentic_AI.shared.workflow_context import ContextError, issue_context

SECRET = b"test-key-only-not-for-production-very-long-secret"


def envelope(agent, module, doc, job, tenant="tenant-a", client="client-a"):
    return issue_context(
        verified_principal="employee-1", authorized_tenant=tenant,
        authorized_client=client, module_id=module, document_id=doc,
        workflow_id="workflow-" + job, job_id=job, agent_id=agent,
        task_type="review", signing_secret=SECRET)


class SharedDispatcherTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        def adapter(ctx, payload):
            self.calls.append((ctx, payload))
            return {"decision": payload["decision"]}
        self.dispatch = CanonicalAgentDispatcher(
            signing_secret=SECRET, adapters={"AG11": adapter})

    def test_two_modules_same_agent_have_distinct_routing(self):
        a = self.dispatch.execute(
            agent_id="AG11",
            envelope=envelope("AG11", "literature_screening", "PMID-123", "job-1"),
            payload={"decision": "review"}, authorized_tenant="tenant-a",
            authorized_client="client-a")
        b = self.dispatch.execute(
            agent_id="AG11",
            envelope=envelope("AG11", "intake_triage", "ICSR-123", "job-2"),
            payload={"decision": "serious"}, authorized_tenant="tenant-a",
            authorized_client="client-a")
        self.assertEqual(a["routing"]["document_id"], "PMID-123")
        self.assertEqual(b["routing"]["document_id"], "ICSR-123")
        self.assertNotEqual(a["routing"]["job_id"], b["routing"]["job_id"])
        self.assertNotEqual(a["routing"]["module_id"], b["routing"]["module_id"])

    def test_cross_tenant_rejected(self):
        with self.assertRaises(ContextError):
            self.dispatch.execute(
                agent_id="AG11",
                envelope=envelope("AG11", "intake_triage", "x", "job-3"),
                payload={}, authorized_tenant="tenant-b",
                authorized_client="client-a")

    def test_missing_adapter_fails_closed(self):
        with self.assertRaisesRegex(ContextError, "not connected"):
            self.dispatch.execute(
                agent_id="AG25",
                envelope=envelope("AG25", "intake_triage", "x", "job-4"),
                payload={}, authorized_tenant="tenant-a",
                authorized_client="client-a")

    def test_not_allowed_agent_fails_closed(self):
        with self.assertRaisesRegex(ContextError, "not authorized"):
            self.dispatch.execute(
                agent_id="AG18",
                envelope=envelope("AG18", "intake_triage", "x", "job-5"),
                payload={}, authorized_tenant="tenant-a",
                authorized_client="client-a")

    def test_200_concurrent_jobs_cannot_cross_route(self):
        dispatcher = CanonicalAgentDispatcher(
            signing_secret=SECRET,
            adapters={"AG11": lambda ctx, data: {"tag": data["tag"], "review_required": True}},
        )
        modules = ("literature_screening", "intake_triage", "case_processing", "submissions")
        def one(n):
            module = modules[n % len(modules)]
            token = envelope("AG11", module, f"doc-{n}", f"job-{n}",
                             tenant=f"tenant-{n % 3}", client=f"client-{n % 5}")
            return dispatcher.execute(
                agent_id="AG11", envelope=token, payload={"tag": n},
                authorized_tenant=f"tenant-{n % 3}",
                authorized_client=f"client-{n % 5}",
            )
        with ThreadPoolExecutor(max_workers=16) as pool:
            outputs = list(pool.map(one, range(200)))
        for n, output in enumerate(outputs):
            self.assertEqual(output["result"]["tag"], n)
            self.assertEqual(output["routing"]["document_id"], f"doc-{n}")
            self.assertEqual(output["routing"]["job_id"], f"job-{n}")
            self.assertEqual(output["routing"]["tenant_id"], f"tenant-{n % 3}")
            self.assertEqual(output["routing"]["client_id"], f"client-{n % 5}")

    def test_tampering_rejected(self):
        token = envelope("AG11", "literature_screening", "x", "job-6")
        token["context"]["module_id"] = "intake_triage"
        with self.assertRaises(ContextError):
            self.dispatch.execute(
                agent_id="AG11", envelope=token, payload={},
                authorized_tenant="tenant-a", authorized_client="client-a")


if __name__ == "__main__":
    unittest.main()
