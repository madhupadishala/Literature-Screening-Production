"""Real specialist invocation tests for AG05 and AG10; no mock clinical decisions."""
import pytest
from Agentic_AI.shared.module_dispatch import AgentExecution
from Agentic_AI.shared.canonical_adapters import CANONICAL_ADAPTERS

TEXT = "Aspirin was used for headache. Drug withdrawn."
PRODUCT = {"product_id":"product-1","trade_name":"Aspirin",
    "source_document_key":"approved-product-row","aliases":[],"active_ingredients":[]}
PACK = {"tenant_id":"tenant-a","client_id":"client-a",
    "manifest_sha256":"a"*64,"citations":[],"products":[PRODUCT]}

def ctx(agent):
    return AgentExecution(agent_id=agent,module_id="intake_triage",
       document_id="doc-1",tenant_id="tenant-a",client_id="client-a",
       workflow_id="wf-1",job_id="job-1")

def test_ag05_real_policy_engine():
    response = CANONICAL_ADAPTERS["AG05"](ctx("AG05"), {
        "text":TEXT,"governed_knowledge":PACK,
        "product_facts":[{"product_id":"product-1","indication":"headache",
            "indication_evidence":"for headache","action_taken":"Drug withdrawn",
            "action_evidence":"Drug withdrawn"}]})
    assert response["normalized_product_facts"][0]["action_taken"] == "DRUG_WITHDRAWN"
    assert response["review_required"] is True
    assert response["auto_release_allowed"] is False

def test_ag05_fails_for_foreign_product():
    with pytest.raises(ValueError):
        CANONICAL_ADAPTERS["AG05"](ctx("AG05"), {
            "text":TEXT,"governed_knowledge":PACK,
            "product_facts":[{"product_id":"foreign"}]})

def test_ag10_no_translation_needed_is_real_result_without_provider():
    response = CANONICAL_ADAPTERS["AG10"](ctx("AG10"),{
        "text":"A patient reported headache.","governed_knowledge":PACK,
        "source_language":"English","target_language":"English"})
    assert response["translation"]["status"] == "no_translation_needed"
    assert response["auto_release_allowed"] is False

def test_ag10_no_language_is_not_silently_inferred():
    with pytest.raises(ValueError):
        CANONICAL_ADAPTERS["AG10"](ctx("AG10"),{
            "text":"Test","governed_knowledge":PACK})
