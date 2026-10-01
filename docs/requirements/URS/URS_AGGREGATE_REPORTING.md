# URS — Aggregate Reporting

Document ID: URS-AGG-001  
Version: 1.0-draft  
Status: Cleanup Sprint 9 controlled draft  
Benchmark: BENCH-AGG-001

| ID | User requirement |
|---|---|
| URS-AGG-001 | Aggregate Reporting shall be independently entitleable by tenant, workspace and environment. |
| URS-AGG-002 | All operational APIs shall require AGGREGATE_REPORTING workspace/module authorization. |
| URS-AGG-003 | Report identifiers shall fail closed across workspace/environment boundaries. |
| URS-AGG-004 | A report shall declare report type, reporting period and optional product scope. |
| URS-AGG-005 | Source datasets shall be created from authoritative finalized case versions in the selected scope. |
| URS-AGG-006 | Mutable drafts shall not be used as authoritative aggregate source data. |
| URS-AGG-007 | Source snapshots shall preserve case ID, case key, final version ID, case hash and receipt-date provenance. |
| URS-AGG-008 | Source snapshots shall have a reproducible integrity hash. |
| URS-AGG-010 | Report content shall be versioned and attributable. |
| URS-AGG-011 | Finalized report content shall not be edited in place. |
| URS-AGG-012 | Review and approval authority shall be distinct from ordinary creation authority. |
| URS-AGG-013 | Report versions shall retain change reason, status, actor, timestamp and content hash. |
| URS-AGG-020 | Supported foundation types shall include PSUR/PBRER, DSUR, PADER, line listing and controlled custom reports. |
| URS-AGG-021 | A supported type shall not imply that all jurisdiction-specific calculations/templates are already validated. |
| URS-AGG-022 | Statistical/tabulation logic used for regulatory output shall be separately specified and validated. |
| URS-AGG-030 | The module shall remain plug-and-play and shall consume canonical finalized case contracts without requiring Intake/Literature entitlement. |
| URS-AGG-040 | Security verification shall include cross-workspace IDOR, mutable-draft exclusion, finalized-report mutation and privilege-separation cases. |
| URS-AGG-041 | All ten mandatory gates shall pass before qualification. |

## Acceptance

Sprint 9 qualifies the governed Aggregate Reporting foundation only. Regulator-ready PSUR/PBRER/DSUR/PADER authoring is not claimed until templates, calculations, required sections and jurisdictional rules are separately validated.
