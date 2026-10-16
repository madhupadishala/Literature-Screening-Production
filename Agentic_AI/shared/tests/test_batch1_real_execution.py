"""Offline Batch-1 engine integration. Uses fixed synthetic source and JSON fixture provider.

No network, login, hosted secrets or real patient data.
"""
import unittest
from types import SimpleNamespace
from uuid import uuid4
from Agentic_AI.shared.workflow_context import issue_context, ContextError
from Agentic_AI.shared.execution.factory import build_dispatcher

KEY = b"offline-batch-one-signed-test-key-32-bytes-minimum"
SOURCE = ("Patient ID SYN-17, male, 45 years old. Dr Ada, physician, "
          "reported nausea associated with Metformin. Prior asthma resolved in 2020.")

class OfflineStructuredJSON:
    """Strict schema-aware fixture only, never a clinical provider."""
    def complete_json(self, *, system, user, schema):
        properties = set(schema.get("properties", {}))
        if "patient_id" in properties and "sex_as_stated" in properties:
            return {"patient_id": "SYN-17", "sex_as_stated": "male",
                    "sex_evidence": "male",
                    "age_at_onset": {"value": 45, "unit": "years", "evidence": "45 years"}}
        if "reporters" in properties:
            return {"reporters": [{"given_name": "Ada",
                    "occupation_as_stated": "physician",
                    "evidence": "Dr Ada, physician"}]}
        if "events" in properties:
            return {"events": [{"event_id": "receipt-1",
                     "reporter": {"present": True, "evidence": "Dr Ada, physician"},
                     "patient": {"present": True, "evidence": "Patient ID SYN-17"},
                     "product": {"present": True, "evidence": "Metformin"},
                     "reaction": {"present": True, "evidence": "nausea"}}]}
        if "conditions" in properties and "drugs" in properties:
            return {"conditions": [{"term_as_reported": "asthma",
                    "kind": "condition", "end_date": "2020",
                    "continuing_stated": "no", "temporal_phrase": "Prior asthma",
                    "evidence": "Prior asthma resolved in 2020"}], "drugs": []}
        raise AssertionError("Unsupported JSON schema (do not fabricate outputs)")

class ScopedRouter:
    def __init__(self): self.calls=[]
    def build_context_pack(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(tenant_id=kwargs["tenant_id"], client_id=kwargs["client_id"],
                               citations=[{"source":"synthetic_approved_knowledge","rule_id":"QA-ONLY"}],
                               approved_documents=[], product_master_matches=[])

class OfflineAudit:
    def __init__(self): self.rows=[]
    def append(self, result):
        entry={"audit_id":str(uuid4()),"routing":result["routing"],
               "status":result["result"]["status"]}
        self.rows.append(entry)
        return entry

class Batch1RealExecutionTest(unittest.TestCase):
    def setUp(self):
        self.router=ScopedRouter()
        self.dispatcher=build_dispatcher(signing_secret=KEY,router=self.router,
                                         approved_llm=OfflineStructuredJSON())
        self.audit=OfflineAudit()
    def envelope(self, agent, client="hetero"):
        return issue_context(verified_principal="synthetic-runner",
            authorized_tenant="orcimed",authorized_client=client,
            module_id="case_processing" if agent=="AG24" else "intake_triage",
            document_id="SYN-DOC-1", workflow_id="synthetic-workflow",
            job_id="job-"+agent, agent_id=agent, task_type="synthetic_extract",
            signing_secret=KEY)
    def evidence(self):
        return {"document_id":"SYN-DOC-1","text":SOURCE,
                "day_zero_input":{"case_id":"SYN-DOC-1","source_type":"spontaneous",
                    "receipts":[{"event_id":"receipt-1","date":"2026-10-01",
                                 "received_by":"mah","text":SOURCE}],
                    "seriousness":None}}
    def test_all_registry_slots_and_batch1_executable(self):
        self.assertEqual(len(self.dispatcher.registry),27)
        self.assertEqual(set(self.dispatcher.registry),
                         {f"AG{i:02d}" for i in range(1,28)})
        ids=("AG03","AG04","AG09","AG24")
        for agent in ids:
            with self.subTest(agent=agent):
                result=self.dispatcher.execute(agent,envelope=self.envelope(agent),
                    evidence=self.evidence(),expected_tenant="orcimed",expected_client="hetero")
                self.assertEqual(result["routing"]["agent_id"],agent)
                self.assertEqual(result["result"]["status"],"review_required")
                clinical=result["result"]["assessment"]
                self.assertEqual(clinical["agent_id"],agent)
                self.assertTrue(clinical["requires_human_review"])
                self.assertFalse(clinical["qualified_for_autonomous_use"])
                self.assertEqual(clinical["scope"]["client_id"],"hetero")
                self.assertTrue(clinical["engine_output"]["input_sha256"])
                self.assertEqual(result["result"]["knowledge_citations"][0]["rule_id"],"QA-ONLY")
                self.assertTrue(self.audit.append(result)["audit_id"])
        self.assertEqual(len({row["audit_id"] for row in self.audit.rows}),4)
        self.assertEqual(len(self.router.calls),4)
        self.assertEqual({c["client_id"] for c in self.router.calls},{"hetero"})
    def test_wrong_client_denied_before_kb_or_llm(self):
        with self.assertRaises(ContextError):
            self.dispatcher.execute("AG03",envelope=self.envelope("AG03",client="cipla"),
                evidence=self.evidence(),expected_tenant="orcimed",expected_client="hetero")
        self.assertEqual(self.router.calls,[])
    def test_missing_llm_rejected_and_batch1_unbound(self):
        bare=build_dispatcher(signing_secret=KEY,router=self.router)
        self.assertEqual(len(bare.registry),27)
        for agent in ("AG03","AG04","AG09","AG24"):
            self.assertEqual(bare.readiness()[agent],"not_bound")
    def test_day_zero_case_identity_mismatch_fails_closed(self):
        evidence=self.evidence()
        evidence["day_zero_input"]["case_id"]="DIFFERENT"
        with self.assertRaises(ValueError):
            self.dispatcher.execute("AG09",envelope=self.envelope("AG09"),
                evidence=evidence,expected_tenant="orcimed",expected_client="hetero")

if __name__=="__main__": unittest.main()
