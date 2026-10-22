# Case worklist and Render verification — 17 October 2026

## Worklist implementation

- Loading: `Loading / Synchronizing cases...`; metric counts remain unavailable until a successful response.
- Filtered zero results: `Zero cases match current filters` with a 32px `Clear Filters` action.
- Empty workspace: `Worklist empty (No pending cases in workspace)`, including when a filter is entered into an already empty worklist.
- Failed or malformed responses remain errors rather than being presented as empty worklists.
- Search controls are 32px; table rows are 36px; identifiers and explicit UTC timestamps use monospace styling. Flat surfaces retain crisp neutral borders.
- A verified scope change aborts the previous request and reloads cases for the new tenant/workspace/environment/module scope.

## Shared context contract

`frontend/lib/nexus/workspace-context-contract.ts` owns the flat response type and runtime validator. The current-context API uses `satisfies WorkspaceContextResponse`; the context provider and session-continuation check use the same validator. Module and environment values use the canonical union types. Missing identity/scope fields, lowercase module names, unknown environments, and missing active-module entitlements cannot produce a ready state.

## Render configuration observed

- Service: `nexus-pv-specialists-staging` (`srv-db5o1a7lk1mc73all2gg`).
- Live deploy: `dep-db9b3btg1s2s7381tpj0`.
- Commit: `aea5dec423200fa6ebf3849df9770d6532951401`.
- Tracked branch: `integration/nexus-27-agents-kb-execution-20261015`.
- Auto deploy: disabled.
- Provider `healthCheckPath`: empty. The infrastructure probe is **not explicitly pinned to `/healthz`**. The existing safe root liveness alias remains implemented.
- This worklist/context release does not modify Python runtime files; Render's source hash differs from the newer frontend releases.

## Fresh HTTP verification

```text
2026-10-17T04:45:31Z GET /healthz 200
{"service":"nexus-pv-agents","state":"disabled"}

2026-10-17T04:45:40Z GET /readyz 200
{"service":"nexus-pv-agents","ready":true,"clinical_execution_enabled":false}
```

Render application logs independently contain the corresponding two GET requests with HTTP 200. Worker startup logs at 04:45:25–27 UTC report:

```text
staging_acceptance route=inventory http_status=200 passed=true slots=27 executed=0 audit_present=true
staging_acceptance route=dispatch http_status=200 passed=true slots=27 executed=13 audit_present=true
staging_acceptance route=invalid_bearer http_status=401 passed=true slots=na executed=na audit_present=false
staging_acceptance route=missing_bearer http_status=401 passed=true slots=na executed=na audit_present=false
```

These are synthetic startup checks, not clinical execution qualification.

## Vector verification limits

The Render workspace lists one Python service and no separate vector service. `/readyz` checks the Postgres audit table and service-token scope configuration; it does not probe vector connectivity, embedding generation, indexing, collection contents, or retrieval. A green readiness response therefore cannot establish healthy semantic retrieval.

Source inspection finds multiple vector implementations: in-memory frontend stores (one uses mock embeddings), a Qdrant knowledge client, and a Python persistent Chroma retriever. Their presence in source does not identify the live configured provider or prove connectivity. The frontend vector dependency probe requires `VECTOR_HEALTH_URL` or configured local/provider settings; it can report degraded when connectivity cannot be verified.

Live vector connectivity remains unverified. The browser health-dashboard check was rejected by automatic approval review because its review quota was exhausted. No browser-policy bypass or credential extraction was attempted. The connected Render tools expose no read-environment or service-settings update operation, so the explicit health path was not changed and no secret values were inspected.

## Local validation

- TypeScript: passed.
- Targeted ESLint: passed.
- Auth/context integration suite: 23 passed, including the actual current-context route and shared runtime contract.
- Clean optimized Next.js production build: passed.
- Chromium fixture suite: passed at 1920, 1280, 768 and 390px; covers loading metrics, filtered and workspace-empty messages, Clear Filters behavior, 32px search/action controls, compact rows, monospace UTC timestamps, module switching, and context error recovery.
- The Chromium suite uses synthetic local responses; it is not a claim that live vector retrieval was tested.
