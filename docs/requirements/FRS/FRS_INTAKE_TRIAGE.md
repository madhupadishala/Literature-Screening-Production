# FRS — Intake & Triage Module

Document ID: FRS-INTAKE-001  
Version: 1.0-draft  
Status: Sprint 5 controlled draft  
Linked URS: URS-INTAKE-001

## Functional requirements

| FRS ID | Linked URS | Functional requirement | Verification |
|---|---|---|---|
| FRS-INT-001 | URS-INT-001–005 | All Intake routes shall use the canonical workspace module guard for NEXUS_MODULES.INTAKE and a controlled Intake permission. | VER-INT-WORKSPACE-ROUTES |
| FRS-INT-002 | URS-INT-010–016 | Manual, external/API, document and Literature-origin intake shall normalize into canonical Intake drafts while preserving source channel/system, receipt dates and source identity. | existing Intake/Nexus verification |
| FRS-INT-003 | URS-INT-020–024 | Source review and extraction shall preserve source-linked evidence and controlled review status; malformed input shall return controlled errors. | Intake extraction/source-review tests |
| FRS-INT-004 | URS-INT-021–023 | AI/extraction suggestions shall remain proposed values until accepted through controlled workflow action. | suggestion acceptance/rejection tests |
| FRS-INT-005 | URS-INT-030–033 | Triage shall evaluate minimum valid ICSR criteria and preserve initial/latest receipt-date semantics. | Nexus Sprint 5 verification |
| FRS-INT-006 | URS-INT-040–043 | Duplicate/follow-up workflow shall use controlled candidate review and finalization with idempotent disposition where defined. | Nexus Sprint 6 verification |
| FRS-INT-007 | URS-INT-050,053–054 | Disposition POST shall require INTAKE_PROCESS and validate controlled disposition type plus non-empty rationale. | disposition negative tests |
| FRS-INT-008 | URS-INT-051 | CREATE_NEXUS_CASE shall first authorize Intake processing in the selected context and additionally authorize CASE_CREATE for CASE_PROCESSING in the same selected tenant/workspace/environment. | VER-INT-CROSS-MODULE-HANDOFF |
| FRS-INT-009 | URS-INT-052 | EXPORT_EXTERNAL shall require INTAKE_EXPORT in the selected Intake workspace context. | route/security verification |
| FRS-INT-010 | URS-INT-060–062 | Handoff packages shall remain canonical, versioned, retrievable only in authorized scope and suitable for downstream system integration. | handoff contract tests |
| FRS-INT-011 | URS-INT-070–071 | Document retrieval shall use tenant-bound identifiers and scoped principal tenant ownership in queries. | document route verification |
| FRS-INT-012 | URS-INT-080–082 | Intake audit/evidence shall record actor/scope/action/outcome and AI provenance where applicable. | audit/evidence verification |
| FRS-INT-013 | URS-INT-090–095 | Sprint 5 CI shall execute Intake reconciliation verification plus current Intake/Nexus regressions, architecture, security, dependency and production-build gates. | VER-INT-SPRINT5-GATE |

## Permission profile

| Route family | Minimum permission |
|---|---|
| Intake list/detail | INTAKE_VIEW |
| Manual/API/document/Literature create | INTAKE_CREATE |
| Source review/extraction/triage mutations | INTAKE_PROCESS |
| Duplicate review/finalization | INTAKE_PROCESS |
| Disposition mutation | INTAKE_PROCESS |
| External export | INTAKE_EXPORT |
| Handoff package retrieval | INTAKE_EXPORT |
| Create Case disposition | INTAKE_PROCESS + additional CASE_PROCESSING / CASE_CREATE in same workspace |

## Cross-module handoff rule

A cross-module handoff does not require a second identity login or a browser context switch. The server shall reuse only the authenticated selected tenant/workspace/environment and independently evaluate downstream module entitlement, role and permission. The current Intake route must already have passed its own Intake guard.

## No-behavior-change constraint

Workspace authorization migration shall not change intake source meaning, receipt dates, minimum-valid-case criteria, duplicate/follow-up semantics, extraction evidence, disposition meaning or handoff payload content unless separately approved through change control.
