"""Offline native runtime batch contract and signed routing verification."""
import unittest
from types import SimpleNamespace
from Agentic_AI.shared.execution.native_runtime_bindings import make_native_runtime_bindings, RUNTIME_ROUTES
from Agentic_AI.shared.execution.factory import build_dispatcher
from Agentic_AI.shared.workflow_context import issue_context, ContextError

KEY=b"batch-two-local-only-signed-context-secret-at-least-32"
IDS=("AG02","AG08","AG12","AG17","AG20","AG26")

class SyntheticNative:
    def __init__(self, agent): self.agent=agent; self.calls=[]
    def execute(self, request):
        self.calls.append(request)
        return dict(agent_id=self.agent,document_id=request["document_id"],
                    tenant_id=request["tenant_id"],client_id=request["client_id"],
                    status="review_required",requires_human_review=True,
                    assessment={"synthetic":True, "source_document":request["document_id"]})

class Router:
    def __init__(self): self.calls=[]
    def build_context_pack(self,**k):
        self.calls.append(k)
        return SimpleNamespace(tenant_id=k["tenant_id"],client_id=k["client_id"],
                               citations=[{"rule_id":"SYN-KB", "source":"synthetic-only"}])

class NativeBatchContracts(unittest.TestCase):
    def setUp(self):
        self.engines={a:SyntheticNative(a) for a in IDS}
        self.router=Router()
        self.dispatcher=build_dispatcher(signing_secret=KEY,router=self.router,native_runtimes=self.engines)
    def envelope(self,agent,client="hetero"):
        module={"AG02":"intake_triage","AG08":"intake_triage","AG12":"case_processing",
                "AG17":"intake_triage","AG20":"case_processing","AG26":"intake_triage"}[agent]
        return issue_context(verified_principal="synthetic-runner",
            authorized_tenant="orcimed",authorized_client=client,
            module_id=module,document_id="SYN-DOC-2",workflow_id="synthetic",
            job_id="job-"+agent,agent_id=agent,task_type="synthetic",
            signing_secret=KEY)
    def evidence(self,agent):
        route=RUNTIME_ROUTES[agent]
        evidence={"document_id":"SYN-DOC-2","text":"Synthetic medical case only"}
        if route["input"]!="text":
            evidence[route["input"]]={"document_id":"SYN-DOC-2","synthetic":True,
                "source":{"text":"synthetic source"},
                "case":{"case_id":"SYN-DOC-2","documents":[{"id":"SYN-SOURCE-1"}]}}
        return evidence
    def test_six_real_invocations_and_27_slots(self):
        self.assertEqual(len(self.dispatcher.registry),27)
        self.assertEqual(set(self.dispatcher.registry),{f"AG{i:02d}" for i in range(1,28)})
        for agent in IDS:
            with self.subTest(agent=agent):
                out=self.dispatcher.execute(agent,envelope=self.envelope(agent),
                    evidence=self.evidence(agent),expected_tenant="orcimed",expected_client="hetero")
                self.assertEqual(out["result"]["status"],"review_required")
                assessment=out["result"]["assessment"]
                self.assertTrue(assessment["requires_human_review"])
                self.assertEqual(assessment["client_id"],"hetero")
                self.assertEqual(len(self.engines[agent].calls),1)
        self.assertEqual(len(self.router.calls),6)
    def test_cross_tenant_client_denied_before_engine(self):
        with self.assertRaises(ContextError):
            self.dispatcher.execute("AG02",envelope=self.envelope("AG02",client="cipla"),
                evidence=self.evidence("AG02"),expected_tenant="orcimed",expected_client="hetero")
        self.assertFalse(self.engines["AG02"].calls)
        self.assertFalse(self.router.calls)
    def test_wrong_doc_and_missing_input_denied(self):
        binding=make_native_runtime_bindings({"AG12":self.engines["AG12"]})["AG12"]
        pack=SimpleNamespace(tenant_id="orcimed",client_id="hetero",citations=[])
        with self.assertRaises(ValueError):
            binding({"document_id":"SYN-DOC-2","labeling_request":{"document_id":"WRONG"}},pack)
        with self.assertRaises(ValueError):
            binding({"document_id":"SYN-DOC-2"},pack)
    def test_unauthorized_response_scope_fails_closed(self):
        engine=self.engines["AG02"]
        def poisoned(request):
            return {**engine.execute(request),"client_id":"cipla"}
        class Bad:
            execute=staticmethod(poisoned)
        adapter=make_native_runtime_bindings({"AG02":Bad()})["AG02"]
        pack=SimpleNamespace(tenant_id="orcimed",client_id="hetero",citations=[])
        with self.assertRaises(PermissionError):
            adapter(self.evidence("AG02"),pack)
    def test_autonomy_denied(self):
        class Bad:
            @staticmethod
            def execute(request):
                return dict(agent_id="AG02",document_id=request["document_id"],
                            tenant_id=request["tenant_id"],client_id=request["client_id"],
                            status="completed",requires_human_review=False,assessment={})
        adapter=make_native_runtime_bindings({"AG02":Bad()})["AG02"]
        with self.assertRaises(ValueError):
            adapter(self.evidence("AG02"),SimpleNamespace(tenant_id="orcimed",client_id="hetero",citations=[]))
    def test_missing_runtime_remains_unbound(self):
        dispatcher=build_dispatcher(signing_secret=KEY,router=self.router)
        self.assertEqual(len(dispatcher.registry),27)
        for agent in IDS:self.assertEqual(dispatcher.readiness()[agent],"not_bound")
    def test_rejects_duplicate_injection(self):
        with self.assertRaises(ValueError):
            build_dispatcher(signing_secret=KEY,router=self.router,
                native_runtimes={"AG02":self.engines["AG02"]},
                specialist_services={"AG02":lambda **kw:{}})

if __name__=="__main__":unittest.main()
