# FRS — Case Processing Reconciliation

Document ID: FRS-CASE-001  
Version: 1.0-draft  
Linked URS: URS-CASE-001

| FRS ID | Linked URS | Functional requirement / verification |
|---|---|---|
| FRS-CASE-001 | URS-CASE-001–004 | Migration 034 shall persist workspace_id/environment on Safety roots and preserve legacy rows as unmapped until controlled migration. |
| FRS-CASE-002 | URS-CASE-002–003,026–027 | Every parameterized case route shall use requireWorkspaceModulePermission and assertSafetyCaseInScope before operating on the requested case. |
| FRS-CASE-003 | URS-CASE-005–006 | Case creation shall select the upstream intake by tenant+workspace+environment+id and reuse only a case in the same scope. |
| FRS-CASE-004 | URS-CASE-002,005 | New safety_cases rows shall persist tenant_id, workspace_id and environment from the server-authorized principal. |
| FRS-CASE-005 | URS-CASE-007 | listCaseWorklist shall filter by tenant_id+workspace_id+environment. |
| FRS-CASE-006 | URS-CASE-008 | Assignment shall require CASE_ASSIGN; parent case ownership shall already be verified. |
| FRS-CASE-007 | URS-CASE-009–010 | Draft service shall keep immutable revision rows and reject in-place edit of finalized/closed states. |
| FRS-CASE-008 | URS-CASE-011–013 | Draft validation shall require patient/reporter/product/event stable keys and receipt/event chronology. |
| FRS-CASE-009 | URS-CASE-014 | Assessment persistence shall store product/event, assessment type, result, rationale, evidence and assessment version. |
| FRS-CASE-010 | URS-CASE-015–016 | Narrative records shall use controlled stages and preserve system-vs-human provenance. |
| FRS-CASE-011 | URS-CASE-017–020 | Processor/QC/MR operations shall use explicit service transitions and distinct permissions. |
| FRS-CASE-012 | URS-CASE-021–022 | Finalization shall require CASE_FINALIZE and produce/reference the authoritative final case version. |
| FRS-CASE-013 | URS-CASE-023–025 | Evidence package generation shall bind caseVersionId, caseSha256, source lineage and packageSha256. |
| FRS-CASE-014 | URS-CASE-024–025 | Exports shall derive from the finalized version and retain content hash/version metadata. |
| FRS-CASE-015 | URS-CASE-028 | Material create/review/finalize/evidence actions shall be attributable in audit data with scoped context. |
| FRS-CASE-016 | URS-CASE-029 | cleanup:sprint6:verify shall enumerate case routes and fail when canonical guard or resource-scope assertion is absent. |
| FRS-CASE-017 | URS-CASE-030 | Existing nexus:sprint8/9/10 and PV regression checks remain mandatory compatibility evidence. |
| FRS-CASE-018 | URS-CASE-031–032 | CASE_PROCESSING remains entitlement-independent; downstream Submissions consumes finalized canonical case data rather than private mutable drafts. |
| FRS-CASE-019 | URS-CASE-033 | Migration 034 shall be registered and shall not be applied to production without mapping/rehearsal/rollback evidence. |
| FRS-CASE-020 | URS-CASE-034 | Blocking CI shall run architecture, security, legacy regression and cleanup Sprint 6 verification. |

## Security negative cases

Required tests include:
- same-tenant / different-workspace case identifier;
- different environment identifier;
- disabled workspace/module entitlement;
- insufficient module role;
- direct finalized-case mutation;
- invalid state transition;
- forged/stale scoped context;
- export/evidence request against an out-of-scope case.

## Production migration rule

Existing rows with NULL workspace_id/environment are not production-authorized through the new scoped path. They require controlled source-to-workspace mapping, migration rehearsal, reconciliation counts, rollback evidence and approval before production cutover.

## Case workspace tab architecture

| FRS ID | Linked URS | Functional requirement / verification |
|---|---|---|
| FRS-CASE-021 | URS-CASE-035 | The Case Workspace shall expose the controlled Tabs General, Patient, Products, Events, Safety Assessment, Narrative, Action Items, Additional Information, Evidence & Export, and Audit & Versions. |
| FRS-CASE-022 | URS-CASE-036 | Safety Assessment shall use shared seriousness, listedness/expectedness and causality service contracts and persist governed assessment provenance/version/evidence. |
| FRS-CASE-023 | URS-CASE-037 | Action Items shall present existing QC/MR/query/finalization operations without weakening service-layer permissions, state-transition checks or audit controls. |
| FRS-CASE-024 | URS-CASE-038–039 | Supporting information, evidence/export and audit/version views shall remain logically separated from primary editable case data and shall preserve existing finalization immutability rules. |
