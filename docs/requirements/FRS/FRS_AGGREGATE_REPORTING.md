# FRS — Aggregate Reporting

Document ID: FRS-AGG-001  
Version: 1.0-draft  
Linked URS: URS-AGG-001

| FRS ID | Linked URS | Functional requirement |
|---|---|---|
| FRS-AGG-001 | URS-AGG-001–003 | All routes shall use requireWorkspaceModulePermission with NEXUS_MODULES.AGGREGATE_REPORTING. |
| FRS-AGG-002 | URS-AGG-004–008 | createAggregateReport shall query only FINALIZED/SUBMITTED/CLOSED cases in tenant+workspace+environment and reporting period, using final_version_id. |
| FRS-AGG-003 | URS-AGG-007–008 | Source snapshot shall retain case IDs, version IDs and SHA-256 values and itself receive canonical SHA-256. |
| FRS-AGG-004 | URS-AGG-010–013 | nexus_aggregate_report_versions shall append numbered versions with content hash, reason, state, actor and timestamp. |
| FRS-AGG-005 | URS-AGG-011 | Service shall reject new versions after parent status FINALIZED. |
| FRS-AGG-006 | URS-AGG-012 | AGGREGATE_REVIEW shall govern review versions; APPROVED/FINALIZED versions shall require AGGREGATE_APPROVE. |
| FRS-AGG-007 | URS-AGG-020–022 | Report type is controlled metadata only; regulator-specific rendering/calculation remains separately validated. |
| FRS-AGG-008 | URS-AGG-030 | No hard entitlement dependency on Intake/Literature shall be introduced. |
| FRS-AGG-009 | URS-AGG-040 | Static and executable verification shall inspect scope filtering, final-version source selection, hashes and permission separation. |
| FRS-AGG-010 | URS-AGG-041 | cleanup:sprint9:verify and normal CI/security/regression gates shall block qualification on failure. |

## API surface

- GET/POST `/api/aggregate-reports`
- GET `/api/aggregate-reports/{reportId}`
- POST `/api/aggregate-reports/{reportId}/versions`

## Permissions

AGGREGATE_VIEW, AGGREGATE_CREATE, AGGREGATE_REVIEW, AGGREGATE_APPROVE and AGGREGATE_EXPORT are separate controlled permissions.
