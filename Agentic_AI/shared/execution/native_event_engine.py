"""Direct synchronous Nexus AG02 bridge for the recovered async EventEngine.

Trusted host injects the real EventEngine, already configured with an approved
private extractor and MedDRA dictionary. No engine/provider created from evidence.
WSGI execution is synchronous; reject invocation from inside an event loop.
"""
import asyncio
from concurrent.futures import ThreadPoolExecutor

def create_event_runtime(engine):
    from importlib import import_module
    namespace = ("Agentic_AI.AG02_Adverse_Event_MedDRA.src.branches."
                 "feat__event-extraction-agent.backend.agents.event_runtime")
    EventEngine = import_module(namespace + ".engine").EventEngine
    Request = import_module(namespace + ".models").Request
    if not isinstance(engine, EventEngine):
        raise TypeError("AG02 requires genuine recovered EventEngine")

    class Runtime:
        async def execute_async(self, request):
            """ASGI callers await this: event loop stays responsive."""
            return await asyncio.to_thread(self.execute, request)

        def execute(self, request):
            try:
                asyncio.get_running_loop()
            except RuntimeError:
                pass
            else:
                raise RuntimeError("Use await execute_async from an active event loop")
            payload=request["input"]
            if not isinstance(payload,dict) or payload.get("document_id")!=request["document_id"]:
                raise ValueError("AG02 source document mismatch")
            case=payload.get("case")
            if not isinstance(case,dict) or case.get("case_id")!=request["document_id"]:
                raise ValueError("AG02 case/document mismatch")
            validated = Request.model_validate(case)
            # One worker thread owns its event loop; safe from async ASGI callers.
            with ThreadPoolExecutor(max_workers=1, thread_name_prefix='ag02-engine') as executor:
                future = executor.submit(lambda: asyncio.run(engine.run(validated)))
                result = future.result(timeout=1800)
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


def create_approved_event_runtime(*, provider, dictionary=None, ocr=None, schema_bundle=None,
                                  concurrency=2):
    """Trusted composition only: instantiate the genuine recovered engine.

    The provider must expose async extract/verify and a stable identity.
    No implicit public LLM fallback or default unlicensed MedDRA dictionary.
    """
    from importlib import import_module
    ns = ("Agentic_AI.AG02_Adverse_Event_MedDRA.src.branches."
          "feat__event-extraction-agent.backend.agents.event_runtime")
    Engine = import_module(ns + ".engine").EventEngine
    if provider is None or not all(callable(getattr(provider, name, None)) for name in ("extract", "verify")):
        raise TypeError("AG02 requires an approved extractor/verifier")
    if not isinstance(getattr(provider, "identity", None), str) or not provider.identity:
        raise ValueError("AG02 provider identity is mandatory")
    return create_event_runtime(Engine(provider, dictionary=dictionary,
                                      ocr=ocr, schema_bundle=schema_bundle,
                                      concurrency=concurrency))
