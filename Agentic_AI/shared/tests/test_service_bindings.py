"""Service port contract tests; no real clinical runtime or remote call implied."""
import unittest
from types import SimpleNamespace
from Agentic_AI.shared.execution.service_bindings import (
    SERVICE_BOUND_AGENTS, make_service_bindings,
)

class ServiceBindingsTest(unittest.TestCase):
    def setUp(self):
        self.pack = SimpleNamespace(tenant_id="orcimed", client_id="hetero")
        self.doc = {"document_id": "DOC-1", "text": "synthetic report"}
    @staticmethod
    def service(*, evidence, knowledge_pack):
        return {
            "agent_id": "AG02", "document_id": evidence["document_id"],
            "tenant_id": knowledge_pack.tenant_id, "client_id": knowledge_pack.client_id,
            "status": "completed_unqualified", "requires_human_review": True,
            "assessment": {"synthetic_test": True},
        }
    def test_all_12_ports_declared(self):
        self.assertEqual(len(SERVICE_BOUND_AGENTS), 12)
        self.assertEqual(make_service_bindings({}), {})
    def test_invokes_injected_real_callable(self):
        output = make_service_bindings({"AG02": self.service})["AG02"](self.doc, self.pack)
        self.assertEqual(output["document_id"], "DOC-1")
    def test_rejects_unknown_or_unapproved_port(self):
        with self.assertRaises(ValueError):
            make_service_bindings({"AG01": self.service})
        with self.assertRaises(TypeError):
            make_service_bindings({"AG02": None})
    def test_denies_cross_scope_output(self):
        def wrong(*, evidence, knowledge_pack):
            return {**self.service(evidence=evidence, knowledge_pack=knowledge_pack),
                    "tenant_id": "vigilare"}
        with self.assertRaises(PermissionError):
            make_service_bindings({"AG02": wrong})["AG02"](self.doc, self.pack)
    def test_denies_unreviewed_status(self):
        def autonomous(*, evidence, knowledge_pack):
            return {**self.service(evidence=evidence, knowledge_pack=knowledge_pack),
                    "requires_human_review": False}
        with self.assertRaises(ValueError):
            make_service_bindings({"AG02": autonomous})["AG02"](self.doc, self.pack)
    def test_denies_wrong_document(self):
        def swapped(*, evidence, knowledge_pack):
            return {**self.service(evidence=evidence, knowledge_pack=knowledge_pack),
                    "document_id": "OTHER"}
        with self.assertRaises(ValueError):
            make_service_bindings({"AG02": swapped})["AG02"](self.doc, self.pack)

if __name__=="__main__": unittest.main()
