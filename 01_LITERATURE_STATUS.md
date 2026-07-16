# Literature Module Status

## Implemented workflow components

The deterministic Python pipeline is the most complete end-to-end implementation:

```text
Next POST /api/workflow/run
  -> Python LiteratureWorkflow
  -> package metadata.json + abstract.txt
  -> HitsOrchestrator
       -> product, author, country/MAH, PII, confidence, QC, HitsBuilder
  -> ScreeningOrchestrator
       -> event/special-situation/seriousness/severity/exclusion rules
       -> ScreeningBuilder
  -> IntakeInputBuilder
  -> hits_output.json, screening_output.json, intake_input.json, workflow_state.json
```

Implemented supporting capabilities include PubMed request/client services, article fetch, PDF/OCR processing, duplicate matching, evidence normalization, source registry/router, search-strategy generation, language detection/translation, and a file-backed knowledge/rule set. Their Next APIs are available, but their persistence and pipeline handoff are generally not integrated.

## Dependency graph

```text
UI pages/components
 ├─ /api/workflow/list ─────────────> mockWorkflows.ts (static demo records)
 ├─ /api/workflow/package/[id] ─────> evidence_store JSON
 └─ /api/workflow/run ──────────────> backend.workflow.LiteratureWorkflow
                                      ├─ WorkflowStateManager
                                      ├─ agents.hits.HitsOrchestrator
                                      │  └─ product/author/country/MAH/PII/confidence/QC/hits services
                                      ├─ agents.screening.ScreeningOrchestrator
                                      │  └─ screening rules + ScreeningBuilder
                                      └─ services.intake_input.IntakeInputBuilder

Independent TypeScript branch:
literature APIs -> lib/literature/* services -> in-memory service state
                                       └─ PipelineRunner (all stages marked completed)

Independent legacy branch:
backend.api.run_screening_package -> KnowledgeRouter -> Groq LLM orchestrators
```

## Incomplete, placeholder, or simulated areas

- `frontend/lib/literature/mockWorkflows.ts` is the data source for `/api/workflow/list`; it has two hard-coded records, so the main workflow dashboard is not connected to generated package state.
- `frontend/lib/literature/orchestrator/pipeline-runner.ts` creates all ten stages with `status: "completed"` at the same timestamp; it does no processing.
- The LLM stack requires `GROQ_API_KEY`, creates a `Groq` client, and contains fallback output rather than a reliable production retry/error contract. It is not the path called by the current workflow-run API.
- `engines/` contains five extensionless named engine placeholders and only `engines/search_engine/search_engine.py` as code.
- 17 `.gitkeep` files mark intentionally empty platform/service/config/docs/test/knowledge folders.
- Placeholder text is present in legacy hits/knowledge panels and many frontend input controls. Most input placeholders are normal UI affordances, but the mock workflow and synthetic pipeline above are functional placeholders.

## Verified faults and risk findings

1. **TypeScript type-check fails:** `frontend/lib/knowledge/vector/qdrant-knowledge-client.ts:443,452` casts `{ match: { value: string } }` to a Qdrant filter type requiring `{ match: { any: string[] } }`.
2. **Frontend lint fails:** 53 errors and 14 warnings. Literature-facing errors include explicit `any` values, hook dependency violations, synchronous state updates in effects, and dynamic workflow-page errors. The complete command output was too long to reproduce; this count is from `npm.cmd run lint`.
3. **Workflow route path injection risk:** `frontend/app/api/workflow/run/route.ts` interpolates unvalidated `tenant_id` and `package_id` into Python source and a filesystem path before starting Python. This can cause broken execution and is unsafe.
4. **State mismatch:** the runner produces evidence-store JSON, but the workflow-list API ignores it and returns static mock records.
5. **Missing declared Python dependencies:** the LLM files import `groq` and `pydantic`, but neither appears in `requirements.txt`. A fresh environment cannot install the declared project dependencies and run that branch.
6. **Live execution prerequisites:** the LLM branch requires a Groq key and external network; real PubMed/translation/OCR flows similarly need service/input integration. No mutating workflow run was performed because it writes package artifacts.

## Completion estimate

**About 55% complete for a demonstrable Literature workflow; about 30% production-ready.** The core deterministic processing stages exist and can write package outputs. The lower production figure reflects split architectures, static dashboard data, no durable database/job model, failing TypeScript checks, lack of automated tests, unsafe runner inputs, and unresolved external-service configuration.
