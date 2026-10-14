import pytest
from Agentic_AI.shared.module_dispatch import AgentExecution
from Agentic_AI.shared.governed_knowledge_adapter import (
    AGENT_IDS, validate_governed_pack, governed_context, GovernedKnowledgeError,
)
from Agentic_AI.shared.canonical_adapters import CANONICAL_ADAPTERS

PACK = {
    "tenant_id": "t1", "client_id": "c1", "manifest_sha256": "a" * 64,
    "citations": [{"citationId": "S-1", "repositoryManifestSha256": "a" * 64}],
    "products": [],
    "passages": [{"citationId": "S-1", "text": "Verified approved knowledge excerpt."}],
}
TEXT = "A 54-year-old woman received aspirin. ALT 180 U/L. A doctor reported rash."
def ctx(agent):
    return AgentExecution(agent_id=agent,module_id="intake_triage",
                          document_id="doc-1",tenant_id="t1",client_id="c1",
                          workflow_id="wf-1",job_id="job-1")

@pytest.mark.parametrize("n",range(1,28))
def test_all_27_agent_ids_have_same_governed_contract(n):
    agent=f"AG{n:02}"
    assert agent in AGENT_IDS
    assert governed_context(ctx(agent), {"governed_knowledge":PACK})["client_id"]=="c1"

@pytest.mark.parametrize("agent",["AG07","AG16","AG25","AG27"])
def test_recovered_agent_real_execution(agent):
    result=CANONICAL_ADAPTERS[agent](ctx(agent),{"text":TEXT,"governed_knowledge":PACK})
    assert result["agent_id"]==agent
    assert result["needs_human_review"] is True
    assert result["auto_release_allowed"] is False
    assert result["governed_knowledge"]["repository_manifest_sha256"]=="a"*64

@pytest.mark.parametrize("field,bad",[
    ("tenant_id","t2"),("client_id","other"),("manifest_sha256","bad"),
    ("citations",[{"citationId":"X","repositoryManifestSha256":"b"*64}]),
    ("passages",[{"citationId":"not-approved","text":"bad"}]),
])
def test_fail_closed_knowledge(field,bad):
    with pytest.raises(GovernedKnowledgeError):
        validate_governed_pack(ctx("AG07"),{"governed_knowledge":{**PACK,field:bad}})
