# URS — Literature Screening Module

Document ID: URS-LIT-001  
Version: 1.0-draft  
Status: Sprint 4 controlled draft

## Purpose

Define user, compliance and security requirements for the Literature Screening module after reconciliation to the canonical identity, tenant, workspace and module architecture.

## Requirements

| ID | Requirement |
|---|---|
| URS-LIT-001 | Literature access shall require authenticated identity before tenant, workspace or module scope is used. |
| URS-LIT-002 | Every operational Literature API shall require selected Literature workspace context. |
| URS-LIT-003 | Client-supplied tenant identifiers shall never grant or expand authority. |
| URS-LIT-004 | Tenant, workspace, environment, module role and permission shall be revalidated server-side. |
| URS-LIT-005 | Cross-tenant and cross-workspace Literature requests shall fail closed. |
| URS-LIT-006 | Transient Literature histories shall remain tenant-scoped. |
| URS-LIT-010 | Users shall be able to define governed search strategies. |
| URS-LIT-011 | Search strategies shall support product terms, inclusion terms, exclusion terms and date or language controls where applicable. |
| URS-LIT-012 | Ad hoc or validation search execution shall remain distinguishable from regulated production search execution. |
| URS-LIT-013 | The system shall support scheduled regulated literature searches. |
| URS-LIT-014 | Search execution shall retain executed or translated queries by source. |
| URS-LIT-015 | Search execution shall retain source selection and connector outcomes. |
| URS-LIT-016 | Disabled or unavailable sources shall not silently execute. |
| URS-LIT-017 | Search execution shall be attributable to tenant, actor, environment and execution purpose. |
| URS-LIT-018 | Search results shall retain stable source identifiers and deduplication keys. |
| URS-LIT-019 | Relevant worldwide databases and local sources shall be configurable under governed source management. |
| URS-LIT-020 | Production source routing shall not use a demo-tenant fallback as authority. |
| URS-LIT-021 | The system shall support article metadata and full-text acquisition according to source availability. |
| URS-LIT-022 | Article-fetch records shall retain tenant ownership. |
| URS-LIT-023 | Document and OCR processing records shall retain tenant ownership. |
| URS-LIT-024 | Translation records shall retain tenant ownership and language context. |
| URS-LIT-025 | Evidence normalization shall retain tenant, source identity and source type. |
| URS-LIT-026 | Tenant-scoped history endpoints shall not expose another tenant's records. |
| URS-LIT-030 | Duplicate detection shall identify duplicate relationships without losing source provenance. |
| URS-LIT-031 | Duplicate review shall be auditable. |
| URS-LIT-032 | Duplicate merge or reuse behavior shall be idempotent where defined. |
| URS-LIT-040 | Search hits shall support governed automated screening and human review. |
| URS-LIT-041 | Screening shall distinguish relevance, ICSR potential and manual-review outcomes. |
| URS-LIT-042 | Screening decisions shall be attributable to actor, model or policy, and source evidence as applicable. |
| URS-LIT-043 | Controlled retry shall not create uncontrolled duplicate hit records. |
| URS-LIT-044 | Invalid screening-state transitions shall fail closed. |
| URS-LIT-050 | Every literature search execution shall generate or retain a Search Evidence Package with queries, sources, timestamps, counts, outcomes and audit evidence. |
| URS-LIT-051 | Validation-only package creation shall remain distinguishable from handoff-plus-validation. |
| URS-LIT-052 | Evidence package creation and reuse shall be reproducible and idempotent where defined. |
| URS-LIT-053 | Evidence shall remain attributable to the exact search, result and article source. |
| URS-LIT-060 | Review shall support source-linked patient extraction and segmentation. |
| URS-LIT-061 | Final expectedness shall use governed active Label or RSI context where applicable. |
| URS-LIT-062 | Final causality assessment shall record the approved method and version where required. |
| URS-LIT-063 | Medical Review shall be restricted to authorized medical-review roles and permissions. |
| URS-LIT-064 | Completed review workspaces shall not be silently editable. |
| URS-LIT-065 | Review decisions and reasons shall be auditable. |
| URS-LIT-066 | Human override of AI-assisted suggestions shall occur only through controlled attributable workflow actions. |
| URS-LIT-070 | Literature-derived safety output shall hand off through a canonical versioned contract. |
| URS-LIT-071 | Intake handoff shall not require private-table coupling between Literature and Intake. |
| URS-LIT-072 | Supported module combinations shall not bypass required safety-data validation. |
| URS-LIT-073 | Literature-origin provenance shall survive downstream handoff. |
| URS-LIT-080 | AI-assisted functions affecting regulated workflow output shall record model, policy or prompt version and source provenance. |
| URS-LIT-081 | AI output shall not be treated as authoritative regulatory source text. |
| URS-LIT-082 | AI failure or unavailability shall not silently create a final regulated decision. |
| URS-LIT-090 | Literature audit records shall support tenant, workspace, environment and module attribution where applicable. |
| URS-LIT-091 | Authorization denials shall be auditable. |
| URS-LIT-092 | Search and review evidence shall remain inspection-ready and reproducible. |
| URS-LIT-093 | Final evidence shall not be mutable without controlled versioning or amendment semantics. |
| URS-LIT-100 | Existing validated Literature behavior shall be characterized before cleanup changes. |
| URS-LIT-101 | Cleanup shall preserve PV meaning unless a separately approved change control authorizes a behavior change. |
| URS-LIT-102 | Regression verification shall cover search, evidence, hits, screening, review and handoff. |
| URS-LIT-103 | Security verification shall cover cross-tenant and cross-workspace access, privilege escalation, malformed payloads and workflow-state bypass. |
| URS-LIT-104 | Material independent code-review findings shall be resolved before Sprint 4 qualification. |
| URS-LIT-105 | TypeScript, architecture, dependency-security and production-build gates shall be green before Sprint 4 qualification. |

## Acceptance

Sprint 4 is accepted only when all ten mandatory gates are green. Formal disposition can document non-applicability or an approved exception record, but it does not convert an actually failed mandatory gate into a pass.

## Screen architecture and shared safety assessment requirements

| ID | Requirement |
|---|---|
| URS-LIT-106 | The Literature Screening module shall expose the Screens Dashboard, Hits, Screening, Medical Review and Administration through module Sub-navigation. |
| URS-LIT-107 | Dashboard and Administration shall support user/workload and configuration activities and shall remain distinct from the regulated PV processing Screens. |
| URS-LIT-108 | Hits, Screening and Medical Review shall represent the regulated Literature PV workflow sequence. |
| URS-LIT-109 | Seriousness, Listedness/Expectedness and Causality shall be provided by shared governed safety-assessment services rather than independent Literature-only engines. |
| URS-LIT-110 | Literature Screens shall display shared assessment results with provenance, rule/reference version, evidence, human decision and override rationale where applicable. |
