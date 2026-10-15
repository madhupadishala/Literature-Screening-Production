import hashlib
import json
import unittest
from types import SimpleNamespace
from Agentic_AI.shared.execution.grounded_specialists import GROUNDED_BINDINGS

class GroundedSpecialistTests(unittest.TestCase):
    def setUp(self):
        self.pack = SimpleNamespace(
            tenant_id="orcimed", client_id="hetero",
            product_master_matches=[{"trade_name":"Metformin"}],
            approved_documents=[])
    def test_all_four_native_engines_registered(self):
        self.assertEqual(set(GROUNDED_BINDINGS), {"AG05", "AG07", "AG16", "AG27"})
    def test_explicit_indication_requires_product_master(self):
        doc = {"document_id":"SYN","text":"Metformin prescribed for diabetes."}
        result = GROUNDED_BINDINGS["AG05"](doc, self.pack)
        self.assertEqual(result["observations"][0]["product"], "Metformin")
        self.assertTrue(result["requires_human_review"])
        other = SimpleNamespace(product_master_matches=[], approved_documents=[])
        self.assertEqual(GROUNDED_BINDINGS["AG05"](doc, other)["observations"], [])
    def test_lab_value_is_source_spanned(self):
        source = "ALT 120 U/L was reported, without further history."
        result = GROUNDED_BINDINGS["AG07"]({"document_id":"SYN","text":source}, self.pack)
        self.assertEqual(result["observations"][0]["quote"], "ALT 120 U/L")
        self.assertEqual(result["observations"][0]["value"], "120")
    def test_aesi_requires_approved_list(self):
        doc = {"document_id":"SYN","text":"Anaphylaxis was reported."}
        self.assertEqual(GROUNDED_BINDINGS["AG16"](doc, self.pack)["observations"], [])
        content = json.dumps({"aesi_terms":["anaphylaxis"]})
        self.pack.approved_documents = [{
            "knowledge_type": "aesi_list", "content": content,
            "rule_id": "SIGNED-LIST", "content_sha256": hashlib.sha256(content.encode()).hexdigest()}]
        result = GROUNDED_BINDINGS["AG16"](doc, self.pack)
        self.assertEqual(result["observations"][0]["knowledge_document_id"], "SIGNED-LIST")
    def test_aesi_negation_not_reported_positive(self):
        content = json.dumps({"aesi_terms":["anaphylaxis"]})
        self.pack.approved_documents = [{"knowledge_type":"aesi_list","content":content,
                                         "rule_id":"SIGNED-LIST","content_sha256":"test"}]
        result = GROUNDED_BINDINGS["AG16"](
            {"document_id":"SYN","text":"Patient denies anaphylaxis."}, self.pack)
        self.assertEqual(result["observations"], [])
    def test_patient_aggregate_is_review_only(self):
        result = GROUNDED_BINDINGS["AG27"](
            {"document_id":"SYN","text":"Case series involving a 42-year-old woman."}, self.pack)
        self.assertEqual(result["classification"], "mixed_review")
        self.assertTrue(result["requires_human_review"])
    def test_empty_source_fails_closed(self):
        for name, fn in GROUNDED_BINDINGS.items():
            with self.subTest(name=name), self.assertRaises(ValueError):
                fn({"document_id":"SYN","text":""}, self.pack)

if __name__=="__main__":
    unittest.main()
