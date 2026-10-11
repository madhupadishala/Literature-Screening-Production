import unittest
from backend.agents.event_runtime.outcome_policy import outcome_from_quote
class OutcomeTests(unittest.TestCase):
    def test_improvement_is_recovering(self):
        self.assertEqual(outcome_from_quote("The rash improved"),"recovering_resolving")
    def test_resolution_is_recovered(self):
        self.assertEqual(outcome_from_quote("The rash resolved"),"recovered_resolved")
    def test_no_change_not_recovered(self):
        self.assertEqual(outcome_from_quote("The rash did not improve and persisted"),"not_recovered_not_resolved")
    def test_unspecified_is_unknown(self):
        self.assertEqual(outcome_from_quote(None),"unknown")
if __name__=="__main__":unittest.main()
