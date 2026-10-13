"""Canonical AG01 adapter smoke with governed KB; no local database dependency."""
import pytest
from Agentic_AI.shared.canonical_adapters import drug_extraction_adapter
from Agentic_AI.shared.module_dispatch import AgentExecution

CTX = AgentExecution(agent_id="AG01", module_id="intake_triage",
    document_id="ICSR-smoke", tenant_id="test-tenant", client_id="test-client",
    workflow_id="wf-smoke", job_id="job-smoke")
MANIFEST = "a" * 64
KB = {
    "tenant_id": "test-tenant",
    "client_id": "test-client",
    "products": [],
    "manifest_sha256": MANIFEST,
    "citations": [{
        "citationId": "control-1@v1#chunk-1",
        "repositoryManifestSha256": MANIFEST,
        "sourceFile": "approved-rule.json"
    }]
}
TEXT = "Amoxicillin was suspected of causing urticaria and was discontinued."

def test_ag01_canonical_runtime_with_governed_context():
    result = drug_extraction_adapter(CTX, {
        "text": TEXT, "source_type": "spontaneous", "governed_knowledge": KB
    })
    assert result["case_id"] == "ICSR-smoke"
    assert result["tenant_id"] == "test-tenant"
    assert result["review_required"] is True
    assert result["knowledge_context"]["repository_manifest_sha256"] == MANIFEST
    assert result["knowledge_context"]["retrieval_backend"] == "nexus-controlled-postgres"
    assert result["knowledge_context"]["client_product_master_status"] == "governed_exact_workspace_matches"
    drugs = {c["normalized_name"].lower(): c for c in result["classifications"]}
    assert drugs["amoxicillin"]["role"] == "SUSPECT"
    assert drugs["amoxicillin"]["ownership"] == "UNKNOWN"

def test_ag01_rejects_missing_or_cross_tenant_kb():
    with pytest.raises(ValueError):
        drug_extraction_adapter(CTX, {"text": TEXT})
    with pytest.raises(ValueError):
        drug_extraction_adapter(CTX, {
            "text": TEXT, "governed_knowledge": {**KB, "tenant_id": "other"}
        })

def test_ag01_rejects_mixed_manifest():
    with pytest.raises(ValueError):
        drug_extraction_adapter(CTX, {
            "text": TEXT, "governed_knowledge": {
                **KB, "citations": [{
                    "citationId": "bad", "repositoryManifestSha256": "b" * 64
                }]
            }
        })


def test_ag01_rejects_cross_client_master():
    with pytest.raises(ValueError):
        drug_extraction_adapter(CTX, {
            "text": TEXT, "governed_knowledge": {**KB, "client_id": "other-client"}
        })

def test_ag01_approved_client_product_identifies_company():
    pack = {**KB, "products": [{
        "product_id": "approved-product-1", "trade_name": "Amoxicillin",
        "aliases": [], "active_ingredients": ["amoxicillin"],
        "source_document_key": "approved-product-document"
    }]}
    result = drug_extraction_adapter(CTX, {
        "text": TEXT, "governed_knowledge": pack
    })
    by_name = {d["normalized_name"].lower(): d for d in result["classifications"]}
    assert by_name["amoxicillin"]["ownership"] == "COMPANY"
