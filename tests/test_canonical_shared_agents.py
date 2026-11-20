"""Offline canonical-agent source integrity and compile checks.

Execute from repository root: python -m unittest tests.test_canonical_shared_agents
Does not invoke LLMs or represent clinical qualification.
"""
import ast
import unittest
from pathlib import Path

from backend.shared_agents.registry import AGENT_SOURCES, OVERLAP_REVIEW, ROOT, source_inventory


class CanonicalSharedAgentsTest(unittest.TestCase):
    def test_all_13_source_files_exist_and_parse(self):
        self.assertEqual(len(AGENT_SOURCES), 13)
        self.assertEqual(len(set(AGENT_SOURCES.values())), 13)
        for name, relative in AGENT_SOURCES.items():
            with self.subTest(agent=name):
                path = ROOT / relative
                self.assertTrue(path.is_file(), str(path))
                ast.parse(path.read_text(encoding="utf-8"), filename=str(path))

    def test_registry_does_not_claim_unverified_activation(self):
        inventory = source_inventory()
        self.assertEqual(set(inventory), set(AGENT_SOURCES))
        for record in inventory.values():
            self.assertTrue(record["source_present"])
            self.assertFalse(record["runtime_registered"])
            self.assertFalse(record["clinically_qualified"])

    def test_overlaps_are_explicit(self):
        for agents in OVERLAP_REVIEW.values():
            for name in agents:
                self.assertIn(name, AGENT_SOURCES)


if __name__ == "__main__":
    unittest.main()
