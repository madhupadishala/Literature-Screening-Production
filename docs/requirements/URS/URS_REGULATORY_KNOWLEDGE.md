# URS — Controlled Pharmacovigilance Regulatory Knowledge Foundation

Document ID: URS-PV-KNOW-001  
Version: 1.0-draft  
Status: Sprint 1 controlled draft  
Applies to: Nexus shared Regulatory Knowledge capability  
Writing convention: ISO/IEC/IEEE 29148-aligned requirements style; `shall` denotes a mandatory requirement.

## 1. Purpose
This URS defines user, regulatory, quality, security and lifecycle requirements for acquiring, governing, chunking, embedding, indexing, retrieving and maintaining authoritative pharmacovigilance knowledge used by Nexus and its plug-and-play modules.

## 2. Intended use
The capability shall provide a controlled, source-linked knowledge foundation for:
- requirement derivation and impact assessment;
- regulator-aware PV workflows;
- human review support;
- RAG and semantic retrieval;
- deterministic rule development;
- validation/test-case design;
- inspection/audit evidence.

The capability shall not itself make final regulated PV decisions solely from LLM output.

## 3. User roles
- Platform Regulatory Administrator
- PV/Regulatory Reviewer
- Quality Approver
- Knowledge Administrator
- Module Product Owner
- Validation/QA Reviewer
- Auditor/Inspector read-only role
- Authorized system service identity

## 4. Authoritative source requirements

| ID | Requirement |
|---|---|
| URS-PVK-001 | The system shall maintain a controlled register of authoritative regulatory and harmonised PV sources applicable to supported jurisdictions and modules. |
| URS-PVK-002 | Each source shall record authority, jurisdiction, title, canonical source reference, version/revision where available, publication date where available, effective date where available and lifecycle status. |
| URS-PVK-003 | Cataloguing a source shall not be represented as successful full-text ingestion. |
| URS-PVK-004 | Full-text acquisition shall record a cryptographic checksum of the acquired artifact/content. |
| URS-PVK-005 | The system shall preserve superseded source versions required for historical traceability. |
| URS-PVK-006 | The system shall distinguish authoritative regulatory sources from controlled internal interpretations and non-authoritative reference material. |
| URS-PVK-007 | Draft regulator guidance shall be explicitly identified as draft and shall not silently become a mandatory production rule. |
| URS-PVK-008 | The system shall support jurisdiction-specific applicability rather than collapsing conflicting regulator requirements into one generic global rule. |
| URS-PVK-009 | Production retrieval shall use only knowledge objects approved for production use. |
| URS-PVK-010 | The platform shall not claim jurisdictional/global regulatory coverage unless the applicable source pack and jurisdiction-specific validation evidence are present. |

## 5. Current source-universe requirements

| ID | Requirement |
|---|---|
| URS-PVK-011 | The source register shall support EMA/GVP material. |
| URS-PVK-012 | The source register shall support the applicable ICH E2 guideline family and implementation material. |
| URS-PVK-013 | The source register shall support CDSCO, PvPI and IPC India material applicable to MAH/PV obligations. |
| URS-PVK-014 | The source register shall support applicable FDA postmarketing safety and electronic-reporting material. |
| URS-PVK-015 | The source register shall support MHRA pharmacovigilance material and GB/NI applicability distinctions where relevant. |
| URS-PVK-016 | The source register shall support Health Canada PV material and notices/clarifications. |
| URS-PVK-017 | The source register shall support TGA sponsor pharmacovigilance material. |
| URS-PVK-018 | The source register shall support PMDA/MHLW material, including controlled handling of translations where authoritative material is not available in English. |
| URS-PVK-019 | The source register shall support applicable WHO PV guidance while preserving its normative status relative to binding jurisdictional requirements. |
| URS-PVK-020 | Additional regulator packs shall be addable without changing module-domain code. |

## 6. Acquisition and ingestion requirements

| ID | Requirement |
|---|---|
| URS-PVK-021 | Regulatory source acquisition shall be reproducible and attributable to an official source. |
| URS-PVK-022 | The system shall retain the canonical source URL/reference and acquisition timestamp. |
| URS-PVK-023 | The system shall detect unchanged source artifacts using checksums where technically possible. |
| URS-PVK-024 | Failed, partial or unsupported ingestion shall fail visibly and shall not produce production-eligible knowledge. |
| URS-PVK-025 | Parsing warnings shall be retained with the ingestion evidence. |
| URS-PVK-026 | Source language shall be recorded. |
| URS-PVK-027 | Where translation is required, the original authoritative source shall remain linked and translation provenance shall be retained. |
| URS-PVK-028 | Acquisition/ingestion shall not depend on an LLM to determine whether a source is authoritative. |

## 7. Chunking requirements

| ID | Requirement |
|---|---|
| URS-PVK-029 | Regulatory documents shall use structure-aware chunking that attempts to preserve heading/section/paragraph context. |
| URS-PVK-030 | Chunking shall preserve source citation metadata sufficient to trace each chunk to its document and section/page where available. |
| URS-PVK-031 | The system shall avoid arbitrary splitting that separates a mandatory rule from a directly associated qualifier or exception where structure can be preserved. |
| URS-PVK-032 | Each chunk shall have a deterministic content checksum/hash. |
| URS-PVK-033 | Chunk validation shall reject empty/malformed chunks and shall identify duplicate-content conditions. |
| URS-PVK-034 | Chunk metadata shall include authority, jurisdiction, version/revision, effective date and source lifecycle status when available. |

## 8. Embedding and indexing requirements

| ID | Requirement |
|---|---|
| URS-PVK-035 | Embedding model/provider/version and vector dimensions shall be recorded. |
| URS-PVK-036 | Embeddings shall be rebuildable from approved source content. |
| URS-PVK-037 | Vector retrieval shall not be an authorization authority. |
| URS-PVK-038 | The system shall support semantic retrieval. |
| URS-PVK-039 | The system shall support lexical/exact retrieval for identifiers and regulated terminology. |
| URS-PVK-040 | The target architecture shall support hybrid retrieval and reranking behind shared Nexus interfaces. |
| URS-PVK-041 | Search/index projections shall not become the authoritative regulated source of truth. |

## 9. Retrieval and RAG requirements

| ID | Requirement |
|---|---|
| URS-PVK-042 | Authorization scope shall be resolved before tenant/client-specific retrieval. |
| URS-PVK-043 | A regulated retrieval response shall provide source-linked citations. |
| URS-PVK-044 | Retrieval shall allow filtering by authority, jurisdiction, status, effective date and module/domain applicability where available. |
| URS-PVK-045 | Retrieval shall distinguish current/effective sources from superseded sources. |
| URS-PVK-046 | Historical-case evaluation shall be capable of retrieving the source version effective at the applicable historical date where such source history is available. |
| URS-PVK-047 | LLM-generated answers shall not obscure the underlying authoritative citations used. |
| URS-PVK-048 | When no approved controlled knowledge supports a query, the system shall return an explicit no-approved-context condition rather than invent support. |
| URS-PVK-049 | Knowledge retrieval affecting a regulated workflow shall be auditable. |
| URS-PVK-050 | AI provenance shall record model/version, governed context/citations and relevant request/context identifiers when AI output affects a regulated workflow. |

## 10. Governance and lifecycle requirements

| ID | Requirement |
|---|---|
| URS-PVK-051 | Regulatory sources shall have lifecycle states including at minimum catalogued, acquired, reviewed, approved/effective, superseded and retired/not-applicable equivalents. |
| URS-PVK-052 | Approval of a regulatory source for production use shall require an authorized reviewer/approver. |
| URS-PVK-053 | The system shall retain approval attribution and timestamps. |
| URS-PVK-054 | A newly published or revised regulator source shall trigger a documented impact-assessment workflow. |
| URS-PVK-055 | Impact assessment shall identify potentially affected URS, FRS, code, tests, SOPs/user guidance and validation evidence. |
| URS-PVK-056 | The system shall prevent silent replacement of an effective regulatory source by a newer unapproved source. |
| URS-PVK-057 | Regulatory interpretation decisions shall be separable from verbatim source content and shall carry their own approval/version status. |

## 11. Security and data-integrity requirements

| ID | Requirement |
|---|---|
| URS-PVK-058 | Knowledge-administration actions shall be role/permission controlled. |
| URS-PVK-059 | Source/checksum/version metadata used as release evidence shall be tamper-evident through controlled storage/audit mechanisms. |
| URS-PVK-060 | Tenant/client confidential knowledge shall not be retrievable across tenant/client boundaries. |
| URS-PVK-061 | Public regulatory knowledge and client-specific knowledge shall be distinguishable by scope. |
| URS-PVK-062 | Secrets/credentials used for approved source access shall not be committed to Git. |
| URS-PVK-063 | Retrieval inputs shall be handled defensively against injection and malicious-content risks. |
| URS-PVK-064 | Retrieved regulatory text shall be treated as data/context and shall not be allowed to override system security policy or authorization. |

## 12. Performance and availability requirements

| ID | Requirement |
|---|---|
| URS-PVK-065 | Routine retrieval shall have defined and testable service-level targets before production qualification. |
| URS-PVK-066 | Index/vector rebuild failure shall not corrupt the authoritative knowledge registry. |
| URS-PVK-067 | The system shall provide health/status evidence for required knowledge dependencies. |
| URS-PVK-068 | Reprocessing unchanged artifacts should be avoided when reliable checksums show no change. |

## 13. Documentation and validation requirements

| ID | Requirement |
|---|---|
| URS-PVK-069 | Each production knowledge release shall be traceable to its source register and manifest/checksums. |
| URS-PVK-070 | Positive and negative retrieval tests shall be maintained for regulator/source/version/jurisdiction filtering. |
| URS-PVK-071 | Validation shall include source-to-chunk traceability checks. |
| URS-PVK-072 | Validation shall include retrieval citation correctness checks. |
| URS-PVK-073 | The User Guide shall describe only released knowledge-admin behavior. |
| URS-PVK-074 | Known limitations and regulator packs not yet fully ingested shall be explicitly documented. |

## 14. Out of scope for Sprint 1
- claiming complete global regulatory coverage;
- replacing qualified regulatory interpretation by autonomous AI;
- medical dictionary licensing/content not legally available;
- final module-specific regulatory decisions, which are handled in the respective module sprints.

## 15. Acceptance
Sprint 1 URS is satisfied only when requirements are traced into the FRS, the controlled source catalog exists, the ingestion metadata model supports required provenance, and verification evidence demonstrates source classification and traceability without overstating ingestion coverage.
