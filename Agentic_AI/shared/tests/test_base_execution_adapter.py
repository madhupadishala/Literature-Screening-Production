"""Contract tests for the shared execution base, without specialist implementations."""
import pytest
from Agentic_AI.shared.base_execution_adapter import (
    BaseExecutionAdapter, SpecialistBinding, ExecutionContractError,
)
from Agentic_AI.shared.module_dispatch import AgentExecution

def ctx(agent="AG07",client="client-a"):
    return AgentExecution(agent_id=agent,module_id="intake_triage",
        document_id="doc-1",tenant_id="tenant-a",client_id=client,
        workflow_id="flow-1",job_id="job-1")

PACK = {"tenant_id":"tenant-a","client_id":"client-a",
        "manifest_sha256":"a"*64,"citations":[],"products":[]}
PAYLOAD = {"text":"A physician reported nausea after a medicinal product.", "governed_knowledge":PACK}

def test_common_lifecycle_validates_and_standardizes():
    observations = []
    def specialist(execution,payload,kb):
        observations.append((execution.agent_id,kb["repository_manifest_sha256"]))
        return {"status":"unresolved", "auto_release_allowed":True}
    adapter=BaseExecutionAdapter(SpecialistBinding("AG07",specialist))
    result=adapter(ctx(),PAYLOAD)
    assert observations==[("AG07","a"*64)]
    assert result["review_required"] is True
    assert result["auto_release_allowed"] is False
    assert result["execution_context"]["document_id"]=="doc-1"
    assert result["knowledge_provenance"]["client_id"]=="client-a"

@pytest.mark.parametrize("bad",[
    {"text":"", "governed_knowledge":PACK},
    {"text":"x"*100001, "governed_knowledge":PACK},
    {"text":"x"},
    {"text":"x","governed_knowledge":{**PACK,"client_id":"different"}},
])
def test_rejects_invalid_inputs_before_specialist(bad):
    called=[]
    adapter=BaseExecutionAdapter(SpecialistBinding("AG07",lambda *_: called.append(1)))
    with pytest.raises(ValueError):
        adapter(ctx(),bad)
    assert called==[]

def test_rejects_wrong_agent_binding():
    adapter=BaseExecutionAdapter(SpecialistBinding("AG07",lambda *_: {}))
    with pytest.raises(ExecutionContractError):
        adapter(ctx("AG16"),PAYLOAD)

def test_rejects_invalid_specialist_output_and_routing_forgery():
    for output in (None,{"routing":{"tenant_id":"other"}},{"execution_context":{}}):
        adapter=BaseExecutionAdapter(SpecialistBinding("AG07",lambda *_: output))
        with pytest.raises(ExecutionContractError):
            adapter(ctx(),PAYLOAD)

def test_rejects_unregistered_ids():
    with pytest.raises(ExecutionContractError):
        BaseExecutionAdapter(SpecialistBinding("AG28",lambda *_: {}))
