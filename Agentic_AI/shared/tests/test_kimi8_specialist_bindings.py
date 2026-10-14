"""Exercises real canonical Kimi8 source and approved-rule denial."""
import pytest
from Agentic_AI.shared.specialist_execution_adapters import build_specialist_adapters
from Agentic_AI.shared.module_dispatch import AgentExecution

PACK = {"tenant_id":"tenant-a","client_id":"client-a",
        "manifest_sha256":"a"*64,"citations":[],"products":[]}
TEXT = "Medical history: asthma. The patient developed nausea."
def ctx(id):
    return AgentExecution(agent_id=id,module_id="case_processing",
         document_id="doc",tenant_id="tenant-a",client_id="client-a",
         workflow_id="wf",job_id="job")

@pytest.mark.parametrize("id",["AG06","AG14","AG15","AG18","AG19","AG21","AG22","AG23"])
def test_canonical_kimi8_source_is_importable(id):
    from Agentic_AI.shared.kimi8_core.specialist_loader import load_specialist
    cls=load_specialist(id)
    assert callable(cls)

def test_ag06_real_medical_history_engine():
    adapter=build_specialist_adapters()["AG06"]
    out=adapter(ctx("AG06"),{"text":TEXT,"governed_knowledge":PACK,
        "case":{"case_id":"case-1","narrative":TEXT,"medical_history_text":"asthma"}})
    assert out["agent_id"]=="AG06"
    assert out["review_required"] is True
    assert out["auto_release_allowed"] is False

def test_no_unapproved_rules_allowed():
    adapter=build_specialist_adapters()["AG14"]
    with pytest.raises(PermissionError):
        adapter(ctx("AG14"),{"text":TEXT,"governed_knowledge":PACK,
            "case":{"case_id":"case-1","narrative":TEXT}})
