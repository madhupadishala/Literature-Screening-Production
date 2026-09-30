# Cleanup Sprints 4–7 Wave Traceability

Document ID: CLEANUP-WAVE-4-7-001  
Branch: `cleanup/zero-deviation-baseline-20260930`  
Status: TECHNICAL QUALIFICATION COMPLETE; CODERABBIT FULL REVIEW PENDING

## Scope

- Sprint 4 — Literature Screening reconciliation.
- Sprint 5 — Intake & Triage reconciliation.
- Sprint 6 — Case Processing / L2A reconciliation.
- Sprint 7 — canonical Submissions foundation.

## Sprint 4 — Literature Screening

| Control | Evidence | Status |
|---|---|---|
| Canonical workspace/module authorization | Literature API route reconciliation + `cleanup:sprint4:verify` | IMPLEMENTED |
| Tenant-scoped workflow status | `getStatusForTenant` | IMPLEMENTED |
| Detailed benchmark | `BENCHMARK_LITERATURE_SCREENING.md` | IMPLEMENTED |
| URS/FRS/User Guide | controlled Sprint 4 documents | IMPLEMENTED |
| Legacy regression | screening/review/PV scripts | VERIFIED — exact-head quality gate passed |

## Sprint 5 — Intake & Triage

| Control | Evidence | Status |
|---|---|---|
| Canonical workspace/module authorization | Intake API routes | IMPLEMENTED |
| Persisted workspace/environment ownership | migration 034 + Safety backbone | IMPLEMENTED for new/reconciled records |
| Resource-level same-tenant cross-workspace IDOR control | `assertSafetyIntakeInScope` on parameterized routes | IMPLEMENTED |
| Scoped worklist / source creation | Safety backbone service | IMPLEMENTED |
| Literature→Intake scoped handoff | workspace-bound `intake_input_exports` | IMPLEMENTED |
| Benchmark/URS/FRS/User Guide | controlled Sprint 5 set | IMPLEMENTED |
| Legacy rows | no automatic workspace guessing | TRANSITIONAL — controlled migration required before production cutover |

## Sprint 6 — Case Processing / L2A

| Control | Evidence | Status |
|---|---|---|
| Case workspace/environment ownership | migration 034 + case creation | IMPLEMENTED |
| Case worklist scope | tenant+workspace+environment query | IMPLEMENTED |
| Same-tenant cross-workspace case IDOR control | `assertSafetyCaseInScope` across parameterized case routes | IMPLEMENTED |
| Case creation from same-scope qualified Intake | `safety-case-service.ts` | IMPLEMENTED |
| Existing revision/QC/MR/finalization behavior retained | existing Case Processing services and Nexus regression scripts | VERIFIED — Nexus Sprint 8–10 + cleanup Sprint 6 passed |
| Immutable final version/evidence hashes | existing finalization/release services | VERIFIED by regression/cleanup qualification |
| Benchmark | `BENCHMARK_CASE_PROCESSING.md` | IMPLEMENTED |
| URS | `URS_CASE_PROCESSING.md` | IMPLEMENTED |
| FRS | `FRS_CASE_PROCESSING.md` | IMPLEMENTED |
| User Guide | `USER_GUIDE_CASE_PROCESSING.md` | IMPLEMENTED |
| Executable qualification | `cleanup:sprint6:verify` | VERIFIED |

## Sprint 7 — Submissions foundation

| Control | Evidence | Status |
|---|---|---|
| Dedicated module permission surface | submission view/create/transmit/ack permissions | IMPLEMENTED |
| Scoped package/attempt/ACK persistence | migration 035 | IMPLEMENTED |
| Finalized-case-only source | `loadFinalCaseForSubmission` | IMPLEMENTED |
| Deterministic package/source hashes | `canonicalSha256` + stored hashes | IMPLEMENTED |
| Scoped idempotency | package unique key + service reuse | IMPLEMENTED |
| Transport separation | `SubmissionTransportAdapter` | IMPLEMENTED |
| No configured adapter | controlled FAILED attempt / no simulated success | IMPLEMENTED |
| Transmission attempt history | `nexus_submission_attempts` | IMPLEMENTED |
| ACK-aware lifecycle | `nexus_submission_acknowledgements` | IMPLEMENTED |
| Actual regulator/partner connectivity | no production adapter activated | NOT CLAIMED / EXTERNAL QUALIFICATION REQUIRED |
| Benchmark | `BENCHMARK_SUBMISSIONS.md` | IMPLEMENTED |
| URS | `URS_SUBMISSIONS.md` | IMPLEMENTED |
| FRS | `FRS_SUBMISSIONS.md` | IMPLEMENTED |
| User Guide | `USER_GUIDE_SUBMISSIONS.md` | IMPLEMENTED |
| Executable qualification | `cleanup:sprint7:verify` | VERIFIED |

## Security findings closed in this wave

The wave also remediates CodeRabbit findings raised while Sprints 4–5 were in progress:

- checkout credentials are not persisted by CI checkout;
- incremental Gitleaks outcome is captured and a final secret-scan gate enforces incremental/full-history/working-tree success;
- secret-scan disposition reflects clean qualified evidence;
- Intake benchmark external claims are reproducibly sourced and dated;
- Literature workflow status is tenant-scoped;
- Sprint 4 structural verifier uses scoped interface parsing;
- regulatory provenance verifier checks exact structures;
- current regulatory vector retrieval requires APPROVED + EFFECTIVE + effective-date qualification and excludes superseded records by default;
- legacy regulatory vector migration is explicitly controlled rather than auto-approved.

## Nine-gate qualification

| Gate | Current state |
|---|---|
| Karpathy | Additive, scoped changes; no wholesale rewrite. |
| Ponytail | Existing services reused; Submissions adds only missing canonical foundation. |
| Architecture Guardian | workspace ownership moved into persistence/service boundary; module guards remain canonical. |
| Warpath | Literature→Intake→Case→Submission-ready lifecycle covered; external transport intentionally fail-closed without adapter. |
| CodeRabbit | Full exact-head review requested after technical qualification; wave closure remains pending until material findings are cleared. |
| Hacker Gate | VERIFIED for current wave scope — nested Intake/Case resource scope assertions, scoped Submissions DB FKs and security-boundary tests passed. |
| Evidence Gate | VERIFIED technically on exact head; quality and benchmark workflows passed. |
| Regulatory Knowledge Gate | regulatory retrieval governance strengthened; production source approval remains controlled. |
| Modular & Benchmark Completeness | all four wave modules have benchmark/URS/FRS/User Guide; real external Submissions adapter is separately qualified. |

## Residual controlled work

1. Legacy Safety/Literature handoff rows with no workspace/environment mapping require controlled production migration mapping and reconciliation.
2. Real regulator/partner submission adapters require credentials, conformance testing, validation and production approval.
3. Warning-level code/architecture debt identified by baseline tools remains visible and moves to later cleanup phases; it is not silently deleted.
4. Vercel quota/build-rate status is an external deployment quota and is not used as application-code qualification evidence for this source-only wave.


## Exact-head qualification evidence

Qualified technical head before this evidence-record update: `d246ced95502b15e5a15e5341c46333e5f4fc63f`

- Frontend Quality Gate run: `36694661547` — **PASS**
- Cleanup Baseline Benchmark run: `36694661467` — **PASS**
- Architecture dependency blocking errors: **0**
- Dependency audit: **0 vulnerabilities**
- Lint blocking errors: **0**
- Legacy Nexus Sprints 1–10: **PASS**
- Nexus tenant integrity / identity-workspace / security-boundary verification: **PASS**
- Regulatory knowledge foundation + provenance/retrieval-governance verification: **PASS**
- Cleanup Sprint 4 Literature reconciliation: **PASS**
- Cleanup Sprint 5 Intake reconciliation: **PASS**
- Cleanup Sprint 6 Case Processing reconciliation: **PASS**
- Cleanup Sprint 7 Submissions foundation: **PASS**
- Production Next.js build: **PASS**
- Baseline secret scans: incremental/full-history/governed working tree **PASS**
- Known non-blocking debt remains visible: Knip unused-file candidates and dependency-cruiser warning-level debt are not silently deleted or promoted to green.

### Current benchmark observations

On benchmark run `36694661467`:
- dependency vulnerabilities: **0**;
- ESLint: **0 errors / 9 warnings**;
- Knip: **149 potential unused files**, requiring classification before deletion;
- circular dependencies: **0**;
- dependency-cruiser: **0 blocking errors / 64 warning-level findings** across 667 modules and 1,734 dependencies;
- incremental/full-history/governed-working-tree Gitleaks: **PASS / no leaks found**;
- regulatory knowledge provenance/retrieval governance: **PASS**;
- Sprint 4 Literature reconciliation: **PASS**;
- Sprint 5 Intake reconciliation: **PASS**;
- Sprint 6 Case Processing reconciliation: **PASS**;
- Sprint 7 Submissions foundation: **PASS**;
- production Next.js compilation/type checking: **PASS**.

These values are evidence, not cleanup targets to manipulate. Warning/dead-code candidates remain visible until separately characterized and remediated.

### Sprint 4 qualification result

Literature routes, including the legacy `/api/workflow/run` surface, use canonical workspace/module authorization. Workflow status is tenant-scoped and no global status read remains in the qualified endpoint.

### Sprint 5 qualification result

Parameterized Intake child-resource routes perform persisted tenant/workspace/environment ownership checks before nested resource access. Cross-module Intake→Case authorization remains constrained to the selected workspace/environment.

### Sprint 6 qualification result

Parameterized Case routes enforce persisted workspace/environment ownership. Migration 034 exposes scoped composite identities for downstream integrity, while legacy rows remain unmapped until controlled production migration.

### Sprint 7 qualification result

Submission packages are built only from authoritative finalized case versions in the selected scope. Database constraints bind package→case, package→case-version, attempt→package and acknowledgement→package identities to the governed scope. Missing external transport fails closed; no real regulator connectivity is claimed.

### Regulatory retrieval qualification result

Current governed regulatory retrieval requires approved/effective/date-eligible material and excludes superseded material by default. Historical superseded retrieval requires an explicit `asOf`. Legacy vectors missing governance metadata are excluded and must be rebuilt from controlled approved source versions rather than auto-approved.

### Remaining closure condition

Technical qualification does not by itself close the wave. The CodeRabbit gate remains open until a full review of this exact changeset produces no unresolved material findings.


## Post-review hardening incorporated

The current wave head also includes fixes made after independent review and CI feedback:
- account lockout increment made concurrency-safe;
- context/session lifetime binding and malformed selector validation;
- module-scoped custom permission enforcement;
- exact workspace handling for denied-access auditing;
- Literature tenant-key consistency;
- Intake resource-scope assertions and redundant guard cleanup;
- Submissions idempotency conflict checks, finite transport timeout, stale transmission recovery and acknowledgement-state conflict controls;
- generic knowledge retrieval prevented from bypassing regulatory lifecycle controls;
- regulator provenance propagated into chunk/vector metadata;
- GitHub Actions pinned and dependency-cruiser controlled through the locked development dependency tree;
- build/type errors in later foundation modules corrected without altering Sprint 4–7 behavior.

## Formal closure rule

Sprints 4–7 shall not be marked fully closed until:
1. CI is green on the final evidence/documentation head;
2. CodeRabbit reviews that final head and no material finding remains unresolved;
3. all nine gates remain satisfied or explicitly non-applicable under the governing rule;
4. external regulator transport connectivity remains **not claimed** until separately credentialed and validated.
