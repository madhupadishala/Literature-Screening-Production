# FRS — Literature Screening Module

Document ID: FRS-LIT-001  
Version: 1.0-draft  
Status: Sprint 4 controlled draft  
Linked URS: URS-LIT-001

## Functional requirements

| FRS ID | Linked URS | Functional requirement | Verification |
|---|---|---|---|
| FRS-LIT-001 | URS-LIT-001–006 | Every Literature route shall use the canonical workspace module guard for NEXUS_MODULES.LITERATURE and a controlled permission. | VER-LIT-WORKSPACE-ROUTES |
| FRS-LIT-002 | URS-LIT-003,005 | Legacy payload tenant selectors, when present, shall match the already-authorized scoped tenant and shall never grant authority. | VER-LIT-TENANT-SELECTOR |
| FRS-LIT-003 | URS-LIT-006,022–026 | Transient histories shall retain tenant ownership and expose tenant-filtered list/status methods. | VER-LIT-HISTORY-ISOLATION |
| FRS-LIT-004 | URS-LIT-010–020 | Search strategy, ad hoc and scheduled execution shall preserve query normalization, source enablement, execution-purpose and connector-outcome behavior. | existing screening/scheduler characterization |
| FRS-LIT-005 | URS-LIT-012 | executionPurpose shall distinguish TEST_VALIDATION from regulated production execution and be carried into audit/evidence. | search evidence verification |
| FRS-LIT-006 | URS-LIT-014–018 | Search executions shall persist normalized criteria, selected sources, translated queries, result counts, connector errors, start/completion timestamps and stable result identity. | search repository/evidence verification |
| FRS-LIT-007 | URS-LIT-019–020 | Global/local source routing shall derive tenant authority from the scoped principal; production flow shall not rely on hard-coded demo tenant authority. | VER-LIT-WORKSPACE-ROUTES |
| FRS-LIT-008 | URS-LIT-021–026 | Article fetch, OCR, translation, PubMed, evidence normalization, strategy and workflow history shall expose only the current tenant's records. | VER-LIT-HISTORY-ISOLATION |
| FRS-LIT-009 | URS-LIT-030–032 | Duplicate grouping shall preserve deterministic dedupe/source identity and controlled duplicate workflow state. | duplicate verification |
| FRS-LIT-010 | URS-LIT-040–044 | Screening execute/review endpoints shall require SCREENING_EXECUTE and SCREENING_REVIEW respectively and shall use the scoped Literature principal. | route/security verification |
| FRS-LIT-011 | URS-LIT-050–053 | Search Evidence Package creation shall remain mandatory for every search execution according to LF-021 semantics. Validation-only and handoff-with-validation shall remain distinct. | evidence package verification |
| FRS-LIT-012 | URS-LIT-060 | Patient extraction and segmentation shall retain source evidence and bounded patient-segment semantics. | review verification |
| FRS-LIT-013 | URS-LIT-061 | Expectedness conclusions other than unresolved shall require active governed Label/RSI key, version and effective date matching governed product/market context. | labeling verification |
| FRS-LIT-014 | URS-LIT-062 | Causality conclusions requiring a method shall require an active approved causality method key/version and allowed conclusion. | causality verification |
| FRS-LIT-015 | URS-LIT-063–066 | Medical Review shall require MEDICAL_REVIEW permission, validate prerequisite review state, and record decision, comments and reason. | review/MR verification |
| FRS-LIT-016 | URS-LIT-064 | Review mutation services shall reject editing a completed review workspace unless a separately governed amendment workflow exists. | state-transition negative tests |
| FRS-LIT-017 | URS-LIT-070–073 | Literature-to-downstream handoff shall use canonical generated payload/package contracts; downstream modules shall not read private Literature tables as an integration mechanism. | contract tests |
| FRS-LIT-018 | URS-LIT-080–082 | AI-assisted output affecting regulated workflow shall retain model/policy/source provenance and shall not silently bypass required human review. | AI provenance/eval tests |
| FRS-LIT-019 | URS-LIT-090–093 | Audit/evidence records shall include actor, tenant, workspace, environment, module, action, outcome and timestamp where applicable. | audit/evidence verification |
| FRS-LIT-020 | URS-LIT-100–105 | Sprint 4 CI shall execute Literature reconciliation verification plus existing PV/screening/scheduler/intake regressions, security gates, architecture gates and production build. | VER-LIT-SPRINT4-GATE |

## Route permission profile

| Route family | Minimum permission |
|---|---|
| Search, ad hoc, PubMed, global-source, search-strategy and workflow execute | SEARCH_EXECUTE |
| Search/list/history utility endpoints | SEARCH_HISTORY_VIEW |
| Evidence and OCR normalization creation | EVIDENCE_CREATE |
| Hits retry/review | HITS_SUBMIT |
| Screening execute | SCREENING_EXECUTE |
| Screening review | SCREENING_REVIEW |
| Review read | REVIEW_VIEW |
| Patient, label, causality and translation mutation | REVIEW_EDIT |
| Medical Review | MEDICAL_REVIEW |
| Intake payload generation | INTAKE_INPUT_GENERATE |
| Intake payload download | INTAKE_INPUT_DOWNLOAD |

## Security failure behavior

- Missing identity session -> 401.
- Missing or invalid scoped context -> 403.
- Wrong module context -> 403.
- Tenant mismatch in legacy payload -> 403.
- Disabled tenant, workspace, module or role -> 403.
- Malformed business payload -> controlled 400.
- Server or database failure -> controlled 5xx without internal secret or SQL disclosure.

## No-behavior-change constraint

Workspace authorization reconciliation shall not alter search query meaning, deduplication semantics, patient extraction meaning, expectedness or causality rules, Medical Review decision semantics or canonical handoff content except where a separately approved requirement explicitly changes them.
