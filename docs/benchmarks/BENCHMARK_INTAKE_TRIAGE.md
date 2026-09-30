# Intake & Triage Benchmark Matrix

Document ID: BENCH-INTAKE-001  
Version: 1.0  
Status: Sprint 5 controlled benchmark

## Benchmark rule

Benchmarking identifies capability expectations. Features are included only when regulatory, workflow or product applicability is established.

## Current enterprise benchmark observations

### ArisGlobal Advanced Intake
Current public material emphasizes:
- automated intake and triage;
- structured, semi-structured and unstructured source ingestion;
- dynamic data extraction;
- AI-assisted translation and narrative generation;
- system-agnostic integration with existing safety databases;
- human review for controlled exceptions.

### Oracle Safety One / Consolidated Intake
Current Oracle documentation describes:
- manual, API, email and EDI ingestion;
- document classification;
- OCR/ML extraction;
- manual review for extraction/validation exceptions;
- conversion and publication into downstream safety-case processing;
- sponsor/external-system publication options.

### Veeva
Current public product direction emphasizes intake and follow-up automation across E2B-compliant downstream safety systems, reinforcing modular/system-agnostic integration as an industry benchmark.

## Capability matrix

| Capability | Current state | Sprint 5 target |
|---|---|---|
| Manual intake | Existing | Workspace-scope |
| API/partner intake | Existing | Workspace-scope |
| Document intake | Existing | Workspace-scope |
| Literature handoff intake | Existing | Workspace-scope |
| Source document handling | Existing | Preserve tenant ownership |
| Source review | Existing | Preserve controlled review |
| Extraction | Existing | Preserve governed field provenance |
| Minimum criteria/triage | Existing | Preserve explicit validity logic |
| Duplicate/follow-up | Existing | Preserve duplicate-first workflow |
| Suggestions/AI assist | Existing | Preserve human decision authority |
| Disposition | Existing | Workspace-scope and controlled transitions |
| Create Case disposition | Existing | Same-workspace downstream authorization |
| External export | Existing | Intake export permission |
| Handoff package | Existing | Canonical contract |
| Audit/evidence | Existing | Preserve and extend scope attribution |
| Cross-tenant isolation | Legacy module guard before Sprint 5 | Canonical workspace guard |

## Non-negotiable outcomes

1. Intake source data must remain tenant/workspace-isolated.
2. Source type and receipt dates must survive downstream processing.
3. AI extraction/suggestions cannot silently become final case data.
4. Duplicate/follow-up decisions remain reviewable and auditable.
5. Case creation requires both valid Intake disposition authority and downstream Case Processing permission in the same selected workspace.
6. Existing validated intake/triage semantics remain unchanged by security reconciliation.
