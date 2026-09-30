# Nexus Modular Next-Generation Platform Charter

Document ID: NEXUS-ARCH-CHARTER-001  
Status: Governing architecture and cleanup charter  
Applies to: Nexus platform core and all PV modules  
Purpose: Permanent reference for cleanup, modernization, URS/FRS, architecture, implementation, validation and release decisions.

---

## 1. Program objective

The cleanup program is not only code cleanup.

It is a controlled modernization program to produce a modular, secure, regulator-aware, AI-enabled pharmacovigilance platform in which:

- Nexus owns shared platform capabilities;
- modules remain independently deployable/entitleable;
- one, two or any supported combination of modules can be provided to a client;
- modules can connect through stable contracts without bespoke rewiring;
- regulated PV behavior is traceable to authoritative sources;
- market-leading PV products are used as capability benchmarks;
- architecture rules are machine enforced;
- AI is used deliberately behind controlled interfaces;
- clean code, security, validation and evidence are mandatory release conditions.

---

## 2. The nine mandatory principles and gates

Every sprint, PR and release candidate must satisfy the following nine gates.

### Gate 1 — Karpathy

- understand before editing;
- smallest correct change;
- no speculative rewrite;
- verify after material change.

### Gate 2 — Ponytail

- remove accidental complexity;
- avoid unjustified abstractions;
- prefer simple, maintainable design.

### Gate 3 — Architecture Guardian

- preserve canonical platform boundaries;
- Nexus owns shared capabilities;
- modules do not invent independent auth, tenancy, context, audit, evidence or infrastructure conventions;
- domain logic does not depend on vendor SDKs.

### Gate 4 — Warpath

- complete real workflows end to end;
- close edge cases, failure states, retries and negative paths;
- do not mark partial happy-path implementations as complete.

### Gate 5 — CodeRabbit

- independent code review;
- material unresolved findings block promotion.

### Gate 6 — Hacker Gate

- adversarial security testing;
- IDOR/BOLA;
- tenant/client/module boundary attacks;
- privilege escalation;
- session/token abuse;
- injection;
- hostile input/file paths;
- audit/evidence tampering;
- remediation and retest.

### Gate 7 — Evidence Gate

Traceability must exist through:

`Requirement -> Architecture -> Code -> Test -> Security -> Evidence -> Release`

### Gate 8 — Regulatory Knowledge Gate

- regulated requirements must trace to authoritative sources when available;
- source version/effective date must be controlled;
- jurisdictional differences must be explicit;
- model memory is not an authoritative regulatory source;
- changed regulator guidance must trigger impact assessment.

### Gate 9 — Modular & Benchmark Completeness Gate

- URS/FRS must be benchmarked against mature market tools;
- no material field, function, state, control, report, exception or workflow may be omitted simply because the current product does not yet contain it;
- each module must remain plug-and-play;
- combinations of modules must work through stable contracts;
- module independence and cross-module interoperability must both be tested.

---

## 3. Nexus vs Modules

### Nexus is the platform layer

Nexus owns shared capabilities such as:

- identity and authentication;
- tenant management;
- client workspace management;
- environment context;
- module entitlement;
- workspace membership;
- module roles and permissions;
- AuthorizationService;
- AuditService;
- EvidenceService;
- ModelGateway;
- EmbeddingService;
- RetrievalService;
- RerankingService;
- EventBus;
- CacheStore;
- SearchIndex;
- VectorStore;
- ObjectStore;
- observability;
- configuration;
- feature controls;
- common security controls;
- common validation and release evidence.

### Modules are bounded PV capabilities

Each module owns its own regulated domain behavior and module-specific workflow.

Core module sequence:

1. Literature Screening
2. Intake & Triage
3. L2A / Case Processing
4. Submissions
5. Signal Management
6. Aggregate Reporting
7. PV Documentation
8. additional governed modules such as Product Matrix / MICC when in scope

The sequence represents the normal end-to-end PV lifecycle. It must not become a hard technical chain.

---

## 4. Plug-and-play module principle

A client must be able to receive:

- one module;
- two modules;
- several modules;
- the full suite.

Supported combinations must not require bespoke rewiring of authentication, tenancy, audit, evidence or infrastructure.

Examples:

- Literature Screening only
- Intake & Triage only
- Literature + Intake
- Intake + L2A
- L2A + Submissions
- Literature + Submissions
- Literature + Signal
- Signal + Aggregate Reporting
- PV Documentation with selected upstream data sources
- full Literature -> Intake -> L2A -> Submissions -> Signal -> Aggregate -> Documentation suite

### Important consequence

The normal lifecycle is:

`Literature -> Intake -> L2A -> Submissions -> Signal -> Aggregate -> PV Documentation`

But the architecture must also support non-linear commercial combinations.

For example:

`Literature -> Submissions`

may be provided when the contracted use case is to identify/report a supported literature-derived safety output without requiring the client to purchase the full Intake/L2A user experience.

That does not mean Submissions bypasses required regulatory data validation.

It means the integration contract must be capable of receiving a canonical submission-ready payload from an approved upstream service/module.

---

## 5. Module contract model

Modules connect through versioned contracts rather than internal implementation knowledge.

Preferred mechanisms:

### Synchronous

- application-service interfaces;
- versioned internal APIs;
- canonical DTOs;
- server-side authorization on every protected operation.

### Asynchronous

- typed/versioned domain events through EventBus/Kafka;
- idempotent consumers;
- retry/dead-letter handling;
- outbox/equivalent consistency pattern.

Example canonical events:

- `LITERATURE_HIT_ACCEPTED`
- `PV_CASE_CANDIDATE_CREATED`
- `INTAKE_ACCEPTED`
- `CASE_CREATED`
- `CASE_UPDATED`
- `CASE_FINALIZED`
- `SUBMISSION_READY`
- `SUBMISSION_TRANSMISSION_ATTEMPTED`
- `SUBMISSION_ACKNOWLEDGED`
- `SIGNAL_INPUT_AVAILABLE`
- `AGGREGATE_DATASET_UPDATED`
- `PV_DOCUMENT_SOURCE_UPDATED`

No module should require knowledge of another module's tables or private functions.

---

## 6. Next-generation AI and data architecture

The platform should use advanced AI and data capabilities where they solve a demonstrated problem.

### Core technologies

- LLMs
- governed model gateway
- LangChain
- LangGraph
- vector database / Qdrant
- Elasticsearch
- PostgreSQL
- Redis
- Kafka
- embeddings
- semantic retrieval
- hybrid lexical + vector retrieval
- reranking
- RAG
- structured extraction
- AI evaluation
- prompt/policy registry
- observability/tracing
- human-in-the-loop review
- controlled domain decision services

### LangChain

Use for governed composition of:
- LLM calls;
- retrieval;
- tools;
- structured output;
- prompt/policy layers.

Do not put binding PV rules inside opaque chains.

### LangGraph

Use for stateful/multi-step AI workflows such as:
- intake extraction;
- literature evidence extraction;
- source verification;
- controlled enrichment;
- human-review pause/resume;
- retry paths;
- agent/tool orchestration.

Authoritative regulated state remains outside the graph in governed stores/services.

### Vector database / Qdrant

Use for:
- semantic regulator knowledge retrieval;
- similar literature context;
- similar controlled case context where legally/contractually permitted;
- SOP/controlled-document retrieval;
- source-linked RAG.

Authorization filters must be generated by the platform before retrieval.

### Elasticsearch

Use for:
- exact lexical search;
- identifiers;
- drug/product terms;
- MedDRA-like terms where licensed/appropriate;
- PMID/DOI;
- regulatory identifiers;
- operational search;
- full-text retrieval.

### Hybrid retrieval

For regulated knowledge retrieval:

`Authorization -> Lexical Search + Vector Search -> Fusion -> Reranking -> Source-linked Context`

### Redis

Use for:
- cache;
- rate limiting;
- distributed coordination;
- short-lived execution state;
- idempotency support where appropriate.

Never use Redis as the sole regulated source of truth.

### Kafka

Use for:
- module decoupling;
- domain events;
- asynchronous processing;
- integration;
- reliable workflow continuation.

### PostgreSQL

Use as authoritative system of record for:
- regulated transactional state;
- tenancy/workspaces;
- entitlements;
- configuration;
- workflow state;
- authoritative audit/evidence metadata where designed.

---

## 7. LLM strategy

### General LLMs

General-purpose approved models can assist with:
- extraction;
- summarization;
- translation support;
- narrative drafting support;
- semantic classification;
- knowledge retrieval;
- anomaly/gap detection.

### Specialized / organization-tuned models

The platform may support a privately governed PV-specialized model or adapter layer for specific tasks.

Potential approaches:
- supervised fine-tuning where justified;
- preference tuning;
- domain adapters;
- retrieval-augmented specialization;
- task-specific classifiers;
- small local/private models for deterministic bounded tasks.

### Decision-making rule

A trained/personal/domain LLM must **not become the sole authority for regulated PV decisions**.

For high-impact decisions, use an explicit decision stack:

`Authoritative Rules + Controlled Knowledge + Deterministic Logic + Model Assistance + Human Review where required`

Examples:
- ICSR validity;
- seriousness;
- reportability;
- listedness/expectedness;
- submission destination;
- regulatory clock;
- final medical assessment.

Model outputs must include provenance and confidence/uncertainty where appropriate.

---

## 8. Regulatory knowledge loading

The platform will maintain a controlled regulatory knowledge corpus.

### Authoritative source examples

- EMA GVP modules, annexes and addenda
- ICH E2 series
- CDSCO / PvPI / IPC guidance
- FDA safety reporting guidance and technical implementation material
- MHRA
- Health Canada
- TGA
- PMDA/MHLW
- WHO PV guidance
- EudraVigilance / E2B implementation material
- jurisdiction-specific technical specifications where applicable

See:
`docs/pv-knowledge/REGULATORY_SOURCE_REGISTER.md`

Current verified source discovery inventory:
`docs/pv-knowledge/OFFICIAL_SOURCE_INVENTORY_2026-09-30.md`

### Ingestion lifecycle

```text
Official source
   ↓
Acquisition + checksum
   ↓
Version/effective-date metadata
   ↓
Parsing
   ↓
Structure-aware chunking
   ↓
Chunk metadata
   ↓
Embedding
   ↓
Vector store
   ↓
Lexical index
   ↓
Controlled retrieval
```

### Chunking requirements

Chunks should preserve meaningful regulatory structure whenever available:

- authority
- jurisdiction
- document
- version/revision
- effective date
- module/chapter
- section
- heading hierarchy
- paragraph
- tables/notes where parsable
- source URL/reference
- checksum
- superseded/current status

Avoid arbitrary fixed-size chunking where it would separate a rule from qualifiers, exceptions or definitions.

### Embedding requirements

- embedding model/version recorded;
- ingestion timestamp recorded;
- source version linked;
- embeddings rebuildable;
- old source versions retained;
- retrieval can filter by jurisdiction, authority, status and effective date.

### Retrieval requirements

Every regulated RAG answer should be capable of returning:
- source document;
- section;
- version;
- jurisdiction;
- supporting chunks;
- retrieval timestamp;
- model/provenance metadata.

---

## 9. Market benchmarking for URS and FRS

URS and FRS must not be written only from the current application.

Every module must be benchmarked against relevant mature market products.

Reference panel:

- Oracle Argus Safety
- Veeva Safety
- ArisGlobal LifeSphere Safety / MultiVigilance / relevant Advanced products
- Ennov PV
- specialist market tools where they materially lead a specific module capability

### Benchmark objective

For each module build a matrix:

| Capability | Current state | Argus | Veeva | ArisGlobal | Ennov | Regulatory basis | Target | Evidence |
|---|---|---|---|---|---|---|---|---|

### Completeness rule

Benchmarking must include more than visible screens.

Assess:
- fields;
- data types;
- required/optional logic;
- workflow states;
- role actions;
- validations;
- controlled terminology;
- duplicates;
- follow-up;
- audit;
- evidence;
- source provenance;
- reports;
- exports;
- regulatory clocks;
- acknowledgements;
- retries;
- error handling;
- amendments;
- nullifications;
- integrations;
- APIs;
- configuration;
- administration;
- security;
- data retention;
- inspection/audit readiness;
- performance/operational controls;
- AI-assistance controls;
- human override/review;
- explainability/provenance.

No feature is copied merely because a competitor has it. The benchmark identifies capability gaps; regulatory/business applicability determines inclusion.

---

## 10. Module-specific benchmark direction

### Literature Screening

Benchmark:
- ArisGlobal Literature Intelligence class capability;
- mature enterprise safety literature workflows;
- regulator requirements.

Include:
- search strategies;
- schedules;
- ad hoc searches;
- source governance;
- duplicate handling;
- article acquisition;
- evidence package;
- relevance;
- ICSR potential;
- patient extraction;
- labeling context;
- causality support;
- medical review;
- handoff;
- testing vs regulated-search distinction.

### Intake & Triage

Benchmark:
- ArisGlobal Advanced Intake;
- Veeva Safety automation;
- Ennov intelligent intake;
- Argus mature intake controls.

### L2A / Case Processing

Benchmark:
- Argus;
- Veeva;
- LifeSphere;
- Ennov.

### Submissions

Benchmark:
- Argus;
- Veeva;
- LifeSphere;
- Ennov;
- regulator E2B/acknowledgement requirements.

### Signal Management

Benchmark:
- Oracle Empirica;
- ArisGlobal Advanced Signals;
- Ennov Signal;
- regulator signal-management guidance.

### Aggregate Reporting

Benchmark:
- mature aggregate/periodic reporting products and applicable ICH/GVP requirements.

### PV Documentation

Benchmark:
- enterprise controlled-document/compliance systems plus applicable PV documentation requirements.

---

## 11. Cleanup method

For every module:

```text
Regulatory Source Pack
      +
Market Benchmark Matrix
      +
Existing Behavior Characterization
      ↓
URS
      ↓
FRS
      ↓
Canonical Architecture
      ↓
Implementation / Cleanup
      ↓
Module Contract Tests
      ↓
PV Functional Tests
      ↓
Security Tests
      ↓
AI/Retrieval Evaluation
      ↓
Audit/Evidence Verification
      ↓
CodeRabbit + Hacker + Evidence Gates
```

---

## 12. What cleanup must achieve

Cleanup includes:

- dead-code classification/removal;
- duplication reduction;
- dependency cleanup;
- architecture reconciliation;
- server-side authorization consistency;
- modular boundaries;
- shared platform interfaces;
- secure module contracts;
- standardized audit/evidence;
- knowledge provenance;
- dependency/security remediation;
- reliable eventing;
- AI abstraction;
- observability;
- tests and traceability.

Cleanup must preserve approved regulated behavior unless an intentional change is separately governed.

---

## 13. Definition of a plug-and-play module

A module is not plug-and-play merely because it has its own page.

It is plug-and-play when it has:

- its own URS/FRS scope;
- declared inputs and outputs;
- versioned module contract;
- explicit dependencies;
- entitlement;
- roles/permissions;
- configuration schema;
- audit contract;
- evidence contract;
- health/observability;
- migration requirements;
- integration tests;
- standalone deployment/configuration path where supported;
- combination tests with adjacent and non-adjacent supported modules.

---

## 14. Permanent decision rule

When future work creates tension between:
- speed,
- market benchmark,
- AI capability,
- architecture,
- regulatory correctness,

the priority is:

1. patient/safety-data integrity;
2. regulatory correctness;
3. security and tenant/client isolation;
4. audit/evidence integrity;
5. validated workflow correctness;
6. modular architecture;
7. maintainability;
8. performance/cost optimization;
9. feature speed.

This charter is a governing reference for every subsequent sprint.


---

## 15. Documentation Quality Rule — Global Writing Convention

URS, FRS and User Guides are controlled lifecycle documents and must be written to a globally professional, audit-ready standard.

### General writing principles

- clear, concise and unambiguous language;
- one requirement or instruction per statement where practical;
- avoid vague terms such as "user friendly", "fast", "appropriate", "etc.", "as required" unless explicitly defined;
- use consistent terminology, abbreviations and role names;
- define acronyms at first use;
- distinguish mandatory requirements from explanatory notes;
- use active voice where it improves clarity;
- use normative wording consistently:
  - **shall** = mandatory system requirement;
  - **should** = recommended practice;
  - **may** = permitted option;
  - **must not / shall not** = prohibited behavior;
- avoid hidden assumptions;
- identify preconditions, triggers, outputs, exceptions and failure states;
- preserve version, author/reviewer/approval status and change history.

### URS convention

Each URS requirement should be:
- uniquely identified;
- atomic;
- necessary;
- solution-independent where possible;
- measurable/testable;
- traceable to business/regulatory/quality needs;
- classified by module, role, criticality and regulatory relevance where applicable.

Preferred structure includes:
- purpose and scope;
- intended use;
- system context;
- users/roles;
- business processes;
- functional requirements;
- data requirements;
- security/access requirements;
- audit/evidence requirements;
- regulatory requirements;
- integration requirements;
- availability/performance requirements;
- data retention/archiving;
- business continuity/recovery;
- reporting;
- AI/automation requirements;
- assumptions/constraints;
- out-of-scope;
- acceptance criteria;
- traceability references.

### FRS convention

FRS must translate each approved URS requirement into detailed, implementable and testable system behavior.

FRS should include:
- unique FRS IDs;
- linked URS IDs;
- field-level behavior;
- data type/format/length;
- required/optional/conditional status;
- default values;
- controlled terminology;
- validation logic;
- calculations;
- state transitions;
- role/permission behavior;
- error handling;
- retry behavior;
- duplicate/follow-up handling;
- audit events;
- evidence outputs;
- APIs/events/contracts;
- external-system behavior;
- configuration;
- logging/monitoring;
- performance expectations;
- security controls;
- AI/model behavior and provenance;
- exception and boundary conditions;
- positive and negative acceptance criteria.

### User Guide convention

User Guides must describe the actual released behavior, not planned functionality.

They should include:
- document purpose/scope;
- intended audience;
- roles and prerequisites;
- login/context/module access;
- screen/workspace orientation;
- step-by-step procedures;
- field explanations;
- expected results;
- warnings/cautions;
- errors and recovery;
- role-specific differences;
- approval/review flows;
- audit/evidence implications where relevant;
- screenshots/illustrations when maintained;
- troubleshooting;
- FAQs where useful;
- known limitations;
- glossary;
- version/release applicability.

Instructions should use task-oriented language and observable user actions.

### Global convention references

Writing should be broadly aligned with internationally used documentation/requirements principles such as:
- ISO/IEC/IEEE 29148 concepts for requirements quality and traceability;
- ISO/IEC/IEEE 26514 concepts for user documentation;
- controlled-document practices used in regulated GxP environments;
- applicable GAMP-style lifecycle and traceability expectations.

These are writing/quality references; applicable PV regulations and company procedures remain the governing domain requirements.

### Documentation completeness gate

A sprint cannot close when code is complete but documentation is:
- incomplete;
- ambiguous;
- outdated;
- inconsistent with released behavior;
- missing traceability;
- missing field/state/exception detail;
- written only as a high-level overview.

URS, FRS and User Guide quality are part of release evidence.
