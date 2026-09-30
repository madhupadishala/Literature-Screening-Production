# Case Processing Benchmark — Cleanup Sprint 6

Document ID: BENCH-CASE-001  
Benchmark date: 2026-09-30  
Status: Controlled public-source benchmark

## Objective

Benchmark the reconciled Case Processing module against current public pharmacovigilance case-management capabilities without copying vendor implementation details or treating marketing claims as validation evidence.

## Oracle Safety One Argus / Argus Safety

Oracle describes Safety One Argus as an end-to-end adverse-event case-processing platform. Current 2026.1.01 documentation includes worklists, assigned/unassigned cases, workflow routing, follow-up events, case locking/closure, case-data entry, medical review and E2B reporting.

Sources:
- Oracle, **Safety One Argus Documentation — Get Started**, release 2026.1.01; accessed 2026-09-30. https://docs.oracle.com/en/industries/life-sciences/safety-one-argus/index.html
- Oracle, **Argus Safety User's Guide**, release 2026.1.01; accessed 2026-09-30. https://docs.oracle.com/en/industries/life-sciences/argus-safety/2026.1.01/aeoaf/oracle-argus-safety-users-guide.pdf
- Oracle, **Argus Safety 2026.1.01 Videos**, accessed 2026-09-30; includes current worklist, case processing and medical-review workflows. https://docs.oracle.com/en/industries/life-sciences/argus-safety/2026.1.01/videos.html

Benchmark dimensions:
- governed worklist and assignment;
- complete case-data maintenance;
- controlled workflow states;
- follow-up/version history;
- medical/QC review;
- finalization/locking;
- regulatory-format downstream readiness;
- auditability.

## ArisGlobal LifeSphere MultiVigilance

ArisGlobal currently describes MultiVigilance as a unified SaaS safety database supporting end-to-end automated/touchless case processing, global compliance, secure cloud architecture and open integrations.

Source:
- ArisGlobal, **MultiVigilance**, current public product page, published/crawled 2026; accessed 2026-09-30. https://www.arisglobal.com/lifesphere/safety/multivigilance-system/

Benchmark dimensions:
- end-to-end case automation;
- harmonized global case management;
- human control around automated decisions;
- scalable operational worklists;
- compliance updates;
- interoperable downstream reporting.

## Sprint 6 benchmark target

The module shall provide at least:
1. workspace/environment-scoped case ownership;
2. governed case creation from a qualified upstream intake;
3. worklist and assignment;
4. draft revision/version history;
5. patient/reporter/product/event/test data integrity;
6. causality/expectedness/listedness and other controlled assessments;
7. source-linked narrative lifecycle;
8. query/QC/medical-review actions;
9. explicit finalization checks and immutable final case version;
10. evidence/export reproducibility;
11. tenant + workspace + environment authorization on every resource;
12. audit attribution for material regulated actions;
13. executable IDOR/state-bypass negative checks.

## Non-claim

This benchmark establishes functional expectations. It does not claim feature-for-feature equivalence, vendor certification, regulator endorsement, or validated production equivalence to Oracle or ArisGlobal.
