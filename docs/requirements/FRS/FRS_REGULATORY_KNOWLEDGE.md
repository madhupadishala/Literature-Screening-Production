# FRS — Controlled Pharmacovigilance Regulatory Knowledge Foundation

Document ID: FRS-PV-KNOW-001  
Version: 1.0-draft  
Status: Sprint 1 controlled draft  
Linked URS: URS-PV-KNOW-001

## 1. Functional architecture

```text
Official Source Register
  -> Acquisition
  -> SHA-256 / source metadata
  -> Parser + normalizer
  -> Section-aware chunker
  -> Approval/governance
  -> Embedding service
  -> Vector + lexical indexes
  -> Authorization-aware RetrievalService
  -> Reranking
  -> Source-linked context
  -> Human / governed AI workflow
  -> Audit + Evidence
```

## 2. Source catalog specification

| FRS ID | URS | Behavior |
|---|---|---|
| FRS-PVK-001 | 001-020 | The repository shall maintain a machine-readable regulatory source catalog under `knowledge/Regulatory/`. |
| FRS-PVK-002 | 002 | Each source record shall include a stable source ID, authority, jurisdiction, title, canonical URL/reference, lifecycle status, scope tags and ingestion status. |
| FRS-PVK-003 | 002-005 | Optional fields shall include version/revision, publication date, effective date, superseded-by/supersedes references and local artifact checksum. |
| FRS-PVK-004 | 003 | `ingestionStatus=CATALOGUED` shall mean source registration only; it shall not be surfaced as full-text available. |
| FRS-PVK-005 | 006-007 | Source-class and draft/final status shall be independently represented from ingestion status. |

## 3. Authority taxonomy

The code-level `RegulatoryAuthority` enum/union shall support at minimum:
EMA, FDA, MHRA, PMDA, MHLW, ICH, CIOMS, CDSCO, PVPI, IPC, HEALTH_CANADA, TGA, WHO, EUDRAVIGILANCE and UNKNOWN.

Unknown authority shall not be production-eligible merely because parsing succeeds.

## 4. Discovery

| FRS ID | URS | Behavior |
|---|---|---|
| FRS-PVK-006 | 011-020 | Folder/file-name discovery shall recognize known authority identifiers without changing source content. |
| FRS-PVK-007 | 020 | New authorities shall be addable through controlled taxonomy/configuration without module-domain changes. |
| FRS-PVK-008 | 021-028 | File discovery shall retain original relative path, file name, size and modification time. |
| FRS-PVK-009 | 023 | Ingestion shall calculate SHA-256 over acquired file bytes before considering a source unchanged. |
| FRS-PVK-010 | 024-025 | Unsupported/failed/empty extraction shall be explicitly recorded and excluded from production eligibility. |

## 5. Parsing and normalization

- Supported formats shall use existing governed parser interfaces.
- Parsed documents shall retain source path, normalized sections, page/block position where available, parser name/version, normalizer name/version and warnings.
- Parsing shall not silently discard warnings that may affect citation fidelity.
- Regulatory tables or structured content that cannot be reliably normalized shall be flagged for controlled review.

## 6. Chunking

| FRS ID | URS | Behavior |
|---|---|---|
| FRS-PVK-011 | 029-034 | `sectionAwareChunker` shall chunk within detected section context whenever possible. |
| FRS-PVK-012 | 030 | Chunk citation shall include document ID/title/path and section/page metadata where available. |
| FRS-PVK-013 | 032 | Chunk content hash shall use SHA-256 of normalized chunk text. |
| FRS-PVK-014 | 034 | Regulatory chunk metadata shall support authority, jurisdiction, document version, publication/effective dates, canonical source reference, source checksum and current/superseded status. |
| FRS-PVK-015 | 031 | Oversized section content may be split, but section identity/citation shall remain associated with each resulting chunk. |
| FRS-PVK-016 | 033 | Empty text, token-limit violation, missing citation/document ID and duplicate-content conditions shall be validated. |

Current default chunking parameters remain controlled configuration, currently max 800 tokens, target 600, overlap 80, minimum 20 unless separately changed and validated.

## 7. Embeddings

- Embedding provider shall implement the shared embedding-provider contract.
- Result shall record provider/model/dimensions/generation timestamp.
- Dimension mismatch shall fail the embedding operation.
- Provider timeout/unavailability shall fail explicitly.
- Re-embedding after model change shall create/rebuild a compatible index rather than mixing incompatible dimensions.

## 8. Retrieval

| FRS ID | URS | Behavior |
|---|---|---|
| FRS-PVK-017 | 038-040 | Search mode shall support keyword, semantic and hybrid modes. |
| FRS-PVK-018 | 042 | Tenant/client-private retrieval shall receive scope from server-authoritative authorization context. |
| FRS-PVK-019 | 043 | Each returned result shall contain a governed citation. |
| FRS-PVK-020 | 044-046 | Production retrieval shall filter by jurisdiction/version and lifecycle status, include only approved/effective sources for the applicable effective date, and exclude sources whose lifecycle status is unknown. Historical/date-scoped retrieval may include superseded sources when explicitly requested and shall preserve their superseded status in citations. |
| FRS-PVK-021 | 048 | Zero approved results shall return an explicit empty/no-approved-context result. |
| FRS-PVK-022 | 049 | Retrieval shall write an audit event with query hash, repository/version, result count and citation IDs without unnecessarily storing sensitive free text. |
| FRS-PVK-023 | 050 | AI context pack shall retain controlled citations and repository manifest/version provenance. |

## 9. Target hybrid architecture

The current controlled PostgreSQL pgvector/keyword path remains supported during migration.

Target shared interfaces:
- `EmbeddingService`
- `VectorStore`
- `SearchIndex`
- `RetrievalService`
- `RerankingService`
- `ModelGateway`

Qdrant shall implement vector retrieval behind `VectorStore`.  
Elasticsearch shall implement lexical/search projection behind `SearchIndex`.  
Neither shall determine authorization or regulated record authority.

## 10. Governance states

Recommended source lifecycle:
`CATALOGUED -> ACQUIRED -> REVIEWED -> APPROVED/EFFECTIVE -> SUPERSEDED/RETIRED`.

A state transition into production eligibility shall require authorized approval and audit attribution.

A source update shall not overwrite the prior checksum/version record.

## 11. Impact assessment

When a source is changed or superseded, the application/process shall create or support an impact record containing:
- changed source/version;
- previous source/version;
- effective date;
- affected module/domain tags;
- potentially linked URS/FRS IDs;
- potentially impacted tests/SOP/User Guide;
- assigned reviewer;
- disposition;
- implementation deadline when applicable.

## 12. Security

- Source acquisition credentials, if any, shall be environment secrets.
- HTML/PDF/text content shall be processed as untrusted input.
- Prompt injection inside retrieved source/reference content shall not alter system-level authorization/security policy.
- Client-private knowledge queries shall fail closed for tenant/workspace mismatch.
- Administrative write actions shall require Nexus permissions.
- Audit records shall capture denied administrative actions where applicable.

## 13. Verification set

Minimum Sprint 1 verification shall cover:
1. known regulator taxonomy recognition;
2. UNKNOWN source handling;
3. checksum repeatability;
4. unchanged-source detection;
5. section-aware chunk citation;
6. chunk hash repeatability;
7. invalid/empty source failure;
8. embedding dimension mismatch failure;
9. semantic/keyword/hybrid retrieval modes;
10. zero-result behavior;
11. approved-only production retrieval;
12. source citation output;
13. retrieval audit event;
14. cross-tenant negative retrieval where tenant data is involved;
15. production retrieval excludes unknown/non-effective sources while explicit historical/date-scoped retrieval can return correctly labelled superseded sources.

## 14. Traceability
All FRS items shall be mapped to implementation/tests in the Sprint 1 traceability matrix before qualification.
