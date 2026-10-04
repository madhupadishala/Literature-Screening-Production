# PV Knowledge Centre

This directory is the canonical physical knowledge centre for PV automation.

## Core principle

**Source documents, AI-derived artifacts, and team-approved operational knowledge are separate layers.**

No raw SOP, regulation, guidance PDF, generated chunk, vector embedding, or draft rule may be mixed into the wrong layer.

## Canonical hierarchy

```text
knowledge/
├── SOP/
│   ├── Literature/
│   ├── ICSR/
│   ├── Triage/
│   ├── Aggregate/
│   ├── Signal/
│   ├── Submissions/
│   ├── Quality/
│   └── Validation/
│
├── Regulatory/
│   ├── EMA/
│   │   └── GVP/
│   ├── ICH/
│   │   ├── E2-Safety/
│   │   └── E6-GCP/
│   ├── FDA/
│   │   ├── 21-CFR/
│   │   └── Guidance/
│   ├── Privacy/
│   │   ├── HIPAA/
│   │   └── GDPR/
│   ├── GxP/
│   ├── CDSCO/
│   ├── MHRA/
│   ├── Health-Canada/
│   ├── TGA/
│   ├── PMDA/
│   └── WHO/
│
├── Controlled-Approved-Knowledge/
│   ├── Repository-v1.0/
│   ├── Team-Rules/
│   ├── Literature-Screening/
│   ├── ICSR-Validity/
│   ├── Causality/
│   ├── Seriousness/
│   ├── Special-Situations/
│   ├── Expectedness-Listedness/
│   ├── Duplicate-Management/
│   ├── Day-Zero/
│   ├── Aggregate-Safety/
│   ├── Signal/
│   ├── Data-Privacy/
│   ├── Cross-Engine-Policies/
│   └── Golden-Cases/
│
├── Clients/
├── Products/
├── Dictionaries/
├── _system/
└── drafts/
```

## Document package standard

Every source document is stored as its own package:

```text
<Document-ID>/
├── manifest.json
├── source/
│   └── document.<pdf|docx|xml|html|md>
├── derived/
│   ├── parsed/
│   ├── chunks/
│   ├── embeddings/
│   └── indexes/
└── qa/
    ├── validation.json
    └── approval.json
```

### source/
Immutable authoritative or reference source. Store original binary whenever available. Preserve source URL, version, effective date, SHA-256 and provenance in `manifest.json`.

### derived/parsed/
Lossless structured representation produced by parsing/OCR/IDP. Preserve page, section, paragraph, table, figure and source coordinates.

### derived/chunks/
Machine-retrieval units. Chunks must be source-linked, section-aware and versioned. Chunking must never modify the source document.

### derived/embeddings/
Embedding metadata, vector IDs, model/version, dimension, content hashes and index references. The vector database is an index, not the authoritative source.

### derived/indexes/
Sparse/BM25 terms, parent-child relationships, entity maps, citation maps and retrieval metadata.

### qa/
Validation and approval evidence for the document package and derived artifacts.

## Controlled Approved Knowledge

This folder contains only **team-approved operational guidance, logic, rules, decision policies, mappings and golden cases**.

It does not contain raw GVP PDFs, raw ICH/FDA regulations, external SOPs, unapproved drafts, or generated AI reasoning.

A controlled rule must carry:
- stable Knowledge Object ID;
- source references;
- version;
- status;
- effective date;
- approver/approval basis;
- content hash;
- production eligibility;
- supersession lineage.

## Retrieval rule

Every regulated engine must obtain a Decision Knowledge Pack composed of:

1. exact mandatory controlled rules;
2. exact applicable SOP sections;
3. exact applicable regulatory sections;
4. client/MAH requirements;
5. Product Master/label/reference-safety-information;
6. source article evidence;
7. optional hybrid/agentic retrieval results.

Vector similarity alone can never be used as the sole rule-selection mechanism.
