"""Use actual recovered AG11 pipeline in a synthetic source-only execution test.

This test does not assert clinical validity: the offline baseline extractor is not
independent and must never be configured for hosted clinical decision-making.
"""
import unittest
from types import SimpleNamespace
from Agentic_AI.shared.execution.native_pipeline_bindings import make_native_pipeline_bindings
from Agentic_AI.AG11_Seriousness_Assessment.src.backend.pipeline import SeriousnessPipeline
from Agentic_AI.AG11_Seriousness_Assessment.src.backend.extraction import OfflineBaselineExtractor
from Agentic_AI.AG11_Seriousness_Assessment.src.backend.audit import AuditLog
from Agentic_AI.AG11_Seriousness_Assessment.src.backend.config import Config

class NativePipelineTests(unittest.TestCase):
    def setUp(self):
        self.pack = SimpleNamespace(tenant_id="orcimed", client_id="hetero")
        self.pipeline = SeriousnessPipeline(OfflineBaselineExtractor(), AuditLog(), Config(samples=1))
    def test_real_seriousness_pipeline_is_invoked(self):
        specialist = make_native_pipeline_bindings(seriousness_pipeline=self.pipeline)["AG11"]
        result = specialist({
            "document_id": "SYN-CASE",
            "seriousness_case": {
                "case_id": "SYN-CASE",
                "narrative": "Synthetic patient was hospitalized after experiencing an adverse reaction.",
                "event_terms": ["Nausea"],
            },
        }, self.pack)
        self.assertEqual(result["agent_id"], "AG11")
        self.assertEqual(result["assessment"]["case_id"], "SYN-CASE")
        self.assertEqual(result["status"], "review_required")
        self.assertTrue(result["requires_human_review"])
    def test_document_id_mismatch_denied(self):
        specialist = make_native_pipeline_bindings(seriousness_pipeline=self.pipeline)["AG11"]
        with self.assertRaises(ValueError):
            specialist({"document_id":"SYN-CASE", "seriousness_case":{"case_id":"OTHER","narrative":"synthetic"}}, self.pack)
    def test_rejects_fake_pipeline(self):
        with self.assertRaises(TypeError):
            make_native_pipeline_bindings(seriousness_pipeline=object())
if __name__ == "__main__":
    unittest.main()

class DualPipelineRegressionTests(unittest.TestCase):
    def test_seriousness_and_causality_keep_distinct_schemas(self):
        from backend.services.pv_agents.real_engine_qualification import components,evidence
        deps=components()
        bindings=make_native_pipeline_bindings(seriousness_pipeline=deps['seriousness_pipeline'],causality_pipeline=deps['causality_pipeline'])
        pack=SimpleNamespace(tenant_id='nexus-staging-tenant',client_id='nexus-staging-client')
        for agent in ('AG11','AG13'):
            result=bindings[agent](evidence(),pack)
            self.assertEqual(result['agent_id'],agent)
