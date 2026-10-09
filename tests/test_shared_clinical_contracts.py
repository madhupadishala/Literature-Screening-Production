import unittest
from backend.knowledge.shared_clinical_contracts import normalize_clinical_packet

class SharedClinicalContractsTests(unittest.TestCase):
    def test_all_domains_preserve_evidence(self):
        p = normalize_clinical_packet({
            "case_id": "SYN-001",
            "dechallenge_rechallenge": [{
                "product_id":"drug1","event_id":"rash","dechallenge":"positive",
                "event_improved_after_withdrawal":True,
                "improvement_source_evidence":"rash improved two days after stopping",
                "source_evidence":"drug withdrawn due to rash",
            }],
            "receipt_events":[{"receipt_date":"2026-10-01", "recipient_type":"MAH employee",
                "source_evidence":"dated company call log"}],
            "medical_history":[{"patient_id":"P1","reported_condition":"asthma",
                "source_evidence":"patient reported asthma history"}],
        })
        self.assertEqual(p["schema_version"],"nexus.clinical_shared/1")
        self.assertEqual(len(p["receipt_events"]),1)
        self.assertFalse(p["clinical_release_authorized"])

    def test_withdrawal_alone_cannot_be_positive_dechallenge(self):
        with self.assertRaises(ValueError):
            normalize_clinical_packet({"case_id":"SYN-002", "dechallenge_rechallenge":[{
                "product_id":"drug1","event_id":"rash","source_evidence":"drug was withdrawn",
                "dechallenge":"positive"}]})

    def test_rechallenge_requires_readministration_and_recurrence(self):
        with self.assertRaises(ValueError):
            normalize_clinical_packet({"case_id":"SYN-003","dechallenge_rechallenge":[{
                "product_id":"drug1","event_id":"rash","source_evidence":"rash returned",
                "rechallenge":"positive","readministration_confirmed":True}]})

    def test_every_fact_requires_evidence(self):
        with self.assertRaises(ValueError):
            normalize_clinical_packet({"case_id":"SYN-004",
                "medical_history":[{"patient_id":"P1","reported_condition":"asthma"}]})

    def test_missing_dates_not_inferred(self):
        p=normalize_clinical_packet({"case_id":"SYN-005"})
        self.assertEqual(p["receipt_events"],[])

if __name__=="__main__":
    unittest.main()
