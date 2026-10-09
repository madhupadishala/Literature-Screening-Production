import unittest
from backend.knowledge.clinical_decision_adapters import (
    NexusClinicalDecisionAdapter, assess_drug_event_pair, resolve_day_zero,
)
class NexusSharedAgentDecisionTests(unittest.TestCase):
    def test_positive_dechallenge_pair(self):
        row=dict(product_id="A",event_id="rash",source_evidence="withdrawal report",
                 withdrawal_or_reduction_confirmed=True,action_date="2026-09-16",
                 event_course_date="2026-09-18",event_improved_after_withdrawal=True,
                 improvement_source_evidence="rash subsided")
        self.assertEqual(assess_drug_event_pair(row)["dechallenge"],"positive")
    def test_treated_improvement_not_applicable(self):
        row=dict(product_id="A",event_id="rash",source_evidence="report",
                 withdrawal_or_reduction_confirmed=True,action_date="2026-09-16",
                 event_course_date="2026-09-18",event_improved_after_withdrawal=True,
                 improvement_source_evidence="rash improved",ae_specific_treatment_confirmed=True)
        result=assess_drug_event_pair(row)
        self.assertEqual(result["dechallenge"],"not_applicable")
        self.assertEqual(result["rechallenge"],"not_applicable")
    def test_no_event_course_cannot_be_positive(self):
        self.assertEqual(assess_drug_event_pair(dict(product_id="A",event_id="rash",
            source_evidence="withdrawn",withdrawal_or_reduction_confirmed=True))["dechallenge"],"unknown")
    def test_receipt_must_be_qualified_and_valid(self):
        rows=[
          dict(receipt_date="2026-09-18",recipient_type="MAH sales",
               source_evidence="first report",qualifying_mah_receipt=True,icsr_valid_at_receipt=False),
          dict(receipt_date="2026-09-20",recipient_type="MAH PV",
               source_evidence="fourth criterion",qualifying_mah_receipt=True,icsr_valid_at_receipt=True)]
        self.assertEqual(resolve_day_zero(rows)["day_zero"],"2026-09-20")
    def test_partner_date_without_authorized_policy_not_selected(self):
        rows=[dict(receipt_date="2026-09-17",recipient_type="partner",source_type="partner",
                   source_evidence="partner report",qualifying_mah_receipt=True,icsr_valid_at_receipt=True)]
        self.assertIsNone(resolve_day_zero(rows)["day_zero"])
    def test_shared_schema_and_history(self):
        packet=dict(case_id="C1",medical_history=[
            dict(patient_id="P1",reported_condition="smoking",history_type="tobacco",
                 source_evidence="patient interview")])
        output=NexusClinicalDecisionAdapter("med_history").run(
            tenant_id="T1",client_id="CL1",packet=packet)
        self.assertEqual(output["medical_history"][0]["category"],"social_history")
        self.assertEqual(output["client_id"],"CL1")
        self.assertFalse(output["clinical_release_authorized"])
if __name__=="__main__": unittest.main()
