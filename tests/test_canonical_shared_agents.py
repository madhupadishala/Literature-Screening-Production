"""Offline canonical-agent source integrity and compile checks.

Execute from repository root: python -m unittest tests.test_canonical_shared_agents
Does not invoke LLMs or represent clinical qualification.
"""
import ast
import unittest
from pathlib import Path

from backend.shared_agents.registry import (AGENT_SOURCES, OVERLAP_REVIEW, ROOT,
    LEGACY_COMPONENTS, legacy_source_inventory, source_inventory)


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

    def test_legacy_mirrors_are_byte_identical_to_runtime(self):
        project_root = ROOT.parent.parent
        for name, path in LEGACY_COMPONENTS.items():
            with self.subTest(agent=name):
                original = project_root / "backend" / "agents" / path
                mirrored = ROOT / "legacy" / path
                self.assertTrue(original.is_file())
                self.assertEqual(original.read_bytes(), mirrored.read_bytes())
                self.assertFalse(legacy_source_inventory()[name]["runtime_migrated"])

    def test_possible_clinical_finding_requires_review_in_both_contracts(self):
        """Enforce the review gate in both the runtime and mirrored contracts."""
        project_root = ROOT.parent.parent
        for relative in ("backend/agents/clinical_contracts.py",
                         "backend/shared_agents/legacy/clinical_contracts.py"):
            with self.subTest(path=relative):
                source = (project_root / relative).read_text(encoding="utf-8")
                tree = ast.parse(source)
                finding = next(node for node in tree.body
                               if isinstance(node, ast.ClassDef) and node.name == "ClinicalFinding")
                gate = next(node for node in finding.body
                            if isinstance(node, ast.FunctionDef) and node.name == "clinical_evidence_gate")
                uncertain_review_guards = [
                    node for node in ast.walk(gate)
                    if isinstance(node, ast.If)
                    and any(isinstance(item, ast.Attribute)
                            and item.attr == "POSSIBLE"
                            and isinstance(item.value, ast.Name)
                            and item.value.id == "ClinicalStatus"
                            for item in ast.walk(node.test))
                    and any(isinstance(item, ast.Attribute)
                            and item.attr == "reviewer_required"
                            for item in ast.walk(node.test))
                    and any(isinstance(item, ast.Raise) for body in node.body
                            for item in ast.walk(body))
                ]
                self.assertTrue(uncertain_review_guards,
                                "POSSIBLE must be rejected without reviewer_required")

    def test_overlaps_are_explicit(self):
        for agents in OVERLAP_REVIEW.values():
            for name in agents:
                self.assertIn(name, AGENT_SOURCES)


if __name__ == "__main__":
    unittest.main()
