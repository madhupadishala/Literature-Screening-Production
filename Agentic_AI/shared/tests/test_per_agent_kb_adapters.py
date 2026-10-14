"""Verify all 27 canonical folders expose actual governed KB adapters."""
import importlib
import json
from pathlib import Path
import pytest

from Agentic_AI.shared.module_dispatch import AgentExecution
from Agentic_AI.shared.governed_knowledge_adapter import GovernedKnowledgeError

ROOT = Path(__file__).resolve().parents[2]
FOLDERS = sorted(p for p in ROOT.iterdir() if p.is_dir() and p.name.startswith("AG") and p.name[2:4].isdigit())
PACK = {"tenant_id":"tenant-a","client_id":"client-a",
        "manifest_sha256":"a"*64,"citations":[],"products":[]}

@pytest.mark.parametrize("folder",FOLDERS,ids=lambda x:x.name[:4])
def test_adapter_in_each_agent_folder(folder):
    adapter = importlib.import_module("Agentic_AI." + folder.name + ".kb_adapter")
    agent_id = folder.name[:4]
    assert adapter.AGENT_ID == agent_id
    ctx = AgentExecution(agent_id=agent_id,module_id="intake_triage",
       document_id="doc-a",tenant_id="tenant-a",client_id="client-a",
       workflow_id="flow-a",job_id="job-a")
    out = adapter.build_knowledge_context(ctx,{"governed_knowledge":PACK})
    assert out["repository_manifest_sha256"] == "a"*64
    with pytest.raises(GovernedKnowledgeError):
        adapter.build_knowledge_context(ctx,{"governed_knowledge":{**PACK,"client_id":"other"}})
    with pytest.raises(ValueError,match="wrong agent"):
        adapter.build_knowledge_context(AgentExecution(**{**vars(ctx),"agent_id":"AG99"}),
                                       {"governed_knowledge":PACK})

def test_exactly_27_agent_folders():
    assert len(FOLDERS) == 27
