# URS — Case Processing Reconciliation

Document ID: URS-CASE-001  
Version: 1.0-draft  
Status: Cleanup Sprint 6 controlled draft  
Benchmark: BENCH-CASE-001

## Purpose

Define user requirements for workspace-scoped L2A / ICSR case processing while preserving the characterized existing PV workflow.

| ID | User requirement |
|---|---|
| URS-CASE-001 | Case Processing shall require authenticated identity, selected tenant, client workspace, environment and CASE_PROCESSING entitlement. |
| URS-CASE-002 | Every case shall belong to exactly one tenant, client workspace and environment for operational authorization. |
| URS-CASE-003 | A case identifier from another workspace/environment shall fail closed even when the requester belongs to the same tenant. |
| URS-CASE-004 | Legacy tenant-only cases shall not be guessed into a workspace; migration shall be controlled and evidenced. |
| URS-CASE-005 | Case creation shall require a qualified intake record in the same tenant/workspace/environment. |
| URS-CASE-006 | Repeated case creation for the same scoped intake shall be idempotent. |
| URS-CASE-007 | The case worklist shall return only cases owned by the selected workspace/environment. |
| URS-CASE-008 | Assignment shall require controlled permission and retain attribution/reason. |
| URS-CASE-009 | Case drafts shall be revisioned and changes shall require a reason. |
| URS-CASE-010 | Finalized/closed cases shall not be edited in place. |
| URS-CASE-011 | Patient, reporter, product, event and test structures shall retain stable keys and basic data-integrity rules. |
| URS-CASE-012 | Receipt-date chronology shall be validated. |
| URS-CASE-013 | Event chronology shall be validated. |
| URS-CASE-014 | Product-event assessments shall support controlled assessment types and rationale/evidence. |
| URS-CASE-015 | Narrative generation shall distinguish system draft from human processor/QC/medical/final narrative states. |
| URS-CASE-016 | AI/system suggestions shall remain distinguishable from human decisions. |
| URS-CASE-017 | Processor submission to QC shall be an explicit state transition. |
| URS-CASE-018 | QC approval/return/query/comment shall be attributable and permission-controlled. |
| URS-CASE-019 | Medical Review approval/return/query/comment shall be attributable and permission-controlled. |
| URS-CASE-020 | Workflow-state bypass shall fail closed. |
| URS-CASE-021 | Finalization shall require configured finalization checks and CASE_FINALIZE permission. |
| URS-CASE-022 | Finalization shall create/use an immutable authoritative case version. |
| URS-CASE-023 | Evidence packages shall include source lineage, final case hash and relevant workflow history. |
| URS-CASE-024 | Case exports shall be reproducible from the authoritative finalized version. |
| URS-CASE-025 | Evidence/export hashes shall support tamper detection. |
| URS-CASE-026 | Authorization shall be re-evaluated server-side on every protected request. |
| URS-CASE-027 | Case APIs shall not rely on browser-provided workspace identifiers as authority. |
| URS-CASE-028 | Audit evidence shall include tenant/workspace/environment/module/actor/action/outcome/timestamp where applicable. |
| URS-CASE-029 | Cross-workspace IDOR/BOLA tests shall be executable CI evidence. |
| URS-CASE-030 | Existing characterized L2A/QC/MR/finalization behavior shall not be silently changed during reconciliation. |
| URS-CASE-031 | The module shall remain independently entitleable and shall accept canonical qualified upstream data without requiring the Intake UI entitlement. |
| URS-CASE-032 | A finalized case shall expose a stable canonical downstream contract for Submissions. |
| URS-CASE-033 | Database migrations shall be additive; production application requires rehearsal and legacy-row mapping evidence. |
| URS-CASE-034 | TypeScript, lint, architecture, dependency-security, regression, CodeRabbit and Hacker gates shall pass before qualification. |

## Acceptance

Sprint 6 may be qualified only when all nine governing gates are green and objective evidence exists for the exact commit. A failed applicable gate cannot be waived into green; an approved exception/non-applicable disposition must remain visibly non-green or N/A according to governance.

## Case workspace tab architecture and shared safety assessment requirements

| ID | User requirement |
|---|---|
| URS-CASE-035 | The Case Workspace Screen shall organize processing through the Tabs General, Patient, Products, Events, Safety Assessment, Narrative, Action Items, Additional Information, Evidence & Export, and Audit & Versions. |
| URS-CASE-036 | Safety Assessment shall provide access to Seriousness, Listedness/Expectedness and Causality through shared governed safety-assessment services. |
| URS-CASE-037 | Action Items shall consolidate processor/QC/medical-review actions, queries and governed finalization actions without changing their underlying permission or audit requirements. |
| URS-CASE-038 | Additional Information shall group supporting reporter, medical-history, laboratory, source-document and other non-primary case information without becoming an uncontrolled data category. |
| URS-CASE-039 | Evidence & Export and Audit & Versions shall remain distinct from editable case-data Tabs. |
