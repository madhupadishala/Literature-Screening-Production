"""CI gate: fail if the expected imported specialist agent source is absent.

Run: python -m unittest tests.test_agent_source_gate
This intentionally blocks claiming package integration from inventory-only commits.
"""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

REQUIRED = (
    "integrations/pv_agents/kimi/nexus_agents/agents/action_taken.py",
    "integrations/pv_agents/kimi/nexus_agents/agents/dechallenge.py",
    "integrations/pv_agents/kimi/nexus_agents/agents/rechallenge.py",
    "integrations/pv_agents/kimi/nexus_agents/agents/followup.py",
    "integrations/pv_agents/kimi/nexus_agents/agents/icsr_duplicate.py",
    "integrations/pv_agents/kimi/nexus_agents/agents/inclusion_exclusion.py",
    "integrations/pv_agents/kimi/nexus_agents/agents/lit_duplicate.py",
    "integrations/pv_agents/kimi/nexus_agents/agents/med_history.py",
    "integrations/pv_agents/v2/nexus_agents/day_zero/agent.py",
    "integrations/pv_agents/v2/nexus_agents/history/agent.py",
    "integrations/pv_agents/v2/nexus_agents/current/agent.py",
    "integrations/pv_agents/v2/nexus_agents/patient/agent.py",
    "integrations/pv_agents/v2/nexus_agents/reporter/agent.py",
)


class AgentSourceGate(unittest.TestCase):
    def test_uploaded_agent_sources_actually_committed(self):
        missing = [p for p in REQUIRED if not (ROOT / p).is_file()]
        self.assertFalse(
            missing,
            "Source packages not consolidated into Git. Missing: " + ", ".join(missing),
        )


if __name__ == "__main__":
    unittest.main()
