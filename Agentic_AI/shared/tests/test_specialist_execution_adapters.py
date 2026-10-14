"""Step 2 specialist registration and contract smoke tests."""
import pytest
from Agentic_AI.shared.specialist_execution_adapters import (
    ALL_AGENT_IDS, CONNECTED, build_specialist_adapters, specialist_status,
)
from Agentic_AI.shared.canonical_adapters import CANONICAL_ADAPTERS
from Agentic_AI.shared.base_execution_adapter import BaseExecutionAdapter
from Agentic_AI.shared.module_dispatch import AgentExecution

PACK={"tenant_id":"tenant-a","client_id":"client-a","manifest_sha256":"a"*64,
      "citations":[],"products":[]}
TEXT="A physician reported a 50-year-old patient received aspirin; ALT 180 U/L."

def context(agent_id):
    return AgentExecution(agent_id=agent_id,module_id="intake_triage",
        document_id="doc-1",tenant_id="tenant-a",client_id="client-a",
        workflow_id="wf-1",job_id="job-1")

def test_all_agents_accounted_for_with_no_false_positive_connections():
    statuses=specialist_status()
    assert len(statuses)==len(ALL_AGENT_IDS)==27
    assert [s.agent_id for s in statuses]==list(ALL_AGENT_IDS)
    assert {s.agent_id for s in statuses if s.connected}==set(CONNECTED)
    assert len(CONNECTED)==5
    assert len([s for s in statuses if not s.connected])==22

def test_only_real_engines_are_registered():
    registry=build_specialist_adapters()
    assert set(registry)==set(CONNECTED)==set(CANONICAL_ADAPTERS)
    assert all(isinstance(adapter,BaseExecutionAdapter) for adapter in registry.values())

@pytest.mark.parametrize("agent_id",("AG07","AG16","AG25","AG27"))
def test_recovered_specialist_executes_under_base(agent_id):
    result=CANONICAL_ADAPTERS[agent_id](context(agent_id),
        {"text":TEXT,"governed_knowledge":PACK})
    assert result["agent_id"]==agent_id
    assert result["review_required"] is True
    assert result["auto_release_allowed"] is False
    assert result["knowledge_provenance"]["manifest_sha256"]=="a"*64

@pytest.mark.parametrize("agent_id",("AG07","AG16","AG25","AG27"))
def test_recovered_specialist_rejects_cross_client(agent_id):
    with pytest.raises(ValueError):
        CANONICAL_ADAPTERS[agent_id](context(agent_id),
            {"text":TEXT,"governed_knowledge":{**PACK,"client_id":"other"}})
