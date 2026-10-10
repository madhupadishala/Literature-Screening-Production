"""Verify imported agent source files are present at their actual GitHub paths.

Run: python -m unittest discover -s tests -p test_uploaded_agent_sources.py
This checks source presence, NOT integrated runtime or clinical qualification.
"""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
KIMI = "nexus_actual_agent_source_consolidation/packages/pv_specialist_core/nexus_pv_agents/nexus_agents/agents"
V2 = "nexus_actual_agent_source_consolidation/packages/v2_5/nexus_agents_v2/nexus_agents"

AGENT_FILES = [
    f"{KIMI}/{name}.py" for name in (
        "action_taken", "dechallenge", "rechallenge", "followup",
        "icsr_duplicate", "inclusion_exclusion", "lit_duplicate", "med_history"
    )
] + [f"{V2}/{name}/agent.py" for name in (
    "day_zero", "history", "current", "patient", "reporter"
)]

class UploadedAgentSourceTest(unittest.TestCase):
    def test_all_thirteen_agent_source_files_exist(self):
        missing = [p for p in AGENT_FILES if not (ROOT / p).is_file()]
        self.assertEqual(missing, [], f"Missing source modules: {missing}")

if __name__ == "__main__":
    unittest.main()
