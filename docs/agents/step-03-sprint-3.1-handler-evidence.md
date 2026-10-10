# Sprint 3.1 — Handler-level baseline evidence and engineering disposition

**Reference:** integration/pv-agents-source-20261009; source baseline reviewed October 10, 2026.
**Assessment type:** code inspection and contract mapping; no runtime assertion is claimed.

## Evidence reviewed

| Concern | Concrete source and blob SHA | Directly observed | Decision |
|---|---|---|---|
| Medical Review access | `frontend/app/api/literature/review/medical/route.ts` @ `e71c525fab2bf70d8650e8c0bfbf6d86a51853cf` | POST invokes `requireWorkspaceModulePermission` with `NEXUS_MODULES.LITERATURE` and `PERMISSIONS.MEDICAL_REVIEW`; invokes `saveMedicalReview` | PRESENT_CODE; live RBAC negative cases unverified |
| Screening access | `frontend/app/api/literature/screening/route.ts` @ `a0580ac6c81270e5685433076d0c343dffce57fa` | GET uses `SEARCH_HISTORY_VIEW`; POST execute uses `SCREENING_EXECUTE`; POST review uses `SCREENING_REVIEW`; each invokes shared workspace module guard | PRESENT_CODE; end-to-end status unverified |
| Hits review | `frontend/app/api/literature/hits/review/route.ts` @ `528278857c53a2dc73beea8c4719716a2036f9ef` | POST requires `HITS_SUBMIT` and routes to `saveHitsReview` | PRESENT_CODE |
| Intake generation access | `frontend/app/api/literature/intake-input/route.ts` @ `92c718922e32e14f4c79b0c76413f115533197e8` | POST requires `INTAKE_INPUT_GENERATE` | PRESENT_CODE |
| Intake eligibility | `frontend/lib/literature/intake-input/intake-input-governance.ts` @ `79c3b125bec478d11ef2c3a8bb225184c27622c0` | Requires `REVIEW_COMPLETE` or existing `INTAKE_INPUT_CREATED` workflow state, approved/INCLUDE screening, approved/accept_ai Hits review, eligible company suspect, completed patient segmentation and review workspace, allowed labeling/causality state, and APPROVED MR | PRESENT_CODE; runtime enforcement by service requires separate verification |
| Review worklist | `frontend/lib/literature/review/review-workflow-service.ts` @ `3043affb374ba2a9768ce9cdde49eacec61952a4` | Tenant-filtered database query; only approved INCLUDE screening rows populate review worklist | PRESENT_CODE; no claim of complete tenancy proof |
| Existing verification | `frontend/scripts/verify-cleanup-sprint4-literature.ts` @ `cb568ed77098f70d9ed5c0c215876c9d7309cb5c` | Source-based assertions enumerate Literature workspace routes, legacy tenant selectors, tenant-scoped services, three Screening permissions, and controlled-doc presence | TEST_CODE_PRESENT; NO CURRENT EXECUTION RESULT |
| Auxiliary Python workflow | `backend/workflow/literature_workflow.py` @ `2495f84f4869dccda3d52bb0181f44007a18ba7f` | Hits, Screening and conditional Intake JSON package creation; Python state file does not model the frontend MR state | PRESENT_CODE; not evidence of missing frontend MR |

## Traceability references

- URS-LIT-001–006 / FRS-LIT-001–003: shared workspace module guard and scoped tenant controls
- URS-LIT-040–044 / FRS-LIT-010: segregated Hits and Screening execution/review
- URS-LIT-060–066 / FRS-LIT-015–016: MR role and review state
- URS-LIT-070–073 / FRS-LIT-017: canonical intake generation and source-linked handoff
- URS-LIT-100–105 / FRS-LIT-020: existing behavior preservation and verification
- Full requirement inventory (64 URS, 22 FRS) is maintained in `step-03-literature-urs-frs-traceability.md`.

## Deviations and next gated work

**No confirmed behavior regression identified from the inspected code.** This is not equivalent to all requirements passing.

- **3.2:** search/hits/screening actual behavior, queries, retries and deduplication
- **3.3:** MR/QC workflow transition and review persistence
- **3.4:** review-to-intake source provenance/idempotence and service-level governance
- **3.5:** negative tenant/client RBAC and audit verification
- **3.6:** actual current-commit CI/build execution, reproducibility, independent review

**Sprint 3.1 engineering inventory disposition:** CODE BASELINE EVIDENCE COMPLETE for scoped handlers, with 64/64 URS and 22/22 FRS inventory coverage. It does not certify the full URS, pass security gates, or claim live agent tests.
