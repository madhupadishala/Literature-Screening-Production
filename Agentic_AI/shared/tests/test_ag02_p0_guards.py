"""Offline P0 regression: scoped execution and review-only AG02 contracts."""
import importlib
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from Agentic_AI.shared.workflow_context import issue_context
from Agentic_AI.shared.execution.dispatcher import AgentDispatcher

NS = ("Agentic_AI.AG02_Adverse_Event_MedDRA.src.branches."
      "feat__event-extraction-agent.backend.agents.event_runtime")

class Router:
    def build_context_pack(self, *, tenant_id, client_id, **kwargs):
        return SimpleNamespace(tenant_id=tenant_id, client_id=client_id, citations=[])

class P0Guards(unittest.TestCase):
    secret = b"s" * 32

    def context(self, tenant="orcimed", client="hetero"):
        return issue_context(
            verified_principal="pv-reviewer", authorized_tenant=tenant,
            authorized_client=client, module_id="case_processing",
            document_id="SYN-CASE-1", workflow_id="SYN-WF-1",
            job_id="SYN-JOB-1", agent_id="AG02",
            task_type="medical_coding", signing_secret=self.secret)

    def dispatcher(self):
        return AgentDispatcher(
            router=Router(), secret=self.secret,
            specialists={"AG02": lambda evidence, pack:
                {"events": [], "qualified_for_autonomous_use": False}})

    def test_cross_tenant_blocked(self):
        with self.assertRaises(Exception):
            self.dispatcher().execute("AG02", envelope=self.context(),
                evidence={"document_id": "SYN-CASE-1", "text": "synthetic"},
                expected_tenant="different", expected_client="hetero")

    def test_cross_client_blocked(self):
        with self.assertRaises(Exception):
            self.dispatcher().execute("AG02", envelope=self.context(),
                evidence={"document_id": "SYN-CASE-1", "text": "synthetic"},
                expected_tenant="orcimed", expected_client="cipla")

    def test_dispatcher_forces_review(self):
        output = self.dispatcher().execute("AG02", envelope=self.context(),
            evidence={"document_id": "SYN-CASE-1", "text": "synthetic"},
            expected_tenant="orcimed", expected_client="hetero")
        self.assertEqual(output["result"]["status"], "review_required")
        self.assertEqual(output["routing"]["client_id"], "hetero")

    def test_dictionary_conflicting_code_mapping(self):
        coding = importlib.import_module(NS + ".coding")
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "dictionary.json"
            import json
            row = dict(llt_code="10000001", llt_name="synthetic", pt_code="10000002",
                       pt_name="synthetic PT", language="en", current=True)
            other = dict(row, pt_code="10000003", pt_name="different synthetic PT")
            path.write_text(json.dumps({"version": "SYNTHETIC-1",
                    "license_confirmed": True, "terms": [row, other]}))
            with self.assertRaises(ValueError):
                coding.MedDRADictionary(str(path))

    def test_coding_concept_omissions(self):
        benchmark = importlib.import_module(NS + ".benchmark")
        result = benchmark.evaluate_coding(
            [{"case_id":"SYN-1","concept_id":"A","llt_code":"10000001","pt_code":"10000002"},
             {"case_id":"SYN-1","concept_id":"B","llt_code":"10000003","pt_code":"10000004"}],
            [{"case_id":"SYN-1","concept_id":"A","llt_code":"10000001","pt_code":"10000002"}])
        self.assertEqual(result["missing_concepts"], 1)
        self.assertEqual(result["pt_recall"], .5)
        self.assertFalse(result["clinical_qualification"])

    def test_audit_client_scope_and_no_raw_text(self):
        audit = importlib.import_module(NS + ".audit")
        with tempfile.TemporaryDirectory() as folder:
            store = audit.AuditStore(str(Path(folder) / "audit.sqlite"))
            args = dict(tenant="orcimed", case_digest="a"*64, run_id="SYN-RUN",
                        event_type="coding_review_pending", decision_digest="b"*64)
            store.record_coding_validation(client="hetero", **args)
            store.record_coding_validation(client="cipla", **args)
            with store.connect() as db:
                rows = db.execute("SELECT client FROM coding_validation_audit ORDER BY client").fetchall()
            self.assertEqual(rows, [("cipla",), ("hetero",)])
            with self.assertRaises(ValueError):
                store.record_coding_validation(client="raw patient narrative", **args)

if __name__ == "__main__":
    unittest.main()
