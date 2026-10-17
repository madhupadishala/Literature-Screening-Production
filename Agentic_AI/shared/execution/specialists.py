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


def _validated_case(evidence):
    from Agentic_AI.shared.kimi8_core.schemas import ICSR
    raw = evidence.get("case")
    if not isinstance(raw, dict):
        raise ValueError("structured ICSR case object is required")
    if raw.get("case_id") != evidence.get("document_id"):
        raise ValueError("ICSR identity must equal authorized source document")
    return ICSR.model_validate(raw)

def _run_case_specialist(evidence, knowledge_pack, agent_type, method):
    from Agentic_AI.shared.kimi8_core import agents
    cls = getattr(agents, agent_type)
    result = getattr(cls(), method)(_validated_case(evidence))
    return result.model_dump(mode="json")

def medical_history(evidence, knowledge_pack):
    return _run_case_specialist(evidence, knowledge_pack, "MedicalHistoryAgent", "extract")

def dechallenge(evidence, knowledge_pack):
    return _run_case_specialist(evidence, knowledge_pack, "DechallengeAgent", "assess")

def rechallenge(evidence, knowledge_pack):
    return _run_case_specialist(evidence, knowledge_pack, "RechallengeAgent", "assess")

def followup(evidence, knowledge_pack):
    return _run_case_specialist(evidence, knowledge_pack, "FollowUpQuestionnaireAgent", "generate")

def action_taken(evidence, knowledge_pack):
    return _run_case_specialist(evidence, knowledge_pack, "ActionTakenAgent", "extract")

def inclusion_exclusion(evidence, knowledge_pack):
    from Agentic_AI.shared.kimi8_core.agents import InclusionExclusionAgent
    from Agentic_AI.shared.kimi8_core.schemas import LiteratureArticle
    raw = evidence.get("article")
    if not isinstance(raw, dict) or raw.get("record_id") != evidence.get("document_id"):
        raise ValueError("authorized literature record object is required")
    article = LiteratureArticle.model_validate(raw)
    products = [p.get("trade_name", "") for p in knowledge_pack.product_master_matches]
    return InclusionExclusionAgent().screen(article, products).model_dump(mode="json")

# Explicit bindings only: comparison agents require a server-authorized comparison corpus.
VERIFIED_BINDINGS = {
    "AG01": drug_role,
    "AG06": medical_history,
    "AG14": dechallenge,
    "AG15": rechallenge,
    "AG21": followup,
    "AG22": inclusion_exclusion,
    "AG23": action_taken,
}
