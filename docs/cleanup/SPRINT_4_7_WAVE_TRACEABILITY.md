# Cleanup Sprints 4–7 Wave Traceability

Document ID: CLEANUP-WAVE-4-7-001  
Branch: `cleanup/zero-deviation-baseline-20260930`  
Status: QUALIFICATION IN PROGRESS

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
| Legacy regression | screening/review/PV scripts | CI qualification required |

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
| Existing revision/QC/MR/finalization behavior retained | existing Case Processing services and Nexus regression scripts | QUALIFICATION REQUIRED |
| Immutable final version/evidence hashes | existing finalization/release services | IMPLEMENTED / regression required |
| Benchmark | `BENCHMARK_CASE_PROCESSING.md` | IMPLEMENTED |
| URS | `URS_CASE_PROCESSING.md` | IMPLEMENTED |
| FRS | `FRS_CASE_PROCESSING.md` | IMPLEMENTED |
| User Guide | `USER_GUIDE_CASE_PROCESSING.md` | IMPLEMENTED |
| Executable qualification | `cleanup:sprint6:verify` | CI qualification required |

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
| Executable qualification | `cleanup:sprint7:verify` | CI qualification required |

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
| CodeRabbit | Current-head re-review required before wave closure. |
| Hacker Gate | resource-level workspace IDOR controls implemented; executable static/security gates required to pass. |
| Evidence Gate | blocking CI + benchmark artifacts required for exact final head. |
| Regulatory Knowledge Gate | regulatory retrieval governance strengthened; production source approval remains controlled. |
| Modular & Benchmark Completeness | all four wave modules have benchmark/URS/FRS/User Guide; real external Submissions adapter is separately qualified. |

## Residual controlled work

1. Legacy Safety/Literature handoff rows with no workspace/environment mapping require controlled production migration mapping and reconciliation.
2. Real regulator/partner submission adapters require credentials, conformance testing, validation and production approval.
3. Warning-level code/architecture debt identified by baseline tools remains visible and moves to later cleanup phases; it is not silently deleted.
4. Vercel quota/build-rate status is an external deployment quota and is not used as application-code qualification evidence for this source-only wave.
