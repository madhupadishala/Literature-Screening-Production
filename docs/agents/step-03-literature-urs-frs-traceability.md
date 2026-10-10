# Sprint 3.1 — Literature URS/FRS baseline traceability

**Assessment:** Source inventory only. NO tests executed in this matrix. Exact URS requirements and FRS mapping are taken from the repository documents. Candidate paths are navigation targets, not proof of correct behavior.

**Evidence:** `docs/requirements/URS/URS_LITERATURE_SCREENING.md`, `docs/requirements/FRS/FRS_LITERATURE_SCREENING.md`; inspected `backend/workflow/literature_workflow.py`, `backend/workflow/state_manager.py`; directory inventory of `frontend/app/api/literature`, `frontend/lib/literature`, `frontend/app/review`.

## Every URS requirement

| URS ID | FRS trace | Code candidate / inspected source | Current assessment | Rationale |
|---|---|---|---|---|
| URS-LIT-001 | FRS-LIT-001 | `frontend/app/api/literature/**; frontend/lib/auth/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-002 | FRS-LIT-001 | `frontend/app/api/literature/**; frontend/lib/auth/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-003 | FRS-LIT-001, FRS-LIT-002 | `frontend/app/api/literature/**; frontend/lib/auth/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-004 | FRS-LIT-001 | `frontend/app/api/literature/**; frontend/lib/auth/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-005 | FRS-LIT-001, FRS-LIT-002 | `frontend/app/api/literature/**; frontend/lib/auth/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-006 | FRS-LIT-001, FRS-LIT-003 | `frontend/app/api/literature/**; frontend/lib/auth/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-010 | FRS-LIT-004 | `frontend/lib/literature/search/**; frontend/lib/literature/scheduler/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-011 | FRS-LIT-004 | `frontend/lib/literature/search/**; frontend/lib/literature/scheduler/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-012 | FRS-LIT-004, FRS-LIT-005 | `frontend/lib/literature/search/**; frontend/lib/literature/scheduler/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-013 | FRS-LIT-004 | `frontend/lib/literature/search/**; frontend/lib/literature/scheduler/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-014 | FRS-LIT-004, FRS-LIT-006 | `frontend/lib/literature/search/**; frontend/lib/literature/scheduler/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-015 | FRS-LIT-004, FRS-LIT-006 | `frontend/lib/literature/search/**; frontend/lib/literature/scheduler/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-016 | FRS-LIT-004, FRS-LIT-006 | `frontend/lib/literature/search/**; frontend/lib/literature/scheduler/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-017 | FRS-LIT-004, FRS-LIT-006 | `frontend/lib/literature/search/**; frontend/lib/literature/scheduler/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-018 | FRS-LIT-004, FRS-LIT-006 | `frontend/lib/literature/search/**; frontend/lib/literature/scheduler/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-019 | FRS-LIT-004, FRS-LIT-007 | `frontend/lib/literature/search/**; frontend/lib/literature/scheduler/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-020 | FRS-LIT-004, FRS-LIT-007 | `frontend/lib/literature/search/**; frontend/lib/literature/scheduler/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-021 | FRS-LIT-008 | `frontend/lib/literature/article-fetch/**; frontend/lib/literature/document-processing/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-022 | FRS-LIT-003, FRS-LIT-008 | `frontend/lib/literature/article-fetch/**; frontend/lib/literature/document-processing/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-023 | FRS-LIT-003, FRS-LIT-008 | `frontend/lib/literature/article-fetch/**; frontend/lib/literature/document-processing/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-024 | FRS-LIT-003, FRS-LIT-008 | `frontend/lib/literature/article-fetch/**; frontend/lib/literature/document-processing/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-025 | FRS-LIT-003, FRS-LIT-008 | `frontend/lib/literature/article-fetch/**; frontend/lib/literature/document-processing/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-026 | FRS-LIT-003, FRS-LIT-008 | `frontend/lib/literature/article-fetch/**; frontend/lib/literature/document-processing/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-030 | FRS-LIT-009 | `frontend/lib/literature/duplicates/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-031 | FRS-LIT-009 | `frontend/lib/literature/duplicates/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-032 | FRS-LIT-009 | `frontend/lib/literature/duplicates/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-040 | FRS-LIT-010 | `frontend/app/api/literature/{hits,screening}/**; backend/workflow/literature_workflow.py` | PRESENT_CODE | Reviewed Python worker contains relevant Hits/Screening or intake-payload call; full URS behavior not verified |
| URS-LIT-041 | FRS-LIT-010 | `frontend/app/api/literature/{hits,screening}/**; backend/workflow/literature_workflow.py` | PRESENT_CODE | Reviewed Python worker contains relevant Hits/Screening or intake-payload call; full URS behavior not verified |
| URS-LIT-042 | FRS-LIT-010 | `frontend/app/api/literature/{hits,screening}/**; backend/workflow/literature_workflow.py` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-043 | FRS-LIT-010 | `frontend/app/api/literature/{hits,screening}/**; backend/workflow/literature_workflow.py` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-044 | FRS-LIT-010 | `frontend/app/api/literature/{hits,screening}/**; backend/workflow/literature_workflow.py` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-050 | FRS-LIT-011 | `frontend/lib/literature/evidence-normalization/**; frontend/app/api/literature/evidence-normalization/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-051 | FRS-LIT-011 | `frontend/lib/literature/evidence-normalization/**; frontend/app/api/literature/evidence-normalization/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-052 | FRS-LIT-011 | `frontend/lib/literature/evidence-normalization/**; frontend/app/api/literature/evidence-normalization/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-053 | FRS-LIT-011 | `frontend/lib/literature/evidence-normalization/**; frontend/app/api/literature/evidence-normalization/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-060 | FRS-LIT-012 | `frontend/app/api/literature/review/**; frontend/lib/literature/review/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-061 | FRS-LIT-013 | `frontend/app/api/literature/review/**; frontend/lib/literature/review/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-062 | FRS-LIT-014 | `frontend/app/api/literature/review/**; frontend/lib/literature/review/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-063 | FRS-LIT-015 | `frontend/app/api/literature/review/**; frontend/lib/literature/review/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-064 | FRS-LIT-015, FRS-LIT-016 | `frontend/app/api/literature/review/**; frontend/lib/literature/review/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-065 | FRS-LIT-015 | `frontend/app/api/literature/review/**; frontend/lib/literature/review/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-066 | FRS-LIT-015 | `frontend/app/api/literature/review/**; frontend/lib/literature/review/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-070 | FRS-LIT-017 | `frontend/app/api/literature/intake-input/**; backend/workflow/literature_workflow.py` | PRESENT_CODE | Reviewed Python worker contains relevant Hits/Screening or intake-payload call; full URS behavior not verified |
| URS-LIT-071 | FRS-LIT-017 | `frontend/app/api/literature/intake-input/**; backend/workflow/literature_workflow.py` | PRESENT_CODE | Reviewed Python worker contains relevant Hits/Screening or intake-payload call; full URS behavior not verified |
| URS-LIT-072 | FRS-LIT-017 | `frontend/app/api/literature/intake-input/**; backend/workflow/literature_workflow.py` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-073 | FRS-LIT-017 | `frontend/app/api/literature/intake-input/**; backend/workflow/literature_workflow.py` | PRESENT_CODE | Reviewed Python worker contains relevant Hits/Screening or intake-payload call; full URS behavior not verified |
| URS-LIT-080 | FRS-LIT-018 | `frontend/lib/literature/screening/**; frontend/lib/literature/review/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-081 | FRS-LIT-018 | `frontend/lib/literature/screening/**; frontend/lib/literature/review/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-082 | FRS-LIT-018 | `frontend/lib/literature/screening/**; frontend/lib/literature/review/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-090 | FRS-LIT-019 | `frontend/app/api/literature/**; frontend/lib/auth/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-091 | FRS-LIT-019 | `frontend/app/api/literature/**; frontend/lib/auth/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-092 | FRS-LIT-019 | `frontend/app/api/literature/**; frontend/lib/auth/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-093 | FRS-LIT-019 | `frontend/app/api/literature/**; frontend/lib/auth/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-100 | FRS-LIT-020 | `frontend/scripts/verify-cleanup-sprint4-literature.ts` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-101 | FRS-LIT-020 | `frontend/scripts/verify-cleanup-sprint4-literature.ts` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-102 | FRS-LIT-020 | `frontend/scripts/verify-cleanup-sprint4-literature.ts` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-103 | FRS-LIT-020 | `frontend/scripts/verify-cleanup-sprint4-literature.ts` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-104 | FRS-LIT-020 | `frontend/scripts/verify-cleanup-sprint4-literature.ts` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-105 | FRS-LIT-020 | `frontend/scripts/verify-cleanup-sprint4-literature.ts` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-106 | FRS-LIT-021 | `frontend/app/literature/**; frontend/lib/literature/review/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-107 | FRS-LIT-021 | `frontend/app/literature/**; frontend/lib/literature/review/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-108 | FRS-LIT-021 | `frontend/app/literature/**; frontend/lib/literature/review/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-109 | FRS-LIT-022 | `frontend/app/literature/**; frontend/lib/literature/review/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |
| URS-LIT-110 | FRS-LIT-022 | `frontend/app/literature/**; frontend/lib/literature/review/**` | NOT_VERIFIED | Candidate modules identified; runtime, security and evidence outcome not inspected |

## Every FRS requirement

| FRS ID | Linked URS in FRS | Verification reference | Status |
|---|---|---|---|
| FRS-LIT-001 | URS-LIT-001–006 | VER-LIT-WORKSPACE-ROUTES | NOT_VERIFIED |
| FRS-LIT-002 | URS-LIT-003,005 | VER-LIT-TENANT-SELECTOR | NOT_VERIFIED |
| FRS-LIT-003 | URS-LIT-006,022–026 | VER-LIT-HISTORY-ISOLATION | NOT_VERIFIED |
| FRS-LIT-004 | URS-LIT-010–020 | existing screening/scheduler characterization | NOT_VERIFIED |
| FRS-LIT-005 | URS-LIT-012 | search evidence verification | NOT_VERIFIED |
| FRS-LIT-006 | URS-LIT-014–018 | search repository/evidence verification | NOT_VERIFIED |
| FRS-LIT-007 | URS-LIT-019–020 | VER-LIT-WORKSPACE-ROUTES | NOT_VERIFIED |
| FRS-LIT-008 | URS-LIT-021–026 | VER-LIT-HISTORY-ISOLATION | NOT_VERIFIED |
| FRS-LIT-009 | URS-LIT-030–032 | duplicate verification | NOT_VERIFIED |
| FRS-LIT-010 | URS-LIT-040–044 | route/security verification | NOT_VERIFIED |
| FRS-LIT-011 | URS-LIT-050–053 | evidence package verification | NOT_VERIFIED |
| FRS-LIT-012 | URS-LIT-060 | review verification | NOT_VERIFIED |
| FRS-LIT-013 | URS-LIT-061 | labeling verification | NOT_VERIFIED |
| FRS-LIT-014 | URS-LIT-062 | causality verification | NOT_VERIFIED |
| FRS-LIT-015 | URS-LIT-063–066 | review/MR verification | NOT_VERIFIED |
| FRS-LIT-016 | URS-LIT-064 | state-transition negative tests | NOT_VERIFIED |
| FRS-LIT-017 | URS-LIT-070–073 | contract tests | NOT_VERIFIED |
| FRS-LIT-018 | URS-LIT-080–082 | AI provenance/eval tests | NOT_VERIFIED |
| FRS-LIT-019 | URS-LIT-090–093 | audit/evidence verification | NOT_VERIFIED |
| FRS-LIT-020 | URS-LIT-100–105 | VER-LIT-SPRINT4-GATE | NOT_VERIFIED |
| FRS-LIT-021 | URS-LIT-106–108 | navigation/UI verification | NOT_VERIFIED |
| FRS-LIT-022 | URS-LIT-109–110 | architecture/service-contract review | NOT_VERIFIED |

## Observations and rationale

- Existing Python worker explicitly calls Hits and Screening orchestrators then produces Intake payload for screening rows with `Proceed to Intake`. This proves code presence, **not** mandatory MR authorization or production handoff behavior.
- The Python local `PackageStatus` enumeration covers Hits, Screening and Intake file creation; it must not be mistaken for the authoritative UI/API medical-review state machine.
- Separate `frontend/app/api/literature/review` and `frontend/lib/literature/review` directories exist, so missing MR functionality is **not established**.
- Existing literature verification scripts exist, but no PASS claim is made without execution evidence on a pinned revision.
- User-confirmed prior Hits → Screening → MR → Intake success remains historical baseline evidence, not re-verified current behavior.
- Shared specialist agent availability, and the 35 draft clinical rules in Neon, are handled later without blocking inventory completion.

## Sprint 3.1 exit

This file supplies complete documented URS/FRS row coverage. File-level route and handler inventory, exact code references and existing test mappings should be expanded before marking the *full* Sprint 3.1 characterization gate closed. No confirmed defect or security pass inferred from this matrix.
