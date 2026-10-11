"""Clinical decision regression tests for specialist agents.

Designed to prevent false causal inferences from outcome-only E2B fields.
"""
import sys
import unittest
from datetime import date
from pathlib import Path

P = Path(__file__).resolve().parents[1] / "nexus_actual_agent_source_consolidation" / "packages" / "pv_specialist_core" / "nexus_pv_agents"
sys.path.insert(0, str(P))
from nexus_agents.schemas import ICSR, DrugExposure, AdverseEvent
from nexus_agents.orchestration import AgentSuite


class ClinicalDechallengeTests(unittest.TestCase):
    def setUp(self):
        self.suite = AgentSuite()

    def _assess(self, narrative, outcome="1", action="1"):
        case = ICSR(case_id="DX-001", narrative=narrative, drugs=[
            DrugExposure(name="Drug A", role="suspect")
        ], events=[AdverseEvent(verbatim="Headache", outcome_e2b=outcome)])
        # Controlled upstream action avoids confusing action extraction with dechallenge.
        from nexus_agents.schemas import AgentResult
        action_result = AgentResult(agent="action_taken", agent_version="1", payload={
            "actions": [{"drug": "Drug A", "e2b_gk8": action, "evidence_quote": "Drug A stopped"}]
        })
        result = self.suite.dechallenge.assess(case, action_result)
        return result.payload["drug_event_pairs"][0]["dechallenge"]

    def test_resolved_outcome_alone_does_not_prove_dechallenge(self):
        self.assertEqual(self._assess("Drug A was stopped. Headache reported resolved."), "unknown")

    def test_temporal_link_with_resolution(self):
        self.assertEqual(self._assess("Following discontinuation, the headache resolved."), "positive")

    def test_dated_drug_stop_before_event_recovery_is_positive(self):
        case = ICSR(case_id="DATED", narrative="Drug A was discontinued; rash eventually recovered.",
            drugs=[DrugExposure(name="Drug A", role="suspect", end_date=date(2026, 1, 10))],
            events=[AdverseEvent(verbatim="rash", outcome_e2b="1", end_date=date(2026, 1, 13))])
        from nexus_agents.schemas import AgentResult
        action = AgentResult(agent="action_taken", agent_version="1",
            payload={"actions": [{"drug": "Drug A", "e2b_gk8": "1",
                                  "evidence_quote": "Drug A was discontinued"}]})
        result = self.suite.dechallenge.assess(case, action)
        self.assertEqual(result.payload["drug_event_pairs"][0]["dechallenge"], "positive")

    def test_recovery_before_drug_stop_is_not_positive(self):
        case = ICSR(case_id="ORDER", narrative="Rash recovered before Drug A was discontinued.",
            drugs=[DrugExposure(name="Drug A", role="suspect", end_date=date(2026, 1, 13))],
            events=[AdverseEvent(verbatim="rash", outcome_e2b="1", end_date=date(2026, 1, 10))])
        from nexus_agents.schemas import AgentResult
        action = AgentResult(agent="action_taken", agent_version="1",
            payload={"actions": [{"drug": "Drug A", "e2b_gk8": "1",
                                  "evidence_quote": "Drug A was discontinued"}]})
        result = self.suite.dechallenge.assess(case, action)
        self.assertNotEqual(result.payload["drug_event_pairs"][0]["dechallenge"], "positive")

    def test_no_withdrawal_is_not_assessable(self):
        self.assertEqual(self._assess("Headache resolved.", action="4"), "unknown")

    def test_ae_treated_and_recovered_is_not_applicable(self):
        narrative = "Drug A was stopped. Headache was treated with antihistamines and recovered."
        self.assertEqual(self._assess(narrative, outcome="1"), "not_applicable")

    def test_no_outcome_information_is_unknown(self):
        self.assertEqual(self._assess("Drug A was stopped.", outcome=None), "unknown")


if __name__ == "__main__":
    unittest.main()
