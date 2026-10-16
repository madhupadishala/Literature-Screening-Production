"""Direct synchronous Nexus AG02 bridge for the recovered async EventEngine.

Trusted host injects the real EventEngine, already configured with an approved
private extractor and MedDRA dictionary. No engine/provider created from evidence.
WSGI execution is synchronous; reject invocation from inside an event loop.
"""
import asyncio

def create_event_runtime(engine):
    from Agentic_AI.AG02_Adverse_Event_MedDRA.src.branches.feat__event_extraction_agent.backend.agents.event_runtime.engine import EventEngine
    from Agentic_AI.AG02_Adverse_Event_MedDRA.src.branches.feat__event_extraction_agent.backend.agents.event_runtime.models import Request
    if not isinstance(engine, EventEngine):
        raise TypeError("AG02 requires genuine recovered EventEngine")

    class Runtime:
        def execute(self, request):
            payload=request["input"]
            if not isinstance(payload,dict) or payload.get("document_id")!=request["document_id"]:
                raise ValueError("AG02 source document mismatch")
            case=payload.get("case")
            if not isinstance(case,dict) or case.get("case_id")!=request["document_id"]:
                raise ValueError("AG02 case/document mismatch")
            try:
                asyncio.get_running_loop()
            except RuntimeError:
                pass
            else:
                raise RuntimeError("Async service must use isolated runner rather than nested loop")
            result=asyncio.run(engine.run(Request.model_validate(case)))
            if result.case_id!=request["document_id"]:
                raise ValueError("Recovered AG02 engine output identity mismatch")
            if result.qualified_for_autonomous_use:
                raise ValueError("Unqualified AG02 engine attempted autonomous output")
            return {
                "agent_id":"AG02","document_id":request["document_id"],
                "tenant_id":request["tenant_id"],"client_id":request["client_id"],
                "status":"review_required","requires_human_review":True,
                "assessment":result.model_dump(mode="json"),
            }
    return Runtime()
