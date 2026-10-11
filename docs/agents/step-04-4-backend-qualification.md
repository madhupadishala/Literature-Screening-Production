# Nexus Step 4.4 — Backend Qualification Evidence

**Disposition:** Engineering contract hardening committed. **Live authenticated staging qualification NOT COMPLETE**. No clinical autonomy or feature activation authorized.

## Baseline / integration contract
- Canonical UI: `frontend/app/review/page.tsx` invokes reviewer-only `frontend/app/api/literature/review/shared-agent/route.ts`.
- Three separate switches are required on Next.js: `NEXUS_LITERATURE_SHARED_AGENTS_ENABLED`, `NEXUS_PV_AGENT_DATA_TRANSFER_APPROVED`, `NEXUS_PV_AGENT_CLIENT_MAPPING_CONFIRMED`. They stay disabled until independently approved. The client-visible panel also requires `NEXT_PUBLIC_NEXUS_LITERATURE_SHARED_AGENTS_ENABLED`.
- The Next.js server sends its scoped bearer token to `POST /v1/agents/{agent}/assess`. End-user tokens are not forwarded.
- Backend scope is `tenant_id + client_id + workspace_id`. The current Next.js adapter equates client ID with the authorized workspace ID; live enabling is **prohibited** until a documented mapping review validates this.
- Worker responses must be human-review-only, source-offset-grounded, version-tagged, and audited.

## Implemented engineering controls
1. `backend/services/pv_agents/service.py`: fail at startup on empty/malformed service token scopes; reject mismatched tenant, client, workspace, input hash, oversized narrative, invalid evidence spans and incomplete seriousness results.
2. `tests/test_pv_agent_service_step44.py`: offline positive and negative scoped service tests, controlled mocked seriousness dispatch, durable SQLite audit persistence, duplicate ID conflict, invalid result handling and audit-failure denial.
3. `backend/services/pv_agents/specialist_graph.py`: explicitly reject citations labeled for a different tenant or client; retain existing KnowledgeRouter tenant/client and rule/product matching.
4. `tests/test_specialist_graph_contract.py`: cross-tenant/cross-client citations denied; same-client and GLOBAL citation scopes accepted.
5. `frontend/app/api/literature/review/shared-agent/route.ts`: transfer/mapping approval checks and success audit write; audit failure cannot return successful advice. Separate deterministic clinical decisions remain untouched.
6. CI: `.github/workflows/pv-agent-integration.yml` runs the new backend test alongside other specialist contract checks; frontend Step 4 verification asserts transfer approval and audited route.

## Evidence classification
- **Mock worker / local-persistence tests:** engineering contract evidence only; do not claim clinical accuracy or provider readiness.
- **Real staging service-to-service test:** not established here: actual service URL, real scoped token registration, verified client mapping and approved source transfer are required.
- **Real KnowledgeRouter evidence:** actual approved source revision/citations and tenant-specific retrieval must be tested on authorized staging data.
- **Provider-backed seriousness/causality runtime:** registered-worker preflight, exact configured model, external provider behavior, controlled incident/dechallenge scenarios and failure handling need staging acceptance.
- **End-to-end audit correlation:** verify durable external audit storage survives restarts and that its ID matches the Next.js application audit event; SQLite-path configuration alone is not proof.
- **Release gate:** final-head impacted CI must pass; independent PV expert evaluation, security UAT and QA authorization remain mandatory before clinical use.

## Required live acceptance evidence (blocking)
- Approved staging base URL and non-production scoped service token; two intentionally isolated tenants/clients with authorized user accounts.
- Signed approval for source-text transfer/PII policy and explicit KnowledgeRouter client mapping.
- Successful plus denied HTTP requests through Next.js and hosted Python service (401, 403, invalid payload, missing worker, timeout, audit outage, replay/duplicate).
- Approved knowledge documents, actual versioned citations, client switching with no leakage.
- Actual specialist execution evidence, request correlation, backend durability/restart test, deployment identity and model provenance.
- Final CI SHA, run links and independent sign-off. Until these exist, keep all production toggles disabled.
