# Sprint 3.6 — Consolidation and engineering qualification

**Status: STARTED — existing CI inventory and deferred register established. NOT an approved full qualification.**

## Scope
URS-LIT-100–105 and FRS-LIT-020. Consolidate Sprint 3.1–3.5 evidence, identify unresolved deviations, verify build, tests, migrations and security evidence at exact commit. Separate in-repository engineering gates from live application UAT, clinical agent qualification, and regulatory approval.

## Evidence baseline from last inspected code HEAD before this record
Commit `463c822a6c4432a5999823060cd7f7087ede06b3`.

| Gate | GitHub run | Result |
|---|---|---|
| ClinixAI Frontend Quality Gate | [38074615915](https://github.com/madhupadishala/Literature-Screening-Production/actions/runs/38074615915) | PASS |
| Literature Sprint 3.2 PostgreSQL Concurrency | [38074615950](https://github.com/madhupadishala/Literature-Screening-Production/actions/runs/38074615950) | PASS (isolated DB) |
| Literature Sprint 3.5 Security PostgreSQL | [38074615910](https://github.com/madhupadishala/Literature-Screening-Production/actions/runs/38074615910) | PASS (isolated DB) |
| PV Specialist Agent Integration | [38074615889](https://github.com/madhupadishala/Literature-Screening-Production/actions/runs/38074615889) | PASS |
| Nexus Step 2 Shared Clinical Engineering | [38074615914](https://github.com/madhupadishala/Literature-Screening-Production/actions/runs/38074615914) | FAIL |
| Shared PV Agent Quality Gate | [38074615896](https://github.com/madhupadishala/Literature-Screening-Production/actions/runs/38074615896) | FAIL |
| Nexus Clinical Rules PostgreSQL Gate | [38074615900](https://github.com/madhupadishala/Literature-Screening-Production/actions/runs/38074615900) | FAIL |
| Cleanup Baseline Benchmark | [38074615920](https://github.com/madhupadishala/Literature-Screening-Production/actions/runs/38074615920) | FAIL |

Each run predates this documentation-only commit. New code/test changes require rerunning their affected gates.

## Consolidation deliverables
- Existing sprint records: `docs/agents/step-03-literature-sprint-plan.md`, `step-03-sprint-3.2-search-hits-screening.md`, `step-03-sprint-3.3-medical-review-qc.md`, `step-03-sprint-3.4-intake-handoff.md`, `step-03-sprint-3.5-security-audit.md`.
- Detailed independently schedulable backlog: `docs/agents/step-03-deferred-qualification-register.md`. Covers items from baseline Sprint 3.1 through security UAT, full end-to-end tests, shared agent clinical acceptance and regulated release.
- Tests in repository: `frontend/scripts/verify-step3-2-source-contracts.ts`, `verify-step3-2-postgres.sql`, `verify-step3-2-parallel-claim.sh`, `verify-step3-5-postgres.sql`, `verify-step3-5-http.mjs`, `verify-cleanup-sprint4-literature.ts`, `verify-intake-input-governance.ts`, `verify-nexus-security-boundaries.ts`.
- No new changes to currently working Hits → Screening → MR → Intake clinical workflow in this sprint baseline.

## Engineering closure conditions
1. URS/FRS final traceability inventory and exact evidence per requirement, without inventing a PASS for unknowns.
2. Relevant source, build, migration and isolated-db gates passing for pinned release-candidate SHA.
3. Identify remaining security/material defects versus blocked external UAT work; escalate any material issue before declaring an engineering PASS.
4. All failures in adjacent/shared platform gates either repaired or retained as explicit open release blockers.
5. Clinical and regulatory release signoffs remain separate. An engineering evidence package does not waive UAT, GxP CSV, clinical review or deployment verification.

**Disposition:** Sprint 3.6 consolidation *started*, evidence inventory and pending register committed. Full engineering and clinical qualification **not yet completed**. Leadership selects the timing of deferred validation, but cannot claim release sign-off before gates complete.

## Requirement traceability reconciliation — current engineering stage

Controlled source baseline: `docs/requirements/URS/URS_LITERATURE_SCREENING.md` at blob `2d17b896`, and `docs/requirements/FRS/FRS_LITERATURE_SCREENING.md` at blob `50b7fa91`.

**86 unique controlled requirement rows identified: 64 URS and 22 FRS**, each present in `docs/agents/step-03-requirements-traceability.csv`. Each row identifies a relevant implementation or evidence family, prior verification script, assessment state, linked deferred register IDs and explicit qualification caveat. This is comprehensive *inventory mapping*, not 86 independently executed pass results. The final pairwise URS↔FRS review, requirement-specific acceptance tests and QA approval remain **D01**.

### Deviations reconciled from Sprints 3.2–3.5
| Deviation | Corrective evidence | Engineering disposition | Outstanding |
|---|---|---|---|
| Search connector failure not structured | `aea74dff` | FIX_COMMITTED; CI source contracts passed previously | Real provider failure and retry D02–03 |
| Duplicate simultaneous failed-Hits retry | `2b388d4e`, isolated concurrency CI 38074615950 | ISOLATED_PASS | Production service replay and worker recovery D03 |
| Completed MR could be saved again | `a1bb3152`, frontend CI 38062206548 | SOURCE_FIX_PASS | Controlled amendment design and reviewer UAT D06–07 |
| Screening could reopen completed workflow | `79ff9e8e`, row lock `e9a0d2e3` | SOURCE_FIX_PASS | Multi-actor state race D07 |
| Intake consumer lacked schema/identity/approved-review checks | `8b973e26`, frontend CI 38063574503 | SOURCE_FIX_PASS | Full scoped import and tamper tests D08–09 |
| Review list/update could span client workspaces inside tenant | `744484c7`, `c1627e5c`, DB gate 38074615910 | ISOLATED_PASS | Live two-client access and audited denial D10–14 |
| Application denied-access audit | Source best effort, isolated test rows | PARTIAL — not qualified | App-originated audit persistence D12 |
| Transient in-memory history workspace filtering | Scope of existing source inventory | NOT VERIFIED | D04 |
| Four failing adjacent CI gates | Runs 38074615914, 38074615896, 38074615900, 38074615920 | OPEN_PLATFORM_FAILURE | D16 |

No confirmed code-level finding is silently waived. The presence of passing Literature-scoped CI is not equivalent to platform-wide release approval.

### Release-candidate evidence interpretation
At time of this document update, the only **verified passing baseline** is the last inspected SHA `463c822a`, with frontend and dedicated 3.2/3.5 PostgreSQL gates passing. Subsequent commits are documentation and workflow changes and **must not inherit a pass label without checking current SHA CI**. A true release candidate requires the full relevant gate set on a single pinned SHA and a reproducible artifact. See D15–16. No regulated release qualification is represented here.
