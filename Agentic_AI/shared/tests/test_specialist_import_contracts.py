"""Static import and contract smoke tests; do not equate source files with qualified engines."""
import importlib
import inspect
import unittest
from Agentic_AI.shared.execution.specialists import VERIFIED_BINDINGS

class SpecialistImportContracts(unittest.TestCase):
    def test_bound_specialists_are_explicit(self):
        self.assertEqual(set(VERIFIED_BINDINGS), {"AG01"})
    def test_specialists_have_two_arguments(self):
        for name, fn in VERIFIED_BINDINGS.items():
            with self.subTest(name=name):
                self.assertEqual(len(inspect.signature(fn).parameters), 2)
    def test_recovered_modules_import(self):
        modules = [
            "Agentic_AI.AG01_Drug_Extraction_Classification.src.backend.orchestrator",
            "Agentic_AI.AG10_Translation.translation_agent",
            "Agentic_AI.shared.workflow_context",
            "backend.knowledge.knowledge_router",
        ]
        for module in modules:
            with self.subTest(module=module):
                self.assertIsNotNone(importlib.import_module(module))

if __name__=="__main__": unittest.main()
