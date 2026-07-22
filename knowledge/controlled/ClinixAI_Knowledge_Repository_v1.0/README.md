# ClinixAI Knowledge Repository v1.0

## Delivery Summary

- **100 real Markdown knowledge files**
- **80 user-approved Knowledge Objects**
- **20 governance/AI Constitution objects clearly marked Draft – Requires Approval**
- **1700 section-aware vector chunks**
- **145,360 words across individual Knowledge Objects**
- **Estimated 415 pages at approximately 350 words/page**
- Single combined compendium
- JSON, JSONL, graph, schema, CSV register and loader
- Validation report and cryptographic hashes

## Production Safety Rule

Only Knowledge Objects with:

- `status: Approved`
- `effective_for_production: true`

may enter the production Vector Database or RAG collection.

The CDS-001 to CDS-020 governance files are included as a complete proposed governance layer but are **not falsely represented as approved**.

## Recommended Ingestion

```bash
cd 07_Indexes_and_Loader
python knowledge_loader.py --input chunks.jsonl --output vector_seed.jsonl --production
```

This command intentionally rejects every draft chunk from the production seed.

## Repository Structure

- `00_Governance` — CDS-001 to CDS-020
- `01_Literature_Foundation` — LF-001 to LF-030
- `02_Search_Intelligence` — SI-001 to SI-010
- `03_Database_Search_Engineering` — DB-001 to DB-010
- `04_Screening_Decision_Intelligence` — SDI-001 to SDI-010
- `05_Output_Intelligence` — OI-001 to OI-010
- `06_Validity_Engine` — VAL-001 to VAL-010
- `07_Indexes_and_Loader` — machine-readable indexes, chunks and loader
- `08_Schemas` — JSON schema
- `09_Validation` — validation evidence
- `ClinixAI_Knowledge_Compendium_v1.0.md` — all knowledge in one file

## Governance Note

The 80 approved rules are preserved exactly from the source register. Explanatory and software-implementation sections are generated to operationalize those rules; they do not replace the governing statement. Any change to the controlled rule requires formal change control and approval.
