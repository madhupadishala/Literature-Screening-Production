"""Clinical attribution regression tests for rechallenge."""
import sys
import unittest
from pathlib import Path
P = Path(__file__).resolve().parents[1] / "nexus_actual_agent_source_consolidation" / "packages" / "pv_specialist_core" / "nexus_pv_agents"
sys.path.insert(0, str(P))
from nexus_agents.schemas import ICSR, DrugExposure, AdverseEvent
from nexus_agents.orchestration import AgentSuite

class RechallengeAttributionTests(unittest.TestCase):
    def test_other_drugs_rechallenge_not_assigned_to_unrelated_pair(self):
        case = ICSR(case_id="MULTI", narrative=(
            "Drug A was restarted and rash recurred. "
            "Drug B was taken for diabetes; dizziness also occurred."
        ), drugs=[
            DrugExposure(name="Drug A", role="suspect"),
            DrugExposure(name="Drug B", role="suspect")
        ], events=[
            AdverseEvent(verbatim="rash"),
            AdverseEvent(verbatim="dizziness")
        ])
        result = AgentSuite().rechallenge.assess(case)
        pairs = result.payload["drug_event_pairs"]
        unrelated = next(p for p in pairs if p["drug"] == "Drug B" and p["event"] == "rash")
        self.assertEqual(unrelated["rechallenge"], "unresolved")
        self.assertEqual(unrelated["e2b_gk9i4"], "3")

if __name__ == "__main__":
    unittest.main()
