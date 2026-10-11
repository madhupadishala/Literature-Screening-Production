# Nexus Step 4 — Shared PV Agent Integration Baseline

**Status: STARTED — source inventory only, not connected/qualified.**

## Step 3 final verified branch SHA
`6d3d16a11129610cb81b37e9dd0d45394f7caf85`
- Frontend CI [38076969017](https://github.com/madhupadishala/Literature-Screening-Production/actions/runs/38076969017) **SUCCESS**.
- Sprint 3.2 PostgreSQL [38076969012](https://github.com/madhupadishala/Literature-Screening-Production/actions/runs/38076969012) **SUCCESS**.
- Sprint 3.5 PostgreSQL [38076969020](https://github.com/madhupadishala/Literature-Screening-Production/actions/runs/38076969020) **SUCCESS**.
- PV Specialist Integration [38076969007](https://github.com/madhupadishala/Literature-Screening-Production/actions/runs/38076969007) **SUCCESS**.
- Nexus Step 2 Clinical [38076969010](https://github.com/madhupadishala/Literature-Screening-Production/actions/runs/38076969010) **FAILURE**.
- Shared Agent Quality [38076969004](https://github.com/madhupadishala/Literature-Screening-Production/actions/runs/38076969004) **FAILURE**.
- Clinical Rules PostgreSQL [38076969015](https://github.com/madhupadishala/Literature-Screening-Production/actions/runs/38076969015) **FAILURE**.
- Cleanup Baseline [38076969009](https://github.com/madhupadishala/Literature-Screening-Production/actions/runs/38076969009) **FAILURE**.
This is not a platform-wide green release candidate.

## Actual source-level integration inventory
| Layer | Source | Evidence | Current classification |
|---|---|---|---|
| Frontend Literature screening | `frontend/lib/literature/screening/screening-workflow-service.ts` | Imports `@/lib/ai/screening-agent` and `screening-validator`; maintains workflow/package SQL and human review | PRESENT_CODE; no direct specialist-graph invocation observed in inspected service |
| Frontend Medical Review | `frontend/lib/literature/review/review-mutation-service.ts` | Human approval, labeling and causality references | PRESENT_CODE; live specialist adapter not demonstrated |
| Shared safety Intake | `frontend/lib/safety/common/literature-intake-adapter.ts` and `safety-backbone-service.ts` | Versioned Literature export consumption, tenant/client scope | PRESENT_CODE; preserve |
| Backend deterministic Literature workflow | `backend/workflow/literature_workflow.py` | Hits, Screening, IntakeBuilder pipeline; separate from Next.js canonical API state | PRESENT_CODE; do not assume primary production UI |
| Shared PV service | `backend/services/pv_agents/service.py` | Authenticated token scope (tenant/client/workspace), request hash, durable SQLite audit, worker dispatch and reviewer safeguards | INTEGRATION_CANDIDATE; production mounting/credential lifecycle not verified |
| Specialist graph | `backend/services/pv_agents/specialist_graph.py` | Loads consolidated agent source under `nexus_actual_agent_source_consolidation/packages/pv_specialist_core/nexus_pv_agents/nexus_agents`; calls tenant/client-scoped `KnowledgeRouter`; fails closed on unavailable package or knowledge | INTEGRATION_CANDIDATE; independent clinical qualification pending |
| Seriousness specialist | `backend/agents/seriousness_runtime/` | Source package exists | SOURCE_PRESENT; service registration/runtime qualification pending |
| Causality specialist | `backend/agents/causality_runtime/` | Source package exists | SOURCE_PRESENT; registry/runtime qualification pending |
| AE specialist | `backend/agents/event_runtime/` | Source package exists | SOURCE_PRESENT; registry/runtime qualification pending |

## Integration sequence (next)
1. Inventory actual shared service endpoint, registry, specialist call contract, access model and model fallback; select canonical agent source and avoid duplicate implementations.
2. Define typed, versioned Next.js → shared-service adapter for *only* required screening/MR assessments, with tenant/client/workspace, source evidence, knowledge version, provenance, reason and review-required states.
3. Fail closed on missing agent, mismatch, timeout, source validation or uncertain result. No autonomous clinical decision or Intake handoff.
4. Wire feature-gated human-reviewed suggestions at the existing screening/MR boundary, preserving current deterministic decisions. Do not mutate regulated state on failed external requests.
5. Add contract, scope-denial, fallback, provenance, audit, retry/idempotency and end-to-end regression tests; run all impacted CI at one pinned SHA.
6. Defer full live-model clinical acceptance and cross-specialist calibration to the controlled register `docs/agents/step-03-deferred-qualification-register.md`.

**Engineering gate:** A passing adapter test and frontend build is only an engineering claim. A runnable orchestrator, controlled KB, expert evaluation, security UAT and QA authorization are independent requirements.

## Step 4 implementation record — 2026-10-11

### 4.1 Canonical scoped contract — implemented
- `frontend/lib/literature/shared-agents/shared-agent-contract.ts` (commit `7b5f6282`) sets `nexus.pv-agent/1`, supports `drug-role`, `seriousness`, `causality`, `specialist-icsr` as service-known identifiers and checks tenant, client, workspace, case, request, source SHA-256, confidence, source-grounded evidence spans, versioned knowledge, durable audit identity and `route=hitl`, `review_required=true`.
- A response with mismatched scope, unsupported schema, automatic-decision route, ungrounded source evidence or missing governance data is rejected.

### 4.2 Secure Next.js → Python adapter — implemented, disabled by default
- `frontend/lib/literature/shared-agents/shared-agent-service.ts` (commit `fd02da0f`) invokes canonical `POST /v1/agents/{agent}/assess` using a server-only bearer token and a server-authorized workspace scope; request text hash is calculated on the server.
- Explicit `NEXUS_LITERATURE_SHARED_AGENTS_ENABLED=true` required. Only HTTPS endpoints are permitted outside test loopback. 8s timeout, no redirect and no-store; generic fail-closed error, no raw narrative or credentials in errors.
- **Scope caveat:** `client_id` currently maps to authorized `workspaceId` by contract; production use is blocked by a separate explicit mapping-approval switch until this mapping matches KnowledgeRouter/client identifiers.

### 4.3 Human-reviewed Literature integration — opt-in route implemented
- `frontend/app/api/literature/shared-agents/route.ts` (commit `a2e8d5f6`) requires signed selected Nexus Literature workspace and `MEDICAL_REVIEW` permission.
- Accepts only `reviewWorkspaceId` and allowed specialist name; loads selected scoped review record server-side, derives the source narrative from the governed article record, and returns **SUGGESTION_ONLY**, `humanReviewRequired=true`.
- Does **not** update workflow state, label/causality decisions, MR approval, Screening disposition, or Intake handoff. No arbitrary client-provided narrative is forwarded.
- Enabled only when `NEXUS_LITERATURE_SHARED_AGENTS_ENABLED`, `NEXUS_PV_AGENT_DATA_TRANSFER_APPROVED` and `NEXUS_PV_AGENT_CLIENT_MAPPING_CONFIRMED` are all true. These are intentionally unset by default.
- Scope limitation: this is a callable API for authorized reviewers, not an integrated UI review panel or a claim that real clinical workers are live.

### 4.4 Failure, audit and provenance — source behavior implemented
- Unavailable/failed/malformed worker output results in failure, not invented negative clinical evidence.
- The successful request records `LITERATURE_SHARED_AGENT_SUGGESTION` with scoped tenant/client workspace, actor, environment, source hash, agent, knowledge version, request/audit ID; full article text and bearer tokens are not included in that application audit detail.
- Audit database errors prevent returning a success response. Independent backend audit persistence, model outputs and full cross-service correlation remain to be verified in live controlled UAT.

### 4.5 Verification
- `frontend/scripts/verify-step4-shared-agent-contract.ts` (commit `ba0b4d3f`) tests valid contract, swapped tenant/client/workspace/case/input hash, unsupported schema, automatic release, missing knowledge provenance, invalid confidence, and ungrounded evidence.
- `.github/workflows/frontend-ci.yml` (commit `c54c2245`) runs the negative contract test. Literature route source gate includes the new endpoint and tests its RBAC, flags, scope, review-only result and audit presence (`e8fac577`).
- [ClinixAI Frontend Quality Gate run 38109097393](https://github.com/madhupadishala/Literature-Screening-Production/actions/runs/38109097393): **SUCCESS** at code SHA `e8fac577ec3888b33542a0381265d5117131ffbb`, including new source/contract checks and production Next.js build.

### Unfinished, intentionally tracked before clinical use
1. Confirm real backend service address, scoped bearer identity configuration and service-to-service authentication/authorization in UAT.
2. Verify KnowledgeRouter resolves `client_id = workspaceId`, or replace this with an authoritative server-side mapping before enabling.
3. Approve clinical source text transfer/PII handling and trusted service environment; feature flags remain off.
4. Verify actual downstream specialist workers, shared KB source/citation versioning, timeout, retries, user-visible clinical suggestion UI and audit correlation against a real test tenant.
5. Execute end-to-end positive/negative multi-user UAT, blind clinical benchmark and regulated CSV as listed in `step-03-deferred-qualification-register.md`.
6. Fix separately failing platform-wide Step 2/shared agent/clinical rules/cleanup CI before platform release; isolated frontend PASS is not enough.

**Current engineering disposition:** Step 4 adapter, guarded suggestion endpoint and source/contract CI **IMPLEMENTED AND FRONTEND-PASSED**. Live specialist invocation and clinical production qualification **NOT COMPLETE**. No existing Literature decision flow replaced.

## Sprint 4.1 — Canonical contract reconciliation and secure adapter

**Existing canonical implementation discovered after baseline:** `frontend/lib/literature/shared-agents/shared-agent-contract.ts` and `shared-agent-service.ts`, plus frontend CI script `verify-step4-shared-agent-contract.ts`. They already contain `nexus.pv-agent/1`, scoped identity verification, source evidence offsets and audit ID validation, feature flag `NEXUS_LITERATURE_SHARED_AGENTS_ENABLED`, authenticated server-side bearer token, timeout and fail-closed behavior. Do **not** duplicate these contracts.

A redundant adapter and test created during exploration were removed in commits `fd69f767`, `e039a793`. The existing canonical service was hardened to reject service URLs with an unexpected path/query/fragment before constructing the specialist route (`48a5bf7e`, follow-up `c2b0eab3` preserves legitimate private HTTPS ports). Existing Step 4 contract verification now asserts the canonical service remains feature-gated and validates responses (`b05f7e5b`).

**Current engineering disposition:** contract source and origin hardening committed; CI outcome on `b05f7e5b` must be checked before declaring 4.1 passing. No forced activation of workers, no Literature screening mutation, no autonomous acceptance or live specialist invocation. **Next:** trace existing calling sites and safely wire reviewed suggestions only if an actual missing integration is evidenced, with full targeted tests before activation.

## Sprint 4.2 — Scoped Literature invocation (implementation)

New opt-in endpoint: `frontend/app/api/literature/review/shared-agent/route.ts` (commit `d4a40644`).
- POST requires identity, selected Literature workspace and `MEDICAL_REVIEW` permission through the canonical `requireWorkspaceModulePermission`.
- Payload accepts only `reviewWorkspaceId` and a canonical agent name; tenant/client, source and case content **cannot be supplied as authorization context** by the caller.
- DB lookup joins `literature_review_workspaces` to `literature_packages` by tenant, filtering principal tenant, selected client workspace and environment. Missing/unavailable article abstract does not invoke an agent.
- Server-side `proposeSharedAgent` already feature-gated: `NEXUS_LITERATURE_SHARED_AGENTS_ENABLED` must be true, and the bearer token is server-only. External results must match scope, source hash, evidence and audit ID, and require human review.
- Response is explicitly `SUGGESTION_ONLY`, `reviewRequired=true`. No update to Literature review, case or Intake state. The new route was included in the existing Literature route-authorization inventory (`075ef301`).
- `verify-step4-shared-agent-contract.ts` now checks scope and no mutation markers for the route (`38c2e7e4`).

**Release safeguards:** This exposes an optional controlled review suggestion call, not automatic clinical incorporation or production agent activation. Endpoint remains unavailable while feature flag is off. In later Sprint 4.3, assess whether the MR UI should expose a deliberate reviewer action and evidence panel; do not infer readiness from an endpoint alone. Sprint 4.4 must verify audit, failure and retry handling under a real specialist service. Clinical expert acceptance remains deferred per the controlled register.

## Step 4 CI outcome and remaining actions

Current code checkpoint `4123089f5652c1182f08f95fd6708eb7455539fe`: **ClinixAI Frontend Quality Gate SUCCESS**, [run 38116653064](https://github.com/madhupadishala/Literature-Screening-Production/actions/runs/38116653064). This includes canonical Step 4 contract verification, the new read-only scoped route, Literature route-guard inventory, TypeScript/frontend checks and build. The initial run 38116523761 failed a separate stale Product Design CI assertion because `frontend/vercel.json` disables all Git deployments globally rather than per branch; the assertion was corrected in `4123089f` without relaxing the no-auto-deploy policy.

**Completed code scope:** 4.1 canonical contract/adapter review and secure service URL validation; 4.2 feature-gated, scoped, read-only Literature Medical Review suggestion endpoint; Step 4 contract and static route regressions passed on pinned frontend CI. No duplicate specialist agent created.

**Still open:** 4.3 controlled Medical Review UI activation/explicit reviewer workflow and source evidence display; 4.4 local application audit persistence, external-service error/retry and end-to-end cross-service provenance verification; 4.5 live integration and UAT/clinical expert qualification, as well as unrelated platform-wide failing gates. Backend service has a durable specialist audit contract, but this does not establish local application audit persistence. A proposed local audit-write modification was not committed. Existing feature flag remains OFF by default. No production deployment or autonomous clinical decision is claimed.
