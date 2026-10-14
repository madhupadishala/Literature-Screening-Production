"""Security and contract checks for remote agent specialist adapters."""
import pytest
from Agentic_AI.shared.module_dispatch import AgentExecution
from Agentic_AI.shared.canonical_adapters import CANONICAL_ADAPTERS

PACK = {"tenant_id":"tenant-a","client_id":"client-a",
        "manifest_sha256":"a"*64,"citations":[],"products":[]}

def ctx(agent):
    return AgentExecution(agent_id=agent,module_id="intake_triage",
        document_id="doc-1",tenant_id="tenant-a",client_id="client-a",
        workflow_id="wf-1",job_id="job-1")

@pytest.mark.parametrize("agent",["AG02","AG08","AG11","AG12","AG13","AG17","AG20","AG26"])
def test_remote_bindings_refuse_execution_without_approved_service(agent,monkeypatch):
    monkeypatch.delenv("NEXUS_APPROVED_AGENT_SERVICES_JSON",raising=False)
    monkeypatch.delenv("NEXUS_APPROVED_TS_AGENT_SERVICES_JSON",raising=False)
    monkeypatch.delenv("NEXUS_CAUSALITY_CLIENT_KB_VALIDATED",raising=False)
    with pytest.raises((PermissionError,ValueError)):
        CANONICAL_ADAPTERS[agent](ctx(agent),
             {"text":"Synthetic patient reported nausea.",
              "governed_knowledge":PACK})

@pytest.mark.parametrize("agent",["AG02","AG08","AG11","AG12","AG13","AG17","AG20","AG26"])
def test_remote_bindings_reject_cross_tenant_knowledge(agent):
    with pytest.raises(ValueError):
        CANONICAL_ADAPTERS[agent](ctx(agent),
             {"text":"Synthetic patient reported nausea.",
              "governed_knowledge":{**PACK,"tenant_id":"other"}})
