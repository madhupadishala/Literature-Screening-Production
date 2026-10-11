import unittest
from backend.knowledge.executable_clinical_gates import evaluate_approved_gate as gate
from backend.knowledge.clinical_rule_store import ClinicalRuleError

class ClinicalGateTests(unittest.TestCase):
    def test_measurements_do_not_generate_ae(self):
        self.assertEqual(gate("AE-002", {"measurement_only":True,"explicit_ae_reported":False})["decision"], "DO_NOT_CREATE_INFERRED_EVENT")
    def test_commercial_complaint_is_not_ae(self):
        self.assertEqual(gate("AE-003", {"nonclinical_complaint_only":True,"explicit_clinical_event":False})["decision"], "NO_ADVERSE_EVENT")
    def test_idiom_does_not_create_fatality(self):
        self.assertEqual(gate("AE-004", {"figurative_death_statement":True})["decision"], "DO_NOT_INFER_DEATH")
    def test_severe_is_not_necessarily_serious(self):
        self.assertEqual(gate("AE-009", {"severity":"severe"})["decision"], "SERIOUSNESS_UNKNOWN")
    def test_missing_evidence_requires_review(self):
        self.assertEqual(gate("AE-002", {})["decision"], "HUMAN_REVIEW")
    def test_unimplemented_rule_fails_closed(self):
        with self.assertRaises(ClinicalRuleError):
            gate("DR-001", {})
if __name__=="__main__": unittest.main()
