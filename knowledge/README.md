# PV Knowledge Centre

This directory is the physical and controlled knowledge source for regulated PV decisions.

## Layers

### 1. SOP/
Authoritative or reference SOP sources, controlled transcriptions, source manifests and master SOPs.

- `SOP/Sources/` — source-level documents and manifests.
- `SOP/Master/` — consolidated end-to-end master SOPs.
- A source may be physically represented as its original binary, a controlled transcription, or both.
- Source manifests preserve integrity hashes and document-control status.

### 2. Regulatory/
Authoritative regulatory guidance acquired from official authorities.

- `Regulatory/EMA/GVP/source/` contains physically archived EMA/HMA GVP PDFs.
- `source-manifest.json` records canonical official URLs, reference numbers, legal effective dates and applicability.
- `acquisition-result.json` records local paths, byte sizes and SHA-256 hashes.
- Acquired regulatory sources remain **non-production** until PV/QA approval.

### 3. controlled/
Approved, versioned Knowledge Objects and retrieval chunks derived from governed source documents.

Only approved/effective knowledge may be used to finalise regulated production decisions.

### 4. drafts/
Work-in-progress knowledge, policy maps and design material. Draft content must never silently enter production retrieval.

### 5. Clients/, Products/, Dictionaries/, Rules/
Tenant/client requirements, Product Master/MAH data, controlled dictionaries and deterministic rules.

## Decision rule

A regulated engine must not rely on a general top-K RAG result alone.

Before finalising a decision, the engine shall receive a complete **Decision Knowledge Pack** containing:

1. mandatory Master SOP rules;
2. mandatory applicable regulatory/GVP sections;
3. applicable client/MAH SOP/SOW/safety-agreement rules;
4. Product Master/MAH/label/reference-safety-information sources;
5. source article evidence;
6. source/rule versions and hashes;
7. conflicts or missing mandatory sources.

If a mandatory source is missing, conflicting or not effective, the engine must fail closed to an unresolved/manual-review state.

## Current governance status

- Uploaded Literature Search SOP: physically stored as controlled source transcription with original DOCX SHA-256; document-control metadata requires reconciliation before production approval.
- Master Literature Safety Surveillance SOP v0.1: physically stored under `SOP/Master/`; draft/non-production.
- EMA/HMA GVP baseline: nine authoritative PDFs physically archived and hashed under `Regulatory/EMA/GVP/source/`; acquired but not yet QA-approved for controlled production retrieval.
- Existing controlled repository: remains the currently approved internal Knowledge Object set.
- Production pgvector loading/promotion is a separate governed step and must not happen automatically merely because a source file exists here.
