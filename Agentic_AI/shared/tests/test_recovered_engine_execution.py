"""Synthetic execution verification for recovered deterministic engines."""
import unittest
from types import SimpleNamespace
from Agentic_AI.shared.execution.specialists import VERIFIED_BINDINGS

class EngineContracts(unittest.TestCase):
    def setUp(self):
        self.knowledge=SimpleNamespace(tenant_id="synthetic_tenant",
            product_master_matches=[],citations=[])
        self.case={"case_id":"DOC-TEST-01",
                   "narrative":"Patient was treated with TestDrug. TestDrug was discontinued. The rash resolved.",
                   "drugs":[{"name":"TestDrug", "role":"suspect"}],
                   "events":[{"verbatim":"rash"}]}
        self.evidence={"document_id":"DOC-TEST-01","case":self.case}
    def test_recovered_icsr_engines(self):
        for agent in ("AG06","AG14","AG15","AG21","AG23"):
            with self.subTest(agent=agent):
                result=VERIFIED_BINDINGS[agent](self.evidence,self.knowledge)
                self.assertIsInstance(result,dict)
                self.assertEqual(result["contract_version"],"1.0.0")
                self.assertIn("status",result)
    def test_recovered_literature_engine(self):
        record={"record_id":"PMID-TEST-01","title":"Synthetic case report",
                "abstract":"Patient treated with an example drug."}
        result=VERIFIED_BINDINGS["AG22"](
            {"document_id":"PMID-TEST-01","article":record},self.knowledge)
        self.assertIn("status",result)
    def test_denies_foreign_case_identifier(self):
        with self.assertRaises(ValueError):
            VERIFIED_BINDINGS["AG23"](
                {"document_id":"DOC-TEST-02","case":self.case},self.knowledge)

if __name__=="__main__": unittest.main()
