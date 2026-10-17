# Step 1 — Labeling Document Inventory

**Inventory date:** 2026-10-07  
**Source of truth:** `knowledge/Labeling/`  
**Purpose:** establish the real labeling-document inventory that Step 2 will bind into governed `LABEL_REFERENCE` configuration. This report does **not** approve any document for production use.

## Inventory result

- 59 label manifests found across 10 products.
- 60 jurisdiction authorization records found (10 products × 6 configured jurisdictions).
- Source material: 49 PDF files and 10 HTML files.
- All 59 source files exist and all recorded SHA-256 hashes match the checked-in source bytes.
- Parsed text exists for all 59 references.
- Acquisition QA files exist for all 59 references.
- All 59 preserve source bytes and extracted text without truncation.
- Human content review remains **PENDING** for all 59.
- All 59 are `DRAFT`.
- `effectiveForProduction = false` for all 59.
- Production use is blocked for all 59.
- Effective dates are unresolved for all 59.
- Tenant/client assignment remains `UNASSIGNED_REFERENCE_ONLY`.
- Product/regulatory approval remains `PENDING_PRODUCT_AND_REGULATORY_REVIEW`.

## Product / jurisdiction matrix

| Product | Generic | Product ID | USA | EU/EEA | Singapore | UK | China | India | Total |
|---|---|---|---|---|---|---|---|---|---:|
| Allerzen | Cetirizine | CLX-PROD-006 | Package Insert | PIL + SmPC | GAP | PIL + SmPC | Package Insert | GAP | 6 |
| Cardionex | Amlodipine | CLX-PROD-003 | Package Insert | PIL + SmPC | Package Insert | PIL + SmPC | Package Insert | GAP | 7 |
| Ceflora | Cefixime | CLX-PROD-008 | Package Insert | PIL + SmPC | GAP | PIL + SmPC | GAP | GAP | 5 |
| Clinivex | Paracetamol | CLX-PROD-001 | Package Insert | PIL + SmPC | GAP | PIL + SmPC | GAP | GAP | 5 |
| Gastrovia | Pantoprazole | CLX-PROD-005 | Package Insert | PIL + SmPC | GAP | PIL + SmPC | Package Insert | GAP | 6 |
| Glycora | Metformin | CLX-PROD-004 | Package Insert | PIL + SmPC | GAP | SmPC | GAP | GAP | 4 |
| Lipirex | Atorvastatin | CLX-PROD-009 | Package Insert | PIL + SmPC | Package Insert | PIL + SmPC | Package Insert | GAP | 7 |
| Neurovia | Pregabalin | CLX-PROD-002 | Package Insert | PIL + SmPC | Package Insert | PIL + SmPC | Package Insert | GAP | 7 |
| Respira-L | Montelukast | CLX-PROD-007 | Package Insert | PIL + SmPC | Package Insert | PIL + SmPC | GAP | GAP | 6 |
| Serovex | Sertraline | CLX-PROD-010 | Package Insert | PIL + SmPC | GAP | PIL + SmPC | Package Insert | GAP | 6 |

## Governance observations

1. These are **external/public reference candidates**, not yet approved client/MAH labels.
2. EU/EEA references are national Spain references; they must not be treated as proving applicability across every EEA market.
3. UK scope is configured, but legal authorization applicability is not yet verified.
4. India has configured authorization records but **no acquired label documents** for any of the 10 products.
5. Lipirex is marked withdrawn/inactive and Serovex retired/inactive in the acquisition report. They must stay excluded from active production mapping unless a historical use-case is deliberately configured.
6. Historical/effective label version matching remains unresolved. Step 2 must therefore fail closed rather than invent an effective date.
7. The controlled database currently contains no active controlled-knowledge repository, so none of these 59 references are yet retrievable by the production Listedness Engine.

## Step 1 closure criteria

Step 1 is considered **inventory-complete** because every checked-in labeling reference has:
- a manifest,
- source artifact,
- verified SHA-256,
- parsed text,
- acquisition QA record,
- jurisdiction authorization record, and
- product/jurisdiction/document-type classification.

Step 1 does **not** promote any document to production. Promotion, tenant/client binding, market/version/effective-date binding, and controlled-repository loading belong to Step 2.
