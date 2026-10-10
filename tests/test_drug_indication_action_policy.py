import unittest
from backend.agents.drug_role.indication_action_policy import normalize_indications_actions


class IndicationActionPolicyTests(unittest.TestCase):
    def test_drug_specific_actions_and_indications(self):
        data = [
            {"product_id":"drug-1", "indication":"hypertension",
             "indication_evidence":"Drug A was prescribed for hypertension",
             "action_taken":"drug withdrawn",
             "action_evidence":"Drug A was withdrawn", "event_id":"rash"},
            {"product_id":"drug-2", "indication":"diabetes",
             "indication_evidence":"Drug B for diabetes",
             "action_taken":"dose not changed",
             "action_evidence":"Drug B was continued unchanged"},
        ]
        result = normalize_indications_actions(data)
        self.assertEqual([x["action_taken"] for x in result],
                         ["DRUG_WITHDRAWN","DOSE_NOT_CHANGED"])
        self.assertEqual(result[0]["event_id"], "rash")
        self.assertEqual(result[1]["indication"], "diabetes")

    def test_missing_action_remains_unknown(self):
        value = normalize_indications_actions([{"product_id":"drug-1"}])[0]
        self.assertEqual(value["action_taken"], "UNKNOWN")
        self.assertTrue(value["review_required"])

    def test_missing_action_evidence_rejected(self):
        with self.assertRaises(ValueError):
            normalize_indications_actions([{
                "product_id":"drug-1", "action_taken":"dose reduced"}])

    def test_missing_indication_evidence_rejected(self):
        with self.assertRaises(ValueError):
            normalize_indications_actions([{
                "product_id":"drug-1", "indication":"arthritis"}])

    def test_episodes_remain_separate(self):
        rows = normalize_indications_actions([
            {"product_id":"drug-1","episode_id":"first",
             "action_taken":"dose reduced","action_evidence":"reduced first"},
            {"product_id":"drug-1","episode_id":"second",
             "action_taken":"dose interrupted","action_evidence":"interrupted later"},
        ])
        self.assertEqual(len(rows),2)
        self.assertEqual([r["episode_id"] for r in rows],["first","second"])


if __name__ == "__main__":
    unittest.main()
