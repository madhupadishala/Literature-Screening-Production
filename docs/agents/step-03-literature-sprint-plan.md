# Nexus Step 3 — Literature URS/FRS reconciliation sprint plan

**Status:** Sprint 3.1 IN PROGRESS. Existing Literature behavior is the baseline; do not rebuild it based on an unverified gap. Live specialist AI integration is scheduled for the later consolidated agentic AI acceptance phase, not a Step 3 coding blocker.

**Controlled documents:** `docs/requirements/URS/URS_LITERATURE_SCREENING.md` (URS-LIT-001 through 110, applicable IDs); `docs/requirements/FRS/FRS_LITERATURE_SCREENING.md` (FRS-LIT-001 through 022).

**Baseline implementation examined:** `backend/workflow/literature_workflow.py`, `backend/workflow/state_manager.py`, `frontend/app`, `frontend/lib/literature`. Existing `frontend/scripts/verify-cleanup-sprint4-literature.ts`, `verify-governed-screening.ts`, `verify-intake-input-governance.ts`, `verify-nexus-security-boundaries.ts` must be reused where applicable.

## Engineering governance
- Each sprint produces a requirement-to-implementation matrix with exact source paths, verification reference, observed outcome, deviation ID, cause, correction and change impact. Unknown is **NOT VERIFIED**, not **FAILED** or **MISSING**.
- Pre-existing user-confirmed Hits → Screening → MR → Intake success is a baseline claim; it must not be contradicted without current counterevidence. The local Python `LiteratureWorkflow` has Hits, Screening and Intake stages, but is not necessarily the UI application state machine.
- Implement code fixes only for a demonstrated deviation. Preserve article disposition, MR/QC, source evidence, product matching, deduplication and intended client workflows.
- Incomplete shared specialist agents or unfinished Neon clinical policy activation belong to Step 2 / consolidated live evaluation, not a Step 3 blocking dependency.
- Standard statuses: NOT_REVIEWED, PRESENT_CODE, VERIFIED_PASS, VERIFIED_FAIL, GAP_CONFIRMED, FIX_COMMITTED, DEFERRED_SHARED_AGENT.
- Exit from each sprint requires required evidence, revision SHA and gate outcome; no implied production deployment.

| Sprint | Scope and URS | Concrete deliverables | Exit gate |
|---|---|---|---|
| **3.1 — Baseline and URS traceability** | All URS-LIT/FRS-LIT, especially 100–105 | Inventory real Literature pages, API handlers, MR/QC decision services, routes, existing workflow; link URS↔FRS↔code↔test in matrix; characterize existing success claim | Every URS/FRS has one traceability row, with UNKNOWN if not inspected; no invented gaps |
| **3.2 — Search, Hits and Screening** | URS 010–044, FRS 004–010 | Verify governed queries, source routing, duplicates, Hits/Screening states, human review, retry semantics and existing screening governance | Existing verification scripts + targeted checks, with preserved decision meaning |
| **3.3 — Medical Review, QC and assessment handoff** | URS 060–066 and 106–110, FRS 012–016, 021–022 | Identify authoritative MR state machine, reviewer permissions, QC handoffs, evidence, overrides and immutable finalization; preserve shared seriousness/listedness/causality contracts without forcing unavailable agents live | MR/QC route and transition evidence; no unreviewed auto-handoff |
| **3.4 — Literature → Intake contract** | URS 050–053, 070–073 and 080–082, FRS 011, 017–018 | Trace the real positive case candidate payload from article to Intake, source IDs/PMID, MR disposition, client/tenant scope, version, idempotency and model/evidence metadata | Existing intake input governance tests + negative handoff tests; no fake new pipeline |
| **3.5 — Identity, tenancy and audit hardening** | URS 001–006, 017, 022–026, 063, 090–093; FRS 001–003, 007–008, 015, 019 | Confirm protected routes, actor/client authorization, cross-workspace denials, audit trail and non-editable finalized records; fix evidenced defects only | Tenant/client leakage tests and RBAC/denial evidence |
| **3.6 — Consolidation and engineering qualification** | URS 100–105, FRS 020 | Regenerate traceability, resolve evidenced deviations, run applicable verification scripts, compile/build, record reproducible commit, exact PASS/FAIL/NOT_RUN | No unresolved material code/security deviations in Step 3 scope; deferred live agent run clearly separated |

## Sprint 3.1 preliminary source-evidenced inventory
| Requirement | Examined evidence | Current classification | Rationale |
|---|---|---|---|
| URS-LIT-040–042 | `backend/workflow/literature_workflow.py` | PRESENT_CODE | Hits and screening orchestrators are explicitly invoked; the inspected worker alone does not establish human review permissions |
| URS-LIT-070–073 | `backend/workflow/literature_workflow.py`, `backend/api/run_screening_package.py` | PRESENT_CODE | Intake payload generation exists; canonical UI/API authorization and MR prerequisite remain to be traced |
| URS-LIT-063–066 | `frontend/app/review`, `frontend/lib/review` identified as directories | NOT_REVIEWED | Directory presence is not proof of a reviewed MR decision path |
| URS-LIT-001–005 | `frontend/lib/auth`, `frontend/lib/rbac` identified | NOT_REVIEWED | Actual handlers and server-side guard calls must be inspected |
| URS-LIT-050–053 | `frontend/lib/evidence` identified | NOT_REVIEWED | Presence is not proof of search evidence package semantics |
| URS-LIT-109–110 | Shared service contract requirements in URS/FRS | DEFERRED_SHARED_AGENT | Integrate specialists in consolidated phase; current Literature module can continue existing safe operation |
| URS-LIT-100–105 | `frontend/scripts/verify-cleanup-sprint4-literature.ts` etc. identified | NOT_REVIEWED | Need executable outputs from exact commit, not mere script names |

## Deliverable boundaries
- Sprint 3.1 is not closed by this plan; complete the line-by-line traceability matrix before claiming it.
- Step 3 closure does not certify the unresolved Step 2 clinical rules or production release.
- Correct terminology: **existing implementation requiring reconciliation**, not 'missing workflow' unless demonstrated.
