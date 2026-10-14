"""Prove signed Nexus execution actually invokes the per-agent KB adapter."""
import pytest
from Agentic_AI.shared.module_dispatch import CanonicalAgentDispatcher
from Agentic_AI.shared.workflow_context import issue_context

SECRET = b"test-only-signing-secret-that-is-over-32-bytes"
PACK = {"tenant_id":"tenant-a","client_id":"client-a",
        "manifest_sha256":"f"*64,"citations":[],"products":[]}

def run(agent_id, pack=PACK):
    dispatcher = CanonicalAgentDispatcher(
        signing_secret=SECRET,
        adapters={agent_id: lambda ctx,payload: {
            "seen_kb_manifest":payload["resolved_governed_context"]["repository_manifest_sha256"],
            "review_required":True}},
        enforce_governed_kb=True)
    token = issue_context(verified_principal="tester",authorized_tenant="tenant-a",
         authorized_client="client-a",module_id="case_processing",
         document_id="doc-a",workflow_id="flow-a",job_id="job-a",
         agent_id=agent_id,task_type="test",signing_secret=SECRET)
    return dispatcher.execute(agent_id=agent_id,envelope=token,
           payload={"text":"Synthetic safety record",
                    "governed_knowledge":pack} if pack is not None else {"text":"Synthetic safety record"},
           authorized_tenant="tenant-a",authorized_client="client-a")

@pytest.mark.parametrize("agent_id",["AG01","AG07","AG16","AG25","AG27"])
def test_executor_reaches_folder_kb_binding(agent_id):
    result=run(agent_id)
    assert result["result"]["seen_kb_manifest"] == "f"*64
    assert result["routing"]["client_id"] == "client-a"

def test_missing_governed_pack_never_runs_agent():
    with pytest.raises(ValueError):
        run("AG07",None)

def test_cross_client_knowledge_never_runs_agent():
    with pytest.raises(ValueError):
        run("AG07",{**PACK,"client_id":"another-client"})
