"""AG01 adapter runtime smoke: real canonical engine, controlled KB boundary."""
from unittest.mock import patch
from types import SimpleNamespace

from Agentic_AI.shared.canonical_adapters import drug_extraction_adapter
from Agentic_AI.shared.module_dispatch import AgentExecution

def test_canonical_ag01_adapter_executes_real_drug_classification():
    from Agentic_AI.AG01_Drug_Extraction_Classification.src.backend.nexus_agent import NexusDrugRoleAgent
    from Agentic_AI.AG01_Drug_Extraction_Classification.src.backend.orchestrator import DrugRoleOrchestrator

    def init(self):
        self.knowledge_router = SimpleNamespace(
            build_context_pack=lambda **kwargs: SimpleNamespace(
                product_master_matches=[{
                    "trade_name": "Amoxicillin",
                    "aliases": [],
                    "active_ingredients": ["amoxicillin"]
                }],
                citations=[],
                to_dict=lambda: {"citations": [], "products": ["Amoxicillin"]},
            )
        )
        self.engine = DrugRoleOrchestrator()
        self.mention_extractor = None

    ctx = AgentExecution(
        agent_id="AG01", module_id="intake_triage", document_id="ICSR-smoke",
        tenant_id="test-tenant", client_id="test-client", workflow_id="wf-smoke",
        job_id="job-smoke")
    with patch.object(NexusDrugRoleAgent, "__init__", init):
        result = drug_extraction_adapter(
            ctx,
            {"text": "Amoxicillin was suspected of causing urticaria and was discontinued.",
             "source_type": "spontaneous"})

    assert result["case_id"] == "ICSR-smoke"
    assert result["tenant_id"] == "test-tenant"
    assert result["review_required"] is True
    drugs = {c["normalized_name"].lower(): c for c in result["classifications"]}
    assert "amoxicillin" in drugs
    assert drugs["amoxicillin"]["role"] == "SUSPECT"
