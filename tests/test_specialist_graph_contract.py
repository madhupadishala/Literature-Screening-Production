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

    def test_rejects_cross_client_context(self):
        self.pack.to_dict.return_value = {"tenant_id": "t1", "client_id": "other", "citations": []}
        with self.assertRaises(IntegrationUnavailable):
            self.bridge._knowledge(self.request)

    def test_rejects_cross_client_rules(self):
        self.pack.to_dict.return_value = {"tenant_id": "t1", "client_rules": [{"client_id": "other"}]}
        with self.assertRaises(IntegrationUnavailable):
            self.bridge._knowledge(self.request)

    def test_rejects_cross_scope_citations(self):
        for citation in ({"tenant_id": "tenant-other", "client_id": "c1"},
                         {"tenant_id": "t1", "client_id": "client-other"}):
            with self.subTest(citation=citation):
                self.pack.to_dict.return_value = {"tenant_id": "t1", "client_id": "c1",
                                                  "citations": [citation]}
                with self.assertRaises(IntegrationUnavailable):
                    self.bridge._knowledge(self.request)

    def test_accepts_same_client_and_global_citations(self):
        self.pack.to_dict.return_value = {
            "tenant_id": "t1", "client_id": "c1",
            "citations": [{"tenant_id": "t1", "client_id": "c1"},
                          {"tenant_id": "GLOBAL", "client_id": "GLOBAL"}],
        }
        self.assertEqual(len(self.bridge._knowledge(self.request)["citations"]), 2)

    def test_rejects_cross_tenant_shared_rules_and_product_master(self):
        for collection in ("client_rules", "general_rules", "product_master_matches"):
            with self.subTest(collection=collection):
                self.pack.to_dict.return_value = {
                    "tenant_id": "t1", "client_id": "c1",
                    collection: [{"tenant_id": "foreign-tenant", "client_id": "c1"}],
                }
                with self.assertRaises(IntegrationUnavailable):
                    self.bridge._knowledge(self.request)

    def test_rejects_cross_client_general_rules(self):
        self.pack.to_dict.return_value = {
            "tenant_id": "t1", "client_id": "c1",
            "general_rules": [{"tenant_id": "t1", "client_id": "foreign-client"}],
        }
        with self.assertRaises(IntegrationUnavailable):
            self.bridge._knowledge(self.request)

    def test_rejects_cross_client_product_master(self):
        self.pack.to_dict.return_value = {"tenant_id": "t1", "product_master_matches": [{"client_id": "other"}]}
        with self.assertRaises(IntegrationUnavailable):
            self.bridge._knowledge(self.request)

    def test_accepts_explicit_global_and_scoped_rules(self):
        self.pack.to_dict.return_value = {"tenant_id": "t1", "client_rules": [{"client_id": "c1"}, {"client_id": "GLOBAL"}]}
        self.assertEqual(self.bridge._knowledge(self.request)["tenant_id"], "t1")

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
