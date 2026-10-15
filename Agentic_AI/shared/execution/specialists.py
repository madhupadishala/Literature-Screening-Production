"""Explicit, opt-in bindings to canonical specialist implementations."""
from __future__ import annotations

def drug_role(evidence: dict, knowledge_pack) -> dict:
    """Use recovered AG01 deterministic classifier, with scoped Product Master."""
    from Agentic_AI.AG01_Drug_Extraction_Classification.src.backend.orchestrator import DrugRoleOrchestrator
    engine = DrugRoleOrchestrator()
    text = " ".join(str(evidence.get(k, "")) for k in ("title", "abstract", "text")).strip()
    candidates = evidence.get("candidate_drugs")
    if candidates is not None and (not isinstance(candidates, list) or
                                   not all(isinstance(s, str) for s in candidates)):
        raise ValueError("candidate_drugs must be a list of drug names")
    result = engine.classify(
        case_id=str(evidence.get("case_id") or evidence["document_id"]),
        tenant_id=knowledge_pack.tenant_id,
        source_type=str(evidence.get("source_type", "unknown")),
        text=text,
        candidate_drugs=candidates,
        company_products=knowledge_pack.product_master_matches,
    )
    return result.to_dict()

# These are the engines verified for this adapter contract, not just recovered folders.
VERIFIED_BINDINGS = {"AG01": drug_role}
