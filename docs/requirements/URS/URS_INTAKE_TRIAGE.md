# URS — Intake & Triage Module

Document ID: URS-INTAKE-001  
Version: 1.0-draft  
Status: Sprint 5 controlled draft

## Purpose

Define the user, regulatory, security and workflow requirements for Intake & Triage after migration to canonical workspace authorization.

## Requirements

| ID | Requirement |
|---|---|
| URS-INT-001 | Intake access shall require authenticated identity and selected workspace context. |
| URS-INT-002 | Every operational Intake API shall require NEXUS_MODULES.INTAKE authorization. |
| URS-INT-003 | Client-supplied tenant identifiers shall not grant authority. |
| URS-INT-004 | Tenant, workspace, environment, module role and permission shall be revalidated server-side. |
| URS-INT-005 | Cross-tenant and cross-workspace Intake requests shall fail closed. |
| URS-INT-010 | Intake shall support manual structured entry. |
| URS-INT-011 | Intake shall support external/API structured submissions. |
| URS-INT-012 | Intake shall support document-based source ingestion. |
| URS-INT-013 | Intake shall support canonical Literature-origin handoff. |
| URS-INT-014 | Source channel and source-system identity shall be retained. |
| URS-INT-015 | Source content shall retain checksum/provenance where applicable. |
| URS-INT-016 | Receipt date and source metadata shall survive downstream processing. |
| URS-INT-020 | Intake shall support source review before downstream disposition where required. |
| URS-INT-021 | Extraction shall retain field-level/source evidence sufficient for review. |
| URS-INT-022 | AI-assisted extraction shall remain reviewable and correctable. |
| URS-INT-023 | AI suggestions shall not silently become final authoritative case data. |
| URS-INT-024 | Malformed/unsupported source inputs shall fail with controlled errors. |
| URS-INT-030 | Triage shall evaluate minimum valid ICSR criteria according to configured governed logic. |
| URS-INT-031 | Triage outcomes shall remain attributable and auditable. |
| URS-INT-032 | Invalid state transitions shall fail closed. |
| URS-INT-033 | Intake processing shall preserve initial and latest receipt dates. |
| URS-INT-040 | Duplicate detection shall occur before uncontrolled case creation. |
| URS-INT-041 | Potential duplicates shall support controlled human review. |
| URS-INT-042 | Follow-up relationships shall remain explicit and auditable. |
| URS-INT-043 | Duplicate finalization shall be idempotent where defined. |
| URS-INT-050 | Intake disposition shall support controlled outcomes including case creation and external export where enabled. |
| URS-INT-051 | CREATE_NEXUS_CASE shall require Intake processing authority plus Case Processing create authority in the same tenant/workspace/environment. |
| URS-INT-052 | EXPORT_EXTERNAL shall require Intake export permission. |
| URS-INT-053 | Disposition shall record rationale. |
| URS-INT-054 | Disposition shall not bypass unresolved mandatory review/triage constraints. |
| URS-INT-060 | Canonical handoff packages shall be versioned and attributable. |
| URS-INT-061 | Downstream case processing shall consume a canonical contract rather than private Intake tables. |
| URS-INT-062 | Handoff retrieval shall remain tenant/workspace scoped. |
| URS-INT-070 | Intake documents shall be retrievable only within authorized scope. |
| URS-INT-071 | Document identifiers shall not permit cross-tenant or cross-workspace access. |
| URS-INT-080 | Intake audit records shall include actor, tenant, workspace, environment, action and outcome where applicable. |
| URS-INT-081 | Authorization denials shall be auditable. |
| URS-INT-082 | AI-assisted decisions shall retain model/policy/source provenance where they affect regulated workflow output. |
| URS-INT-090 | Existing validated Intake behavior shall be characterized before cleanup change. |
| URS-INT-091 | Cleanup shall preserve PV meaning unless approved change control explicitly changes it. |
| URS-INT-092 | Regression verification shall cover all source channels, extraction, triage, duplicate review, disposition and handoff. |
| URS-INT-093 | Security verification shall cover cross-tenant/workspace access, resource identifier manipulation, malformed payloads and state-transition bypass. |
| URS-INT-094 | Material independent review findings shall be resolved before Sprint 5 qualification. |
| URS-INT-095 | TypeScript, architecture, dependency security and production build shall be green before qualification. |

## Acceptance

Sprint 5 is accepted only when all nine mandatory gates are green. Formal disposition may document a non-applicable control or approved exception record, but cannot convert a failed mandatory gate into a pass.

## Screen architecture and shared safety assessment requirements

| ID | Requirement |
|---|---|
| URS-INT-096 | The Intake module shall expose the Screens Intake, Duplicate Check, Triage and Medical Review through module Sub-navigation. |
| URS-INT-097 | Duplicate Check shall remain a distinct controlled human-review Screen before uncontrolled case creation. |
| URS-INT-098 | Triage shall expose validity, seriousness, priority and routing decisions without duplicating shared safety-assessment logic. |
| URS-INT-099 | Medical Review shall be available for Intake records requiring governed clinical judgment according to controlled routing rules. |
| URS-INT-100 | Seriousness, Listedness/Expectedness and Causality shall be provided by shared governed safety-assessment services and reused by Intake. |
