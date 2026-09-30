# Benchmark — Aggregate Reporting

Document ID: BENCH-AGG-001  
Version: 1.0-draft  
Status: Sprint 9 controlled benchmark  
Benchmark date: 2026-09-30

## Objective

Benchmark the Aggregate Reporting foundation against mature pharmacovigilance reporting capabilities while preserving regulatory traceability and avoiding unsupported claims of automated regulator-ready authoring.

## Reference capability classes

Current Ennov product material describes PSUR/PBRER, DSUR, signal/risk outputs, line listings and cumulative summary tabulations from validated safety data. ArisGlobal reporting material describes reusable standard reports, dashboards, case-series reporting and global/local reporting libraries. Veeva SafetyDocs manages aggregate reports as controlled safety content/processes.

## Sprint 9 target

| Capability | Sprint 9 target |
|---|---|
| Workspace/environment-scoped aggregate record | Required |
| Report type and reporting period | Required |
| Finalized-case-only source snapshot | Required |
| Source case/version/hash provenance | Required |
| Snapshot SHA-256 | Required |
| Versioned report content | Required |
| Review/approval/finalization separation | Required |
| Finalized report immutability | Required |
| Audit attribution | Required |
| PSUR/PBRER/DSUR/PADER/line-listing identities | Required |
| Automated regulator-ready narrative generation | Not claimed |
| Validated tabulations/statistical engines | Future validated capability |
| Electronic regulator submission | Out of Sprint 9 scope |

## Non-overstatement rule

A report type label does not mean the generated content is regulator-ready. Sprint 9 qualifies the source-snapshot, versioning, review and evidence foundation only. Report templates, calculations, jurisdiction-specific sections and generated content require separate specification and validation.

## Sources

Benchmark inputs include current Ennov PV Case Management/aggregate-reporting material, ArisGlobal LifeSphere Reporting/Business Intelligence material and Veeva SafetyDocs aggregate-content capability. Vendor capability descriptions are not governing regulatory requirements.
