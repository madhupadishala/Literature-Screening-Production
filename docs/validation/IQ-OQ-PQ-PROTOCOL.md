# IQ / OQ / PQ-UAT Protocol — ClinixAI Literature Screening Production

This protocol is an execution template. Execution, observation, evidence attachment, deviation handling, and approval must be performed by authorized personnel.

## IQ — Installation Qualification

Record PASS/FAIL, evidence reference, executor, date, and comments for each item.

| ID | Verification |
|---|---|
| IQ-01 | Approved build SHA matches deployed production build. |
| IQ-02 | Production database connection is successful and points to the approved tenant environment. |
| IQ-03 | Required database schema/tables/constraints/indexes are present. |
| IQ-04 | Required environment variables/secrets are configured without exposing secret values. |
| IQ-05 | AI provider, evidence storage, database and required dependencies pass health probes. |
| IQ-06 | RBAC roles and system scheduler identity are available and least-privileged. |
| IQ-07 | Audit trail and reliability snapshot persistence are operational. |
| IQ-08 | Search Profile, Literature Calendar, Product Master, Label/RSI and Causality Method lifecycle controls are available. |

## OQ — Operational Qualification

| ID | Scenario | Expected result |
|---|---|---|
| OQ-01 | Authorized scheduled production search | Search executes from active Calendar + Search Profile and creates Search Evidence Package. |
| OQ-02 | Zero-hit scheduled search | Execution is recorded with 0 results and still produces governed evidence. |
| OQ-03 | Missed/late scheduled search | Catch-up or MISSED behavior follows configured grace/catch-up rules and creates an alert. |
| OQ-04 | Hits processing | AI output cannot bypass human Hits review. |
| OQ-05 | Screening INCLUDE | Company Product Master / COI logic is governed; unresolved conditions do not become false positives. |
| OQ-06 | Screening EXCLUDE/REVIEW | Workflow transitions are correct and auditable. |
| OQ-07 | Multi-patient extraction | Patients remain independently segmented. |
| OQ-08 | Explicit relation integrity | Intake contains only explicit patient-product-event relations from assessments; no Cartesian pairing. |
| OQ-09 | Expectedness | Active applicable Label/RSI drives expectedness; unresolved applicability stays unresolved. |
| OQ-10 | Causality | Only approved configured causality conclusions are accepted. |
| OQ-11 | Medical Review | Intake remains blocked until governed MR completion. |
| OQ-12 | Intake integrity | Generated JSON hash and source-lineage hash verify; multi-patient candidate ledger matches payload. |
| OQ-13 | Unauthorized action | RBAC denies action and records the security/audit event where applicable. |
| OQ-14 | AI/provider failure | Failure is surfaced; workflow is not silently advanced. |
| OQ-15 | Database/transient operational failure | Failure is observable through reliability/audit controls and recoverable without duplicate processing. |
| OQ-16 | Tenant isolation | Cross-tenant read/write attempts are rejected. |
| OQ-17 | Validation-only references | Validation-only Label/RSI/causality records cannot be used by ordinary production cases. |
| OQ-18 | System validation package | Automated failed control yields BLOCKED and cannot receive approval sign-off. |

## PQ / UAT — Performance Qualification

Execute with representative users, roles, volumes, source profiles, products, expected/unexpected events, single-patient, multi-patient, zero-patient, duplicate, and negative cases.

Acceptance requires:
- intended-use workflow completed without unauthorized bypass;
- user-facing decisions are understandable and traceable;
- required evidence can be retrieved;
- operational latency/capacity is acceptable for agreed workload;
- no unresolved Critical reliability finding;
- deviations are closed or formally accepted by Quality;
- business/PV and Quality representatives approve UAT.

## Evidence record

For every test capture:
- environment;
- build SHA;
- tenant;
- test data identifier;
- executor and role;
- execution date/time;
- expected result;
- actual result;
- PASS/FAIL;
- screenshot/log/database evidence reference;
- deviation/CAPA reference when applicable.
