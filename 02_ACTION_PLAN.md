# Shortest Path to a Functional Literature Workflow

## Recommended target

Choose the existing deterministic `backend.workflow.LiteratureWorkflow` as the single workflow engine and the Next.js app as the single UI. Do not extend the legacy Streamlit or Groq branches until the deterministic path is fully connected and tested.

## Minimal critical path

1. **Make the frontend compile cleanly.** Fix the two Qdrant filter type errors first, then resolve the literature/workflow lint errors (especially `any` types and effect/state patterns). This restores a verifiable frontend build.
2. **Secure and harden `/api/workflow/run`.** Validate tenant and package IDs against an allow-list/strict identifier pattern; pass them as Python arguments instead of interpolating them into executable Python; reject package paths outside `evidence_store`.
3. **Unify workflow reads and writes.** Replace `mockWorkflows.ts` in `/api/workflow/list` with a reader that enumerates package metadata and `workflow_state.json`/output files. Make the detail page use the same canonical package schema.
4. **Define one package contract.** Require `metadata.json`, source abstract/full text, and versioned hits/screening/intake output schemas. Normalize PubMed/article-fetch results into that contract before invoking the workflow.
5. **Connect intake and QC outcomes.** Persist review decisions, assignee, stage, priority, audit entries, and errors alongside the package (or preferably in a database), then surface them in workflow list/detail APIs.
6. **Add tests for the happy path and failure cases.** Cover: article with no product, product hit, proceed-to-intake, invalid/missing package, unsafe identifier rejection, and API list/detail consistency. Ensure test runs do not mutate demo data.

## Next increments

- Move file-backed package state to a tenant-scoped database/object store with locking, audit records, retries and a job queue.
- Integrate the existing PubMed, document-processing, duplicate, translation and normalization services as actual upstream pipeline stages; remove the TypeScript `PipelineRunner` simulation once replaced.
- Either remove or isolate `backend.api.run_screening_package` and `backend.orchestrators`; if retained, add `groq` and `pydantic` to dependency management, secret handling, schema validation, observability and human-review gates.
- Retire or clearly label the Streamlit stack to prevent two user-facing sources of truth.

## Definition of fully functional

A user can create/import an evidence package, run it safely, see the actual package move from Hits through Screening and Intake/QC, review/override it with an audit trail, and retrieve/export the same persisted result after restart. The frontend passes type-check/lint, the workflow has automated tests, and no dashboard or pipeline stage depends on mock/in-memory records.

## Dependencies to resolve before production

| Dependency | Needed for |
|---|---|
| TypeScript/Qdrant type correction | Frontend type check/build |
| Strict runner validation | Safe workflow execution |
| Package-state repository | Real dashboard and restart persistence |
| Test suite/CI | Regression confidence |
| Groq + Pydantic declarations and `GROQ_API_KEY` | Optional LLM branch only |
| PubMed/OCR/translation service configuration | Full source-ingestion workflow |


