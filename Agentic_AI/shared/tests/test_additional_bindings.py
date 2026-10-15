import unittest
from types import SimpleNamespace
from Agentic_AI.shared.execution.additional_bindings import translation, validity

class AddedBindingsTest(unittest.TestCase):
    def setUp(self):
        self.pack = SimpleNamespace(tenant_id="orcimed", client_id="hetero")

    def test_translation_same_language_no_external_provider(self):
        result = translation({"document_id": "DOC1", "text": "Patient experienced nausea.",
                              "source_language": "English", "target_language": "English"}, self.pack)
        self.assertEqual(result["status"], "no_translation_needed")
        self.assertEqual(result["segments"][0]["translated"], "Patient experienced nausea.")

    def test_translation_requires_explicit_language(self):
        with self.assertRaises(ValueError):
            translation({"document_id": "DOC1", "text": "nausea"}, self.pack)

    def test_validity_empty_icsr_fails_closed(self):
        result = validity({"document_id": "CASE1", "case": {"case_id": "CASE1"}}, self.pack)
        self.assertFalse(result["minimum_criteria_met"])
        self.assertTrue(result["requires_human_review"])
        self.assertTrue(result["missing_criteria"])

    def test_validity_rejects_wrong_case(self):
        with self.assertRaises(ValueError):
            validity({"document_id": "CASE1", "case": {"case_id": "CASE2"}}, self.pack)

if __name__ == "__main__":
    unittest.main()
