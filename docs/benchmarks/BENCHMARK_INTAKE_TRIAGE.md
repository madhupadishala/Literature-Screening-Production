# Intake & Triage Benchmark Matrix

Document ID: BENCH-INTAKE-001  
Version: 1.0  
Status: Sprint 5 controlled benchmark

## Benchmark rule

Benchmarking identifies capability expectations. Features are included only when regulatory, workflow or product applicability is established.

## Current enterprise benchmark observations

### ArisGlobal Advanced Intake
Current public material emphasizes:
- automated case intake and triage;
- structured, semi-structured and unstructured source ingestion;
- dynamic data extraction;
- AI-assisted translation and narrative generation;
- system-agnostic integration with existing safety databases.

Source: ArisGlobal, **LifeSphere Advanced Intake** public product page, page revision metadata dated 2025-04-15; accessed 2026-09-30. The page describes Case Intake & Triage, Dynamic Data Extraction, Format-Agnostic Intake, AI-Powered Translation and system-agnostic deployment.  
Canonical source: https://www.arisglobal.com/advanced-intake/

Supplemental source: ArisGlobal, **Advanced Intake Fact Sheet**, ©2024, accessed 2026-09-30.  
Canonical source: https://www.arisglobal.com/wp-content/uploads/2024/09/Advanced_Intake_FactSheet.pdf

### Oracle Safety One / Consolidated Intake
Current Oracle documentation describes:
- manual, API, email and EDI ingestion;
- classification of incoming records/documents;
- AI/ML or OCR-supported extraction where the Safety One Intake subscription is enabled;
- manual review for extraction, validation and missing-data exceptions;
- duplicate search / follow-up merge review;
- conversion to a new case or merge with an existing case;
- publication to downstream or sponsor-owned systems where configured.

Source: Oracle, **Safety One Argus 2026.1.01 — Consolidated Intake User Guide, About Consolidated Intake**, release 2026.1.01; accessed 2026-09-30.  
Canonical source: https://docs.oracle.com/en/industries/life-sciences/safety-one-argus/2026.1.01/user-guide/safety-one-intake.html

Source: Oracle, **Safety One Argus 2026.1.01 — Publish intake records to a sponsor-owned safety database for case processing**, release 2026.1.01; accessed 2026-09-30.  
Canonical source: https://docs.oracle.com/en/industries/life-sciences/safety-one-argus/2026.1.01/user-guide/publishing-external-systems.html

### Veeva
Veeva's public announcement for Falcon Safety describes planned intake and follow-up management across E2B-compliant downstream safety systems, including non-Veeva systems. This is used as a **directional modular-integration benchmark**, not as proof of a generally available production capability on the benchmark date.

Source: Veeva Systems, **Veeva Falcon Safety to Work with All E2B-Compliant Safety Systems Across Any Intake Channels**, published 2026-09-01; accessed 2026-09-30. The announcement states early-adopter availability is planned for November 2026.  
Canonical source: https://www.veeva.com/resources/veeva-falcon-safety-to-work-with-all-e2b-compliant-safety-systems-across-any-intake-channels/

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


## Source-control rule

Benchmark claims must be reproducible from named public sources. For each external benchmark source, this document records the vendor/source title, public release/version or publication date when available, canonical location and access date. Planned or preview capabilities shall be labeled as planned and shall not be represented as currently generally available.
