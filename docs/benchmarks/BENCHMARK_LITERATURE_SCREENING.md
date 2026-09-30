# Literature Screening Benchmark Matrix

Document ID: BENCH-LIT-001  
Version: 1.0  
Status: Sprint 4 controlled benchmark

## Benchmark rule

Benchmarking identifies capability expectations; it does not authorize copying vendor behavior or weakening regulatory controls.

## External benchmark observations

### Enterprise literature-safety products

Current enterprise literature systems emphasize:
- literature intake and assessment automation;
- global database ingestion such as PubMed, Medline and Embase;
- de-duplication;
- ICSR relevancy assessment;
- full-text provider integration;
- local literature integration;
- system-agnostic integration with safety systems;
- AI-assisted data extraction and workflow acceleration.

### EMA / GVP Module VI

Scientific and medical literature monitoring forms part of MAH ICSR obligations and wider periodic safety surveillance. Operational controls therefore need scheduled execution, source governance, execution evidence and relevant local/global literature coverage.

### FDA

Scientific literature can generate reportable postmarketing safety information. Literature-origin provenance therefore must survive downstream safety handoff and reporting.

## Capability matrix

| Capability | Current state | Sprint 4 target |
|---|---|---|
| Scheduled searches | Existing | Preserve and workspace-scope |
| Ad hoc/test searches | Existing | Preserve regulated-vs-test distinction |
| Search strategies | Existing | Workspace-scope and tenant-bound history |
| PubMed | Existing | Workspace-scope |
| Source abstraction | Existing | Preserve contract boundary |
| Local/global source routing | Existing | Remove demo/raw-tenant authority |
| Duplicate handling | Existing | Workspace-scope |
| Article acquisition | Existing | Tenant-bound history |
| OCR/document processing | Existing | Tenant ownership retained |
| Evidence normalization | Existing | Tenant-bound history |
| Search Evidence Package | Existing | Preserve LF-021 semantics |
| Screening | Existing | Workspace-scope |
| Patient extraction | Existing | Preserve source linkage |
| Label/RSI | Existing | Preserve governed-reference controls |
| Causality | Existing | Preserve method/version controls |
| Medical Review | Existing | Preserve role separation |
| Intake handoff | Existing | Canonical contract only |
| AI provenance | Partial | Require attributable model/policy/source evidence |
| Cross-tenant isolation | Inconsistent before Sprint 4 | Workspace-bound routes |
| History isolation | Some global in-memory histories | Tenant-owned records and filtered listing |

## Non-negotiable outcomes

1. Client-supplied tenant identifiers never grant authority.
2. Every operational Literature route requires authenticated identity, selected workspace, Literature entitlement, active module role and permission.
3. Search execution evidence remains reproducible.
4. Testing workflows remain distinguishable from regulated PV workflows.
5. Literature-derived candidates preserve article/source provenance.
6. AI cannot silently replace required human PV/medical review.
7. Existing validated Literature workflow meaning is preserved during cleanup.
