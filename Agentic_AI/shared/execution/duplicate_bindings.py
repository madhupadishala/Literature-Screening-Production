"""Opt-in AG18/AG19 bindings; comparison candidates are supplied only by a trusted server repository."""
from __future__ import annotations
from Agentic_AI.shared.execution.duplicate_candidates import AuthorizedDuplicateCandidateService, CandidateScopeError
from Agentic_AI.shared.kimi8_core.schemas import ICSR, LiteratureArticle
from Agentic_AI.shared.kimi8_core.agents import IcsrDuplicateAgent, LiteratureDuplicateAgent

def make_duplicate_bindings(repository):
    """The caller must inject a DB repository enforcing tenant AND client isolation in SQL."""
    service = AuthorizedDuplicateCandidateService(repository)

    def run(kind, model, engine_method, evidence, pack):
        tenant_id, client_id = pack.tenant_id, pack.client_id
        current_id = evidence["document_id"]
        raw = evidence.get("case" if kind == "icsr" else "article")
        if not isinstance(raw, dict):
            raise ValueError("authorized structured record required")
        id_key = "case_id" if kind == "icsr" else "record_id"
        if raw.get(id_key) != current_id:
            raise ValueError("incoming record identity mismatch")
        incoming = model.model_validate(raw)
        rows = service.retrieve(kind=kind, tenant_id=tenant_id, client_id=client_id,
                                exclude_id=current_id, limit=1000)
        results = []
        for row in rows:
            if not isinstance(row.get("record"), dict) or row["record"].get(id_key) != row["record_id"]:
                raise CandidateScopeError("invalid authorized candidate identity/payload")
            existing = model.model_validate(row["record"])
            result = engine_method(incoming, existing)
            results.append({"candidate_id": row["record_id"], "assessment": result.model_dump(mode="json")})
        return {"agent": "AG19" if kind == "icsr" else "AG18",
                "candidate_count": len(results), "comparisons": results,
                "requires_human_review": True}

    def literature(evidence, pack):
        return run("literature", LiteratureArticle, LiteratureDuplicateAgent().assess_pair, evidence, pack)

    def icsr(evidence, pack):
        return run("icsr", ICSR, IcsrDuplicateAgent().compare, evidence, pack)

    return {"AG18": literature, "AG19": icsr}
