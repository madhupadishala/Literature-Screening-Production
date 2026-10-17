# Phase 2 — agent execution and clinical workflow integration

## Implemented and executed

- Active `/readyz/vector`: dedicated Qdrant canary collection, acknowledged point write, filtered similarity readback, acknowledged cleanup, bounded requests, no redirects, 30-second process cache. Missing provider or any failed operation returns 503. `index_status=synced` applies only to this canary; `clinical_index_verified=false` prevents conflating a canary pass with clinical KB synchronization.
- Genuine recovered-engine runner: `python -m backend.services.pv_agents.real_engine_qualification`. All **27 engines passed locally**, including the AG02 async graph, AG11/13 pipelines and five TypeScript engines. Provider responses and knowledge are explicitly synthetic fixtures. No live model, dictionary qualification, or clinical release is asserted.
- Separate hosted-compatible `/v1/staging/synthetic-composition`: 27 dry-run slots, **19 Python engines and 8 native-dependency fixtures**. It cannot masquerade as the genuine-engine runner. Existing `/synthetic-dispatch` retains its honest 13-engine count when native dependencies are absent.
- `scripts/qualification/document_to_case_trace.py`: all 27 genuine engines in a single synthetic workflow, persistent local Chroma with synthetic embeddings, local SQLite transaction/audit fixture, pending-human-review draft and non-transmissible submission preview. SOP/product/label fixture retrieval is isolated across three tenant/workspace combinations. This is not a production Nexus Postgres execution.
- Production frontend `POST /api/safety/agent-workflow`: live CASE_CREATE workspace guard; body accepts only intakeRecordId/requestId/reason; scope derives from the same signed session/context authority as `/api/context/current`. Reads approved source and entities in SQL scope, validates source hash and returned batch scope, requires 27 review-only results, serializes idempotency, rechecks source under lock, invokes the existing Nexus case creation/review-task transaction, and stages agent results plus a non-transmissible preview. No finalized case version or authority package is created.
- Backend `/v1/workflows/assess`: explicit server token grants must match tenant key, workspace/client UUID, and environment. Diagnostic tokens are prohibited. Genuine production engine composition has no synthetic fallback and requires explicit server configuration. Source language, source class, and actual receipt party must be provided from reviewed intake metadata; `metadata.receivedBy` supplies the latter. Unknown clock-start metadata fails closed instead of inventing an MAH receipt.
- Migration 042 creates the scoped result store, database scope trigger, and AG19 comparison projection. Applied to the fingerprinted `literature_screening_prod` database and recorded with checksum `1dc9efbd53d902c5b22eb50818f382d40841faf359ddd7c78747c8d1eccbf342`. No clinical records were inserted by qualification.

## Why 14 slots did not execute

The default staging probe supplies none of the optional dependencies. This is deliberate fail-closed registration, not a queue or promise dropout.

| Slots | Missing host dependency |
|---|---|
| AG03, AG04, AG09, AG24 | Approved structured JSON provider |
| AG18, AG19 | SQL-backed authorized tenant/workspace comparison corpus |
| AG11, AG13 | Genuine pipelines, approved extractor, controlled KB and audit |
| AG02 | Genuine async EventEngine and approved local provider |
| AG08, AG12, AG17, AG20, AG26 | Colocated Node engines/private signed socket and approved local COI provider |

The complete 27-slot engine target map is in `phase2-evidence/agent-dependency-map.json`.

Additional defects resolved:

1. **Closure collision:** simultaneous AG11/AG13 registration reused `CaseInput` in one enclosing scope. AG11 validated with AG13's schema. Imports now use distinct aliases; dual-registration regression test executes both real pipelines.
2. **Module routing:** AG09, AG17 and AG26 cannot run as CASE_PROCESSING. Qualification now issues authorized intake envelopes for those agents.
3. **Knowledge scope:** `KnowledgeRouter` omitted `client_id` in the returned pack. It now carries the client/workspace identifier; the execution boundary rejects absent or mismatched client scope.
4. **Environment filtering:** Chroma retrieval now supports a mandatory verified environment in workflow composition, applies it before similarity search, and rejects mismatched returned metadata.

The two legacy vector HTTP interfaces also now require the live server principal. Their tenant-only memory providers use a server-derived tenant/workspace/environment namespace before similarity search; upsert IDs are namespaced to prevent cross-workspace overwrites. Uploads require CONFIG_UPLOAD and global vector counts are no longer exposed. Memory status is explicitly non-durable and is not proof of external vector health.

## Production configuration boundaries

- The connected Render API exposes no service-settings update operation; the runner has no RENDER_API_KEY. The existing guarded deployment script contains the precise `/healthz` PATCH. Render Dashboard authentication is required to apply this setting with the currently available capabilities. A committed setting/payload does not prove the live field changed.
- The current Python-only Render service cannot host the already-designed colocated Node socket/local-model topology without the corresponding runtime deployment. No clinical flags or remote public model fallbacks were enabled.
- `/readyz` remains audit/token-scope readiness. `/readyz/vector` independently reports actual vector availability. An unconfigured live endpoint must remain 503, not return fabricated `vector_ready=true`.
- Frontend private service configuration: `NEXUS_PV_WORKFLOW_URL`, `NEXUS_PV_WORKFLOW_TOKEN`.
- Backend composition: `NEXUS_PV_REVIEW_WORKFLOW_ENABLED`, per-environment service-token grants, `NEXUS_WORKFLOW_SIGNING_SECRET`, `NEXUS_WORKFLOW_DATABASE_URL`, approved private JSON gateway variables, the native socket worker and approved local AG02 provider. The review-workflow flag is separate from clinical autonomous authorization.
- AG19 projection currently covers ICSR candidates. AG18 requires a genuine authorized literature corpus; it must not be populated with fabricated article metadata. The local genuine-engine qualification supplies an explicit nonempty synthetic literature corpus to test the actual comparison engine.

## Verification evidence

- `phase2-evidence/genuine-27-engine-dispatch.json`: 27/27 genuine engines; synthetic providers.
- `phase2-evidence/document-to-case-trace.json`: 32 ordered audit entries, actual local Chroma/SQLite fixtures, all 27 engines, isolated retrieval, review and preview IDs.
- 112 Python tests passed. Five existing AF_UNIX transport tests could not run because this sandbox denies Unix socket creation. They are not reported as passing; the five real TS engines were separately invoked using the local qualification subprocess transport.
- 32 frontend auth/workflow/vector tests passed, including source-scope, poisoning, partial-dispatch, transaction, source-mutation, viewer write denial, same-ID upsert and pre-similarity tenant/workspace/environment isolation cases.
- TypeScript and targeted ESLint passed. Clean optimized production build passed.
