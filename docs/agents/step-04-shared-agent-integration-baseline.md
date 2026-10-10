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
