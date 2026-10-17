"""Native, dependency-injected recovered clinical pipelines (not clinical qualification).

Trusted host constructs engines with approved model, controlled knowledge and
durable audit; browser input cannot choose pipeline or its knowledge scope.
"""
from __future__ import annotations

def make_native_pipeline_bindings(*, seriousness_pipeline=None, causality_pipeline=None):
    bindings = {}
    if seriousness_pipeline is not None:
        from Agentic_AI.AG11_Seriousness_Assessment.src.backend.pipeline import SeriousnessPipeline
        from Agentic_AI.AG11_Seriousness_Assessment.src.backend.schemas import CaseInput as SeriousnessCaseInput
        if not isinstance(seriousness_pipeline, SeriousnessPipeline):
            raise TypeError("AG11 requires a genuine approved SeriousnessPipeline")

        def seriousness(evidence, pack):
            case_data = evidence.get("seriousness_case")
            if not isinstance(case_data, dict) or case_data.get("case_id") != evidence.get("document_id"):
                raise ValueError("authorized AG11 case identity required")
            if case_data.get("client_id") not in (None, pack.client_id):
                raise PermissionError("seriousness case client scope mismatch")
            case = SeriousnessCaseInput.model_validate(case_data)
            result = seriousness_pipeline.assess(case, tenant_id=pack.tenant_id)
            return {"agent_id": "AG11", "status": "review_required",
                    "requires_human_review": True,
                    "assessment": result.model_dump(mode="json")}
        bindings["AG11"] = seriousness

    if causality_pipeline is not None:
        from Agentic_AI.AG13_Causality_Assessment.src.backend.pipeline import CausalityPipeline
        from Agentic_AI.AG13_Causality_Assessment.src.backend.schemas import CaseInput as CausalityCaseInput
        if not isinstance(causality_pipeline, CausalityPipeline):
            raise TypeError("AG13 requires a genuine approved CausalityPipeline")

        def causality(evidence, pack):
            case_data = evidence.get("causality_case")
            if not isinstance(case_data, dict) or case_data.get("case_id") != evidence.get("document_id"):
                raise ValueError("authorized AG13 case identity required")
            if case_data.get("client_id") != pack.client_id:
                raise PermissionError("causality case client scope mismatch")
            case = CausalityCaseInput.model_validate(case_data)
            result = causality_pipeline.assess(case, tenant_id=pack.tenant_id)
            return {"agent_id": "AG13", "status": "review_required",
                    "requires_human_review": True,
                    "assessment": result.model_dump(mode="json")}
        bindings["AG13"] = causality
    return bindings
