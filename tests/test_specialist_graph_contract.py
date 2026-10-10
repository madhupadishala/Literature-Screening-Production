"""Safety contract tests for the shared specialist bridge.

The live LangGraph and hosted Knowledge Base integration require deployment tests.
"""
import unittest
from unittest.mock import Mock

from backend.services.pv_agents.specialist_graph import (
    NexusSpecialistBridge, IntegrationUnavailable, SPECIALIST_PACKAGE
)


class SpecialistBridgeContractTests(unittest.TestCase):
    def setUp(self):
        self.pack = Mock()
        self.pack.to_dict.return_value = {"tenant_id": "t1", "citations": []}
        self.router = Mock()
        self.router.build_context_pack.return_value = self.pack
        self.bridge = NexusSpecialistBridge(knowledge_router=self.router)
        self.request = {
            "tenant_id": "t1", "client_id": "c1", "case_id": "case1",
            "narrative": "Patient experienced a headache.",
        }

    def test_source_package_present(self):
        self.assertTrue((SPECIALIST_PACKAGE / "schemas.py").is_file())

    def test_explicit_client_scope_required(self):
        bad = dict(self.request)
        bad.pop("client_id")
        with self.assertRaises(ValueError):
            self.bridge._knowledge(bad)
        self.router.build_context_pack.assert_not_called()

    def test_fail_closed_if_knowledge_tenant_mismatch(self):
        self.pack.to_dict.return_value = {"tenant_id": "someone_else"}
        with self.assertRaises(IntegrationUnavailable):
            self.bridge._knowledge(self.request)

    def test_fails_closed_when_retrieval_unavailable(self):
        self.router.build_context_pack.side_effect = RuntimeError("Knowledge index unavailable")
        with self.assertRaises(RuntimeError):
            self.bridge._knowledge(self.request)

    def test_knowledge_request_includes_client_scope(self):
        self.bridge._knowledge(self.request)
        params = self.router.build_context_pack.call_args.kwargs
        self.assertEqual(params["tenant_id"], "t1")
        self.assertEqual(params["client_id"], "c1")

    def test_real_langgraph_executes_specialist_nodes(self):
        suite = Mock()
        suite.action_taken.extract.return_value = {"action": "unknown"}
        suite.dechallenge.assess.return_value = {"dechallenge": "unknown"}
        suite.rechallenge.assess.return_value = {"rechallenge": "unknown"}
        suite.med_history.extract.return_value = {"history": []}
        suite.followup.generate.return_value = {"questions": []}
        bridge = NexusSpecialistBridge(knowledge_router=self.router, suite=suite)
        report = bridge.assess(self.request)
        self.assertTrue(report["review_required"])
        self.assertFalse(report["clinical_release_authorized"])
        self.assertEqual(set(report["assessments"]), {
            "action_taken", "dechallenge", "rechallenge", "medical_history", "followup"
        })
        self.assertEqual(report["knowledge_context"]["tenant_id"], "t1")
        suite.dechallenge.assess.assert_called_once()

    def test_requires_document_ingestion_for_oversize_input(self):
        req = dict(self.request, narrative="X" * 100001)
        with self.assertRaises(ValueError):
            self.bridge._knowledge(req)
        self.router.build_context_pack.assert_not_called()


if __name__ == "__main__":
    unittest.main()
