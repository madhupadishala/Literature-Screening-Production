"""Clinical decision regression tests for specialist agents.

Designed to prevent false causal inferences from outcome-only E2B fields.
"""
import sys
import unittest
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
        self.assertEqual(self._assess("Drug A was stopped. Headache reported resolved."), "unresolved")

    def test_temporal_link_with_resolution(self):
        self.assertEqual(self._assess("Following discontinuation, the headache resolved."), "positive")

    def test_no_withdrawal_is_not_assessable(self):
        self.assertEqual(self._assess("Headache resolved.", action="4"), "not_assessable")


if __name__ == "__main__":
    unittest.main()
