"""Synthetic offline AG02 async engine binding contract."""
import sys
import types
import unittest
from unittest.mock import patch
from Agentic_AI.shared.execution.native_event_engine import create_event_runtime

NS=("Agentic_AI.AG02_Adverse_Event_MedDRA.src.branches."
    "feat__event-extraction-agent.backend.agents.event_runtime")
class FakeRequest:
    @classmethod
    def model_validate(cls, raw): return raw
class FakeEngine:
    async def run(self, case):
        return types.SimpleNamespace(
            case_id=case["case_id"],qualified_for_autonomous_use=False,
            model_dump=lambda **kwargs:{"case_id":case["case_id"],"events":[],"status":"review_required"})
class NativeEventTests(unittest.TestCase):
    def setUp(self):
        engine_mod=types.ModuleType(NS+".engine")
        engine_mod.EventEngine=FakeEngine
        models_mod=types.ModuleType(NS+".models")
        models_mod.Request=FakeRequest
        self.context=patch.dict(sys.modules,{NS+".engine":engine_mod,NS+".models":models_mod})
        self.context.start();self.addCleanup(self.context.stop)
    def test_real_async_call_and_scope(self):
        agent=create_event_runtime(FakeEngine())
        result=agent.execute({"agent_id":"AG02","tenant_id":"orcimed","client_id":"hetero",
            "document_id":"SYN-EVT-1","input":{"document_id":"SYN-EVT-1",
               "case":{"case_id":"SYN-EVT-1","documents":[{"id":"SYN-1"}]}}})
        self.assertEqual(result["agent_id"],"AG02")
        self.assertEqual(result["assessment"]["case_id"],"SYN-EVT-1")
        self.assertTrue(result["requires_human_review"])
    def test_mismatched_source_rejected(self):
        agent=create_event_runtime(FakeEngine())
        with self.assertRaises(ValueError):
            agent.execute({"document_id":"SYN-EVT-1","tenant_id":"orcimed",
                "client_id":"hetero","input":{"document_id":"OTHER","case":{"case_id":"SYN-EVT-1"}}})
    def test_fake_engine_type_rejected(self):
        with self.assertRaises(TypeError):create_event_runtime(object())

if __name__=="__main__":unittest.main()
