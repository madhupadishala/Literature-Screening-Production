# Sprint 3.2 — Search, Hits and Screening | initial source assessment

**Status:** STARTED — targeted code inspection, not yet qualified.

## Requirement scope
URS-LIT-010–020: strategies and source governance; URS-LIT-030–032: deduplication; URS-LIT-040–044: screening and review. Applicable FRS-LIT-004–010. Scope also checks article/source provenance and tenant filtering.

## Reviewed code evidence
| Component | Source | Observed | Disposition |
|---|---|---|---|
| Query strategy execution | `frontend/lib/literature/search/search-strategy-engine.ts` | Builds groups and PubMed queries, carries tenantId in result, stores tenant-filtered transient history | PRESENT_CODE; production/validation purpose and strategy audit semantics NOT VERIFIED |
| Hits human review | `frontend/lib/literature/hits/hits-review-repository.ts` | Requires package/result IDs, validates review status/comments and expected version; worklist SQL filters by principal tenant | PRESENT_CODE; DB race safety and full transitions NOT VERIFIED |
| Hits retry | `frontend/app/api/literature/hits/retry/route.ts` | Requires Literature permission `HITS_SUBMIT` and delegates retry to service | PRESENT_CODE; repeat-retry deduplication NOT VERIFIED |
| Screening service | `frontend/lib/literature/screening/screening-workflow-service.ts` | Tenant-filtered SQL, distinguishes INCLUDE/EXCLUDE/REVIEW and result version, links Hits/Screening/Intake metadata, tracks evidence and AI execution | PRESENT_CODE; full safety outcome/transition checks NOT VERIFIED |
| Screening API | `frontend/app/api/literature/screening/route.ts` | Uses separate SEARCH_HISTORY_VIEW, SCREENING_EXECUTE and SCREENING_REVIEW scoped permissions | PRESENT_CODE, runtime negative cases NOT VERIFIED |
| Existing verification scripts | `frontend/scripts/verify-governed-screening.ts`, `frontend/scripts/verify-cleanup-sprint4-literature.ts` | Existing controlled checks identified in project | TEST_CODE_PRESENT; execution NOT RUN |

## First engineering finding
The source-level review does **not** establish that the working Search → Hits → Screening flow is broken. Do not replace existing architecture. Investigate search execution purpose capture, unsuccessful connector accounting and duplicate/idempotent retry behavior via the existing services. Any confirmed discrepancy must carry a URS/FRS reference, failing reproduction and targeted patch.

## Sprint 3.2 exit gates
- Search strategy, ad hoc versus regulated production execution and source outcomes traced.
- Stable article/PMID, duplicate grouping, idempotent Hits retry behavior traced.
- Hits and Screening human review transitions, data ownership, audit and error scenarios characterized.
- Existing regression and security verification results attached to exact commit (no assumed PASS).
- Defects corrected only if confirmed; user-approved working flows unchanged.

**This report starts engineering reconciliation only. No source modifications or live agent qualification are claimed.**
