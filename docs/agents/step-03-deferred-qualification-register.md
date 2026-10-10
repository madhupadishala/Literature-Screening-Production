# Nexus Step 3 — Deferred work and qualification register

**Owner of scheduling:** TheClinixAI leadership. **Technical preparation/execution:** engineering/assistant subject to authorized environment access. **Clinical acceptance:** PV experts; **quality/release sign-off:** authorized QA/business stakeholders.

**Policy:** Finish safe in-repository engineering and evidence first. Schedule environment-dependent validation, expert review and full UAT as a consolidated program when required; do not treat any deferred item as verified or approved. Carry forward items from Sprints 3.1–3.6 and adjacent Step 2/shared-agent blockers. Do not replace an existing working workflow simply because live qualification is deferred.

| ID | Origin | Deferred activity | Required completion evidence | Earliest sensible point | Status |
|---|---|---|---|---|---|
| D01 | 3.1 | Complete exhaustive URS-LIT-001–110 and FRS-LIT-001–022 row-by-row traceability, including currently UNKNOWN items, reviewer sign-off and actual test mapping | Controlled URS/FRS/code/test/deviation matrix, signed review | Before formal CSV qualification | OPEN |
| D02 | 3.2 | Execute production-like full Search → Hits → Screening with real supported literature connectors and representative positive/negative/failure/retry/duplicate cases | Repeatable application and database evidence, error/retry/audit outputs | Consolidated end-to-end UAT | OPEN |
| D03 | 3.2 | Verify large-batch PubMed/search behavior, source errors, connector limits and failed-worker recovery after atomic retry; compare actual production SQL and contention test | Load/recovery evidence and failure-injection outcomes | Performance/reliability qualification | OPEN |
| D04 | 3.2 | Confirm tenant/client/workspace/environment scoping of transient histories and all older service endpoints, not just SQL-backed review tables | Negative multi-client history tests + corrected service contracts | Before security qualification | OPEN |
| D05 | 3.3 | Clinical expert validation of patient segmentation, labeling/expectedness, causality, seriousness and Medical Review/QC decisions, including complex/special situation cases | Signed representative case benchmark, disagreements, dispositions | PV expert clinical UAT | OPEN |
| D06 | 3.3 | Controlled amendments to finalized MR/Screening decisions (if business requirements demand post-finalization corrections); verify prevention of unauthorized changes | Approved amendment URS/FRS, role-based audit/version and lifecycle tests | Before release if amendment workflow required | OPEN |
| D07 | 3.3 | Verify real reviewer/QC assignment, overrides, attributed comments, timestamps and route transitions using separate roles | UI/API/database acceptance evidence | Consolidated operational UAT | OPEN |
| D08 | 3.4 | Full application/database Literature-to-Intake import replay including approved/rejected case, source PMID/DOI, hashes, lineage, concurrent repeats and cross-client deny | Consumer integration tests, hashes, audit/evidence links and no duplicate Intake | Integration/UAT | OPEN |
| D09 | 3.4 | Verify downstream schema interoperability and import/export tamper checks against a real configured Intake deployment | Signed canonical payload contract and negative import suite | Integration qualification | OPEN |
| D10 | 3.5 | Deploy verified patched commit to accessible *isolated* UAT, retaining production protection and avoiding clinical production data | Deployment SHA/URL, environment segregation, smoke result | Start of consolidated UAT | OPEN |
| D11 | 3.5 | App-level unauthorized HTTP 401/403, tampered/expired context, privileges, and two-workspace/two-tenant read/write denials | Captured request IDs, responses and app-generated error codes from patched UAT | Security UAT | OPEN |
| D12 | 3.5 | Verify true app-originated audit persistence for authorized/denied operations and no credential/PII leaks; retention and tamper handling | Read-only UAT DB audit queries matched to requests, approved privacy review | Security UAT | OPEN |
| D13 | 3.5 | Review all 24 Literature route methods/permissions and remaining service/history and artifact access for workspace-level isolation, including concurrency and negative cases | Route/SQL matrix and multi-role evidence; any defects fixed | Security hardening before release | OPEN |
| D14 | 3.5 | Obtain authorized UAT test identities (2 clients, differing roles), database read permission and any SSO bypass scoped only to UAT test automation | Least-privilege access approvals, no secrets in repo | UAT setup | BLOCKED_ACCESS |
| D15 | 3.6 | Run end-to-end integration, full regression, migration tests and executable qualification against a fixed release-candidate SHA | CI PASS, database transcript, artifact provenance and controlled deviation record | Release-candidate validation | OPEN |
| D16 | 3.6 | Resolve or formally scope each unrelated failing CI workflow: Step 2 Shared Clinical Engineering; Shared PV Agent Quality; Nexus Clinical Rules PostgreSQL; Cleanup Baseline Benchmark | Successful reruns or documented approved exclusion with rationale | Before platform-wide release claim | OPEN |
| D17 | Shared clinical agents / Step 2 | Finish specialist-agent implementations, canonical migration, shared schemas and live orchestration for seriousness, listedness, causality, product/AE extraction and other agents | Importable registered services, adapter tests, passing cross-agent CI | Consolidated shared-agent phase | OPEN |
| D18 | Shared clinical agents / Step 2 | Activate reviewed clinical policy/Knowledge Base rules in an authorized non-production database; verify client-specific labels and source retrieval | Approved policy versions, retrieval/regression, access control | Before agent clinical UAT | OPEN |
| D19 | Clinical qualification | Expert-labeled blind benchmark, challenging literature/FAERS cases, confidence, audit, hallucination and human escalation, including long-document processing | Expert-approved reference labels, scored error analysis, qualification report | Clinical AI acceptance | OPEN |
| D20 | Release | QA validation package, URS/FRS traceability, controlled SOPs, UAT signoff, change control, rollback, security approvals and release authority | Signed CSV/UAT/release evidence | Before regulated production release | OPEN |

## Evidence already attained (do not reclassify as open)
- Sprint 3.2 isolated PostgreSQL predicate + two-session contention, and frontend verification passed on previously recorded runs.
- Sprint 3.3 frontend CI passed [38062206548](https://github.com/madhupadishala/Literature-Screening-Production/actions/runs/38062206548); code-level Medical Review and Screening finalization guards committed.
- Sprint 3.4 frontend CI passed [38063574503](https://github.com/madhupadishala/Literature-Screening-Production/actions/runs/38063574503); versioned Intake consumer guard committed.
- Sprint 3.5 isolated SQL denial/audit passed [38074023407](https://github.com/madhupadishala/Literature-Screening-Production/actions/runs/38074023407), later [38074615910](https://github.com/madhupadishala/Literature-Screening-Production/actions/runs/38074615910); only **test-table persistence**, not app database audit.
- Most recent inspected head `463c822a`: frontend gate [38074615915](https://github.com/madhupadishala/Literature-Screening-Production/actions/runs/38074615915) and 3.2/3.5 PostgreSQL gates passed. Other platform-wide CI was not all green.

## Scheduling recommendation
**Now:** code consolidation and evidence compilation; **later, when a UAT environment is required:** D10, D14, then D11–D13 and D08–D09; **clinical acceptance:** D05, D07, D17–D19; **pre-release:** D01, D03, D06 if applicable, D15–D16 and D20. Dates intentionally **TBD by leadership**. Prerequisites cannot be waived just because activities are deferred.

No item is declared complete solely because a test script, architecture, or source-level fix exists.
