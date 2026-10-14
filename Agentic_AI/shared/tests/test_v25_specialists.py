import pytest
from Agentic_AI.shared.canonical_adapters import CANONICAL_ADAPTERS
from Agentic_AI.shared.module_dispatch import AgentExecution
from Agentic_AI.shared.v2_5.specialist_loader import load_source

PACK={"tenant_id":"tenant-a","client_id":"client-a","manifest_sha256":"a"*64,
      "citations":[],"products":[]}

@pytest.mark.parametrize("key",["AG03","AG04","AG09","AG24_history","AG24_current"])
def test_original_v25_source_entrypoint_can_load(key):
    assert callable(load_source(key))

@pytest.mark.parametrize("agent",["AG03","AG04","AG09","AG24"])
def test_no_unapproved_patient_reporter_egress(agent,monkeypatch):
    monkeypatch.delenv("NEXUS_PV_PII_PROVIDER_APPROVED",raising=False)
    ctx=AgentExecution(agent_id=agent,module_id="intake_triage",
        document_id="doc",tenant_id="tenant-a",client_id="client-a",
        workflow_id="wf",job_id="job")
    with pytest.raises(PermissionError):
        CANONICAL_ADAPTERS[agent](ctx,{
            "text":"A patient experienced nausea.",
            "governed_knowledge":PACK})
