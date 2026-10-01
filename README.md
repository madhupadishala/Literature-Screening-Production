# Nexus Platform — Zero-Deviation Cleanup & Next-Generation Modernization

> **Status:** Controlled cleanup / modernization program  
> **Working branch:** `cleanup/zero-deviation-baseline-20260930`  
> **Rule:** Preserve intended regulated behavior while upgrading architecture, security, maintainability and platform capability.

---

## 1. Why this program exists

The current codebase contains valuable, working pharmacovigilance capability across:

- Literature Screening
- Intake & Triage
- L2A / Case Processing
- QC and Medical Review
- Evidence / Export
- early Submissions capability
- shared platform services

The objective is **not to rebuild everything from scratch**.

The objective is to:

1. establish where the current codebase actually stands;
2. benchmark it against mature market platforms and modern engineering standards;
3. preserve correct PV behavior;
4. remove accidental complexity, dead code and duplication;
5. correct architecture drift;
6. harden identity, tenant/client isolation and security;
7. introduce deliberate next-generation platform capabilities;
8. validate every change against URS/FRS and objective evidence;
9. export one qualified clean source snapshot into a new production repository.

---

## 2. Ten mandatory engineering, product-design and regulatory gates

Every sprint, pull request, release candidate and promoted change in this program must satisfy all applicable gates. Material UI changes must satisfy Product Design Guardian in addition to the engineering, security and regulatory gates.

### 2.1 Karpathy Gate
- understand before editing;
- make the smallest correct change;
- avoid speculative rewrites;
- verify behavior after every material change.

### 2.2 Ponytail Gate
- remove accidental complexity;
- avoid abstractions without demonstrated need;
- prefer clear, local, maintainable implementations.

### 2.3 Product Design Guardian Gate
- Figma is the design source of truth for material screen redesigns;
- IBM Carbon is the primary benchmark for dense enterprise forms, tables, worklists and operational information architecture;
- PatternFly is a secondary enterprise workflow/admin benchmark;
- Radix provides accessibility/interaction reference patterns;
- shadcn/ui is the preferred component-composition benchmark for React implementation;
- material UI work follows Requirement -> Wireframe -> Design -> Review -> Implementation -> Browser Verification;
- fake controls, one-off page design systems, inconsistent status semantics and missing loading/error/empty states block design qualification;
- browser visual verification and accessibility/interaction evidence are required for material UI changes.

Controlled references:
- `docs/design/PRODUCT_DESIGN_SYSTEM.md`
- `docs/design/PRODUCT_DESIGN_GUARDIAN.md`
- `npm run design:verify`

### 2.4 Architecture Guardian Gate
- enforce the canonical platform architecture;
- prevent modules from inventing their own auth, tenancy, storage, audit or AI infrastructure;
- keep domain rules independent from vendor SDKs.

### 2.5 Warpath Gate
- test complete real workflows;
- include unhappy paths, retries, invalid transitions and operational failures;
- do not call a feature complete when only the happy path works.

### 2.6 CodeRabbit Gate
- independent machine code review on cleanup PRs;
- material unresolved findings block qualification.

### 2.7 Hacker Gate
- adversarial security testing;
- tenant/client boundary attacks;
- IDOR/BOLA;
- privilege escalation;
- replay/session abuse;
- injection;
- hostile uploads;
- audit/evidence tampering;
- remediation followed by retest.

### 2.8 Evidence Gate
Every qualified change must be traceable through:

`Regulatory/Business Requirement -> URS -> FRS -> Architecture -> Code -> Test -> Security -> Evidence -> Release`

### 2.9 Regulatory Knowledge Gate
- regulated PV requirements must trace to authoritative regulator/harmonised sources where available;
- source version, jurisdiction and effective date must be controlled;
- model memory is not an authoritative regulatory source;
- jurisdictional differences must remain explicit;
- regulator changes trigger impact assessment across URS/FRS/code/tests/SOPs.

### 2.10 Modular & Benchmark Completeness Gate
- Nexus and modules must remain architecturally separated;
- every module must be plug-and-play and entitleable independently or in supported combinations;
- URS/FRS must be benchmarked against mature market tools;
- no material field, workflow state, validation, exception, audit/evidence requirement, report, integration or control may be omitted merely because the current product lacks it;
- module contracts and supported combinations must be tested.

---

## 3. Platform charter: modular Nexus + plug-and-play PV modules

The cleanup program is governed by:

`docs/architecture/NEXUS_MODULAR_NEXTGEN_CHARTER.md`

This charter is a mandatory reference for every sprint.

### Nexus-level hierarchy

Nexus owns shared platform capabilities:

```text
Identity
  ↓
Tenant
  ↓
Client Workspace
  ↓
Environment
  ↓
Module Entitlement
  ↓
Workspace Membership
  ↓
Module Role
  ↓
Permission
```

Shared capabilities such as authentication, authorization, audit, evidence, AI gateway, retrieval, events, observability and infrastructure abstractions belong at Nexus level rather than being recreated independently inside modules.

### Module-level architecture

Core PV module lifecycle:

```text
Literature Screening
    ↓
Intake & Triage
    ↓
L2A / Case Processing
    ↓
Submissions
    ↓
Signal Management
    ↓
Aggregate Reporting
    ↓
PV Documentation
```

This is the normal lifecycle, **not a mandatory commercial dependency chain**.

The product must support plug-and-play combinations such as:

- Literature only
- Intake only
- Literature + Intake
- Intake + L2A
- L2A + Submissions
- Literature + Submissions
- Literature + Signal
- Signal + Aggregate
- selected modules plus PV Documentation
- complete end-to-end suite

A client should be able to license one, two, several or all modules without bespoke rewiring.

Modules connect through stable, versioned APIs/contracts/events rather than importing one another's private implementation or tables.

### Next-generation AI objective

The cleanup also establishes a governed advanced-AI capability layer using, where justified:

- LLMs
- ModelGateway
- LangChain
- LangGraph
- Qdrant/vector database
- Elasticsearch
- embeddings
- semantic retrieval
- hybrid lexical + semantic retrieval
- reranking
- RAG
- PostgreSQL
- Redis
- Kafka
- prompt/policy registry
- evaluation
- observability/tracing
- human-in-the-loop control
- privately governed/domain-tuned models when justified

AI must assist regulated decision-making without becoming an untraceable sole authority. High-impact PV decisions use controlled regulatory knowledge, deterministic domain rules, model assistance and human review where required.

### Controlled regulatory knowledge loading

Applicable regulator and harmonised guidance is maintained as a versioned controlled corpus.

Process:

```text
Official Regulatory Source
        ↓
Acquisition + Checksum + Version Metadata
        ↓
Structure-aware Parsing
        ↓
Regulatory Chunking
        ↓
Embeddings
        ↓
Vector Store + Lexical Index
        ↓
Authorized Retrieval / Reranking
        ↓
Source-linked AI / Human Workflow
```

Chunk metadata must retain authority, jurisdiction, document, revision/version, effective date, section hierarchy, source reference, checksum and current/superseded status.

See:

- `docs/pv-knowledge/REGULATORY_SOURCE_REGISTER.md`
- `docs/pv-knowledge/OFFICIAL_SOURCE_INVENTORY_2026-09-30.md`
- `docs/architecture/NEXUS_MODULAR_NEXTGEN_CHARTER.md`

### URS/FRS benchmark rule

When creating or revising URS/FRS, use relevant established market tools as capability benchmarks, including:

- Oracle Argus Safety
- Veeva Safety
- ArisGlobal LifeSphere / relevant Advanced products
- Ennov PV
- specialist tools where they materially lead a specific capability

Benchmark all material:
- fields and data types;
- workflows and states;
- validation;
- roles/actions;
- configuration;
- audit/evidence;
- exceptions;
- duplicates/follow-up;
- coding/medical review;
- submission clocks/acknowledgements;
- reports/exports;
- APIs/integrations;
- administration;
- security;
- retention;
- operational controls;
- AI controls;
- provenance/explainability.

Market tools are references for completeness and maturity; regulatory applicability and our controlled architecture determine the final implementation.

---

## 4. Market benchmark: heritage vs next-generation PV platforms

We do not copy any one commercial product. We use the strongest characteristics of several products as a market benchmark.

| Platform | Benchmark position | What we learn from it |
|---|---|---|
| **Oracle Argus Safety** | Heritage / mature enterprise core | deep case-processing controls, regulatory edge cases, reporting and submission maturity |
| **Veeva Safety** | Modern cloud / next-generation | unified cloud UX, lower-touch processing, integrated safety platform design |
| **ArisGlobal LifeSphere Safety** | Next-generation / AI-forward | AI-first intake, literature, signals, automation and unified safety lifecycle |
| **Ennov PV** | Modern unified compliance platform | configurable workflows, integrated PV lifecycle, traceability, AI-assisted processing |

### UI/design benchmark principle

For operational UI, we deliberately benchmark interaction quality and information density in addition to domain capability:

- **IBM Carbon** — primary benchmark for dense enterprise fields, worklists, data tables, filters, status and progressive disclosure;
- **PatternFly** — enterprise operations/admin workflow reference;
- **Radix** — accessible interaction primitives;
- **shadcn/ui** — composable React implementation patterns;
- **Figma** — controlled design source of truth;
- **Argus / established patient-safety systems** — domain workflow reference where relevant.

We do not visually clone any product or design system. We use these references to define a coherent product language suitable for regulated, data-dense patient-safety work.

The governing design documents are `docs/design/PRODUCT_DESIGN_SYSTEM.md` and `docs/design/PRODUCT_DESIGN_GUARDIAN.md`.

### Benchmark principle

We benchmark **capability class and control maturity**, not screen appearance.

The question is:

> Does our platform provide the same or better class of enterprise capability, regulatory control, security, traceability and automation?

Not:

> Does our UI look like Argus or Veeva?

---

## 5. PV and regulatory benchmark

The product must be governed by authoritative sources, not generic internet material.

Primary regulatory/harmonised references include, where applicable:

- EMA Good Pharmacovigilance Practices (GVP)
- ICH E2A
- ICH E2B(R3)
- ICH E2C / PBRER
- ICH E2D(R1)
- ICH E2E
- ICH E2F
- CDSCO / PvPI / Indian MAH pharmacovigilance guidance
- applicable FDA post-marketing safety-reporting guidance
- applicable EudraVigilance / regional electronic-reporting specifications

### Controlled PV knowledge classes

The knowledge layer separates:

1. **AUTHORITATIVE_REGULATORY**
   - regulator / ICH source material

2. **CONTROLLED_INTERNAL_INTERPRETATION**
   - approved decision tables
   - state-transition rules
   - internal SOP-aligned interpretation
   - validated test scenarios

3. **REFERENCE**
   - supporting technical or scientific information

AI retrieval must never treat these classes as equivalent without policy.

---

## 6. Canonical access architecture

The governing access hierarchy is:

```text
Identity
  ↓
Tenant
  ↓
Client Workspace
  ↓
Environment
  ↓
Module Entitlement
  ↓
Workspace Membership
  ↓
Module Role
  ↓
Permission
  ↓
Workflow Data
  ↓
Immutable Audit / Evidence
```

Context selection is not authority.

Every protected operation must be revalidated server-side against authoritative state.

Cross-tenant and cross-client access must fail closed.

---

## 7. Canonical code architecture

```text
Presentation / API
        ↓
Application Services ─────────→ Platform Interfaces ←──────── Infrastructure Adapters
        ↓
Domain
```

### Mandatory dependency direction

- UI/API may call application services.
- Application services may use domain services and platform interfaces.
- Domain code contains regulated business rules.
- Infrastructure implements platform interfaces.
- Domain code must not depend directly on infrastructure vendors.

### Forbidden pattern

```text
Literature Domain
      ↓
Qdrant SDK directly
```

### Required pattern

```text
Literature Domain
      ↓
RetrievalService / VectorStore
      ↓
Qdrant Adapter
```

---

## 8. Machine-enforced architecture

Architecture is enforced in CI rather than relying only on documentation.

The program uses:

- TypeScript strict mode
- ESLint restricted-import rules
- dependency-cruiser
- Madge
- architecture tests
- security negative tests
- GitHub Actions
- CodeRabbit

Examples of rules that should ultimately become blocking:

- module domain code cannot import Qdrant directly;
- module domain code cannot import Redis directly;
- module domain code cannot import Kafka directly;
- module domain code cannot import Elasticsearch directly;
- module domain code cannot import LangChain/LangGraph directly;
- module domain code cannot import model-provider SDKs directly;
- domain cannot import UI;
- platform services cannot import module-specific business logic;
- bounded contexts cannot form circular dependencies;
- direct cross-module internal coupling is prohibited;
- protected routes cannot bypass shared authorization.

---

## 9. Next-generation platform capability stack

The modernization target includes the following shared capabilities.

| Capability | Technology / abstraction | Primary responsibility |
|---|---|---|
| Relational system of record | **PostgreSQL** | regulated transactional state and governed configuration |
| Vector retrieval | **Qdrant** | semantic/vector retrieval |
| Full-text / lexical search | **Elasticsearch** | fast full-text, operational and searchable projections |
| Cache / ephemeral state | **Redis** | cache, rate limits, short-lived state, distributed coordination |
| Event backbone | **Kafka** | reliable asynchronous domain/platform events |
| AI orchestration | **LangChain / LangGraph** | controlled AI workflows behind internal interfaces |
| Model abstraction | **ModelGateway** | provider/model independence |
| Embeddings | **EmbeddingService** | controlled embedding creation/versioning |
| Retrieval | **RetrievalService** | authorized semantic + lexical retrieval |
| Reranking | **RerankingService** | relevance improvement after authorization |
| Object/document storage | **ObjectStore** | source documents, attachments, evidence artifacts |
| Authorization | **AuthorizationService** | tenant/client/module/permission decisions |
| Audit | **AuditService** | attributable activity history |
| Evidence | **EvidenceService** | reproducible regulated evidence |
| Observability | OpenTelemetry-compatible layer | traces, metrics, logs and operational diagnosis |

---

## 10. Which next-generation technology solves which problem?

### 10.1 Semantic retrieval / similar-case or regulatory-context search

**Problem**
- keyword search misses semantically related content;
- users need similar cases, guidance sections, SOPs, RSI/label context or literature context.

**Use**
- Qdrant
- EmbeddingService
- RetrievalService
- RerankingService

**Pattern**

```text
Authorized Scope
   ↓
Embedding
   ↓
Qdrant candidate retrieval
   ↓
Reranking
   ↓
Controlled result set
```

Qdrant supports dense, sparse and hybrid retrieval patterns and can apply tenant-aware metadata filtering. Authorization still remains the responsibility of the application platform.

---

### 10.2 Exact medical/regulatory/product keyword search

**Problem**
- semantic search alone can miss exact terms such as:
  - product names
  - active substances
  - MedDRA terms
  - reporter terms
  - regulatory identifiers
  - specific clauses
  - PMID / DOI / case identifiers

**Use**
- Elasticsearch

**Pattern**

```text
Authorized Scope
   ↓
Elasticsearch lexical/full-text search
   ↓
candidate set
```

Elasticsearch is especially useful for full-text and structured operational search.

---

### 10.3 Hybrid PV knowledge search

**Problem**
A query may contain both semantic intent and exact regulated terminology.

Example:

`"serious hepatic event with Product X reported in pregnancy"`

**Use**
- Qdrant semantic retrieval
- Elasticsearch lexical retrieval
- RetrievalService
- RerankingService

**Pattern**

```text
Query
 ↓
Authorization
 ↓
+-----------------------+
|                       |
Qdrant               Elasticsearch
semantic             lexical
|                       |
+-----------+-----------+
            ↓
       fusion/rerank
            ↓
       controlled context
```

---

### 10.4 Multi-step AI-assisted PV workflows

**Problem**
A PV AI workflow may require multiple controlled steps:

- identify source type;
- extract patient;
- extract suspect product;
- extract event;
- identify missing minimum criteria;
- retrieve controlled knowledge;
- call deterministic rule services;
- request human review;
- generate evidence.

**Use**
- LangChain for model/tool/retrieval composition where useful;
- LangGraph for explicit stateful multi-step workflows;
- internal `AIWorkflowOrchestrator` interface.

**Critical rule**

LangChain/LangGraph orchestrates.

It does **not** own regulatory business rules.

Deterministic PV rules remain in controlled domain services.

---

### 10.5 Long-running workflow state / human-in-the-loop AI

**Problem**
Some AI workflows require:

- pause for human review;
- resume later;
- retry a failed tool;
- record step state;
- branch conditionally;
- preserve execution provenance.

**Use**
- LangGraph behind `AIWorkflowOrchestrator`
- PostgreSQL for authoritative regulated state
- Kafka for asynchronous continuation where required

---

### 10.6 High-frequency cache and repeated lookups

**Problem**
Repeatedly requesting:

- tenant configuration
- safe derived entitlement context
- frequently used controlled metadata
- expensive non-authoritative computation

can increase latency and infrastructure cost.

**Use**
- Redis through `CacheStore`

**Rules**
- regulated source-of-truth data remains in PostgreSQL;
- TTL is explicit;
- invalidation is explicit;
- security-sensitive cache is short-lived or actively invalidated.

---

### 10.7 API abuse / rate limiting

**Problem**
Prevent:

- brute force;
- excessive API usage;
- runaway integrations;
- uncontrolled AI cost;
- tenant monopolization of shared resources.

**Use**
- Redis-backed distributed rate limiting

Possible dimensions:

- user
- tenant
- client
- IP
- API key
- endpoint
- model
- external provider

---

### 10.8 Distributed locks / duplicate execution prevention

**Problem**
Prevent simultaneous execution of operations such as:

- duplicate literature schedule execution;
- duplicate submission send;
- duplicate evidence generation;
- multiple workers processing the same job.

**Use**
- Redis distributed coordination where appropriate;
- idempotency keys;
- authoritative PostgreSQL transaction/constraints.

Redis locks never replace database integrity constraints.

---

### 10.9 Cross-module asynchronous communication

**Problem**
Modules should not directly call each other's internals and create hidden coupling.

**Use**
- Kafka through `EventBus`

Example:

```text
Literature
   ↓
PV_CASE_CANDIDATE_CREATED
   ↓
Intake

Intake
   ↓
CASE_CREATED
   ↓
Case Processing

Case Processing
   ↓
CASE_FINALIZED
   ↓
Submissions
```

Events must be:

- typed;
- versioned;
- idempotently consumable;
- tenant/client scoped;
- auditable where regulated state changes occur.

---

### 10.10 Reliable event + database consistency

**Problem**
A database transaction succeeds but the event fails, or an event is published before the database transaction fails.

**Use**
- PostgreSQL transactional outbox or equivalent reliable pattern
- Kafka producer/consumer infrastructure

This prevents regulated workflow state and asynchronous integrations from silently diverging.

---

### 10.11 AI-provider independence

**Problem**
Regulated workflows must not become tightly coupled to one model provider.

**Use**
- `ModelGateway`

Module code asks for a governed capability, not a vendor.

Example:

```text
CaseProcessing
    ↓
ModelGateway
    ↓
Approved provider/model
```

The gateway controls:

- provider;
- model;
- model version;
- parameters;
- timeout;
- retry;
- logging;
- cost;
- policy;
- provenance.

---

### 10.12 Controlled RAG

**Problem**
AI needs current controlled PV context without allowing arbitrary or cross-client retrieval.

**Use**
- AuthorizationService
- RetrievalService
- Qdrant
- Elasticsearch
- RerankingService
- ModelGateway
- EvidenceService

Required sequence:

```text
User
 ↓
Authentication
 ↓
Tenant
 ↓
Client Workspace
 ↓
Module Permission
 ↓
Authorized Retrieval Scope
 ↓
Qdrant + Elasticsearch
 ↓
Reranking
 ↓
Model
 ↓
Human/Workflow
 ↓
Audit + Evidence
```

Never:

```text
User question
 ↓
vector database
 ↓
whatever matches
```

---

## 11. Technology ownership rules

### PostgreSQL
Authoritative for regulated transactional state and governed configuration.

### Qdrant
Vector/semantic retrieval only.

It must not determine user authorization.

### Elasticsearch
Search/index projection.

It must be rebuildable from authoritative data and must not become the regulated system of record.

### Redis
Ephemeral capability only.

It must not become the sole storage location for regulated records.

### Kafka
Event transport.

It must not replace authoritative transactions, audit or evidence.

### LangChain / LangGraph
AI orchestration.

They must not become the location of regulatory rules or authoritative workflow state.

---

## 12. PV module market benchmark

### Literature Screening

Benchmark against:
- ArisGlobal Literature Intelligence class capability;
- mature literature workflows in enterprise safety platforms;
- regulatory requirements;
- existing validated platform behavior.

Target capabilities include:

- scheduled and ad hoc search;
- test-search vs regulated-workflow distinction;
- search strategy governance;
- evidence package;
- deduplication;
- article/source acquisition;
- translation where controlled;
- patient-level extraction;
- medical review;
- labeling/RSI context;
- causality-support context;
- source-linked handoff into Intake.

---

### Intake & Triage

Benchmark against:
- ArisGlobal Advanced Intake;
- Veeva Safety automation/low-touch intake class;
- Ennov intelligent intake;
- Argus mature case-initiation controls.

Target capabilities include:

- multi-channel intake;
- structured extraction;
- minimum-criteria assessment;
- duplicate detection;
- follow-up;
- triage;
- product/company scope;
- case creation;
- human review;
- evidence.

---

### L2A / Case Processing

Benchmark against:
- Oracle Argus depth;
- Veeva Safety modern workflow;
- ArisGlobal LifeSphere Safety;
- Ennov PV.

Target capabilities include:

- case versioning;
- validity;
- seriousness;
- expectedness/listedness;
- coding;
- narrative;
- causality;
- QC;
- medical review;
- follow-up;
- case finalization;
- evidence;
- controlled state machine.

---

### Submissions

Benchmark against:
- Oracle Argus submission maturity;
- Veeva Safety gateway/reporting;
- ArisGlobal submission capabilities;
- Ennov PV E2B/reporting workflows.

Target capabilities include:

- reportability decision;
- destination determination;
- due-date/compliance clock;
- E2B(R3);
- package generation;
- validation;
- idempotent transmission;
- retries;
- acknowledgements;
- amendments;
- nullifications;
- submission status/provenance;
- compliance evidence.

---

## 13. Cleanup sprint program

### Sprint 0 — Governance & Baseline
- URS
- FRS
- architecture
- traceability
- benchmark tooling
- immutable BEFORE evidence

### Sprint 1 — Controlled PV Knowledge Foundation
- regulatory source inventory
- source classification
- version/effective-date metadata
- controlled interpretations
- retrieval-ready knowledge model
- knowledge provenance

### Sprint 2 — Architecture Enforcement
- dependency zones
- internal platform interfaces
- dependency-cruiser rules
- ESLint import boundaries
- architecture tests
- warning -> blocking conversion

### Sprint 3 — Identity, Session & Security
- identity-first authentication
- durable session design
- tenant/client context
- RBAC
- entitlement enforcement
- negative security tests

### Sprint 4 — Literature Reconciliation
- reconcile current Literature implementation with URS/FRS
- market benchmark gap matrix
- architecture migration
- regression evidence

### Sprint 5 — Intake & Triage Reconciliation
- same controlled process

### Sprint 6 — L2A / Case Processing Reconciliation
- same controlled process

### Sprint 7 — Submissions
- complete/reconcile on the canonical architecture

### Sprint 8 — Shared Next-Gen Capability Layer
- Qdrant
- Elasticsearch
- Redis
- Kafka
- LangChain/LangGraph
- ModelGateway
- Retrieval/Reranking
- observability
- evaluation

Capability adoption is incremental. No big-bang rewrite.

### Sprint 9 — Independent Qualification
- Hacker Gate
- CodeRabbit
- security regression
- PV regression
- architecture gate
- evidence completion
- URS/FRS traceability

### Sprint 10 — Clean Export
- freeze qualified RC
- create provenance
- SBOM/dependency inventory
- secret scan
- source archive hash
- clean new repository
- first commit = qualified clean baseline

---

## 14. Benchmark tools

The cleanup benchmark uses objective tools including:

- TypeScript strict compilation
- ESLint
- Next.js production build
- npm audit
- Knip
- jscpd
- Madge
- dependency-cruiser
- Gitleaks
- existing PV verification scripts
- existing Nexus verification scripts
- tenant/workspace/module negative authorization tests
- CodeRabbit
- adversarial Hacker Gate

Metrics are always compared:

`BEFORE -> AFTER -> Reason -> Evidence -> Behavior Impact`

---

## 15. Current baseline signals

Initial baseline evidence has already identified:

- production build succeeds;
- TypeScript compilation succeeds;
- ESLint currently has warnings but no errors;
- no circular dependencies were detected in the first Madge pass;
- Literature verification passes;
- Intake verification passes;
- Nexus Sprint 1–10 verification passes;
- dependency vulnerabilities remain to be remediated;
- substantial potential dead/unused code requires classification;
- duplicated API/UI/validation patterns require controlled cleanup;
- architecture enforcement requires further strengthening;
- secret/architecture scans must themselves be validated before being used as release evidence.

A benchmark tool result is not automatically trusted merely because it ran. The Evidence Gate also applies to the benchmark harness.

---

## 16. Zero-deviation rule

Cleanup may improve:

- structure;
- security;
- performance;
- maintainability;
- observability;
- automation;
- architecture;
- technology capability.

Cleanup may **not silently change**:

- regulated workflow decisions;
- safety-data meaning;
- case ownership;
- tenant/client ownership;
- audit semantics;
- evidence semantics;
- validation-critical calculations;
- role authority;
- approved business behavior.

Any intentional behavior change leaves the cleanup stream and enters controlled feature/change management.

---

## 17. Clean repository strategy

The existing repository remains the historical development/provenance repository.

The clean repository is created only from one exact qualified cleanup release-candidate commit.

All applicable qualification evidence must identify that same frozen commit, including CI/benchmark runs and the independent CodeRabbit review. Evidence from an earlier head remains historical evidence and does not qualify a later release candidate.

```text
Current Historical Repository
          ↓
Controlled Cleanup Branch
          ↓
10 Gates + URS/FRS + CI/Benchmark + Independent Review PASS
          ↓
Same exact commit frozen as Release Candidate
          ↓
Verified Source Snapshot
          ↓
New Clean Repository
```

The new repository will contain a `PROVENANCE.md` linking it to:

- source repository;
- cleanup branch;
- source commit;
- migration head;
- benchmark evidence;
- ten-gate result;
- release approval;
- source archive SHA-256.

---

## 18. Governing documents

See:

- `docs/CLEANUP_ZERO_DEVIATION_PROGRAM.md`
- `docs/requirements/URS_PLATFORM_CLEANUP.md`
- `docs/requirements/FRS_PLATFORM_CLEANUP.md`
- `docs/architecture/CANONICAL_ARCHITECTURE.md`
- `docs/architecture/PLATFORM_CAPABILITY_TARGET.md`
- `docs/architecture/NEXUS_MODULAR_NEXTGEN_CHARTER.md`
- `docs/pv-knowledge/REGULATORY_SOURCE_REGISTER.md`
- `docs/cleanup/BASELINE_REPORT.md`
- `docs/cleanup/TRACEABILITY_MATRIX.md`

---

### Documentation Quality Rule

URS, FRS and User Guides are mandatory controlled sprint deliverables and must be detailed, audit-ready and written using globally recognized technical-writing and requirements conventions.

They must use:
- clear and unambiguous terminology;
- unique requirement identifiers;
- atomic/testable requirements;
- consistent **shall / should / may / shall not** usage;
- explicit roles, preconditions, validations, exceptions and outcomes;
- field/state/permission/error-level detail in FRS;
- task-oriented, released-behavior instructions in User Guides;
- version/change control and traceability.

Writing should be broadly aligned with ISO/IEC/IEEE 29148 requirements-engineering concepts, ISO/IEC/IEEE 26514 user-documentation concepts, regulated controlled-document practices and applicable GAMP-style lifecycle expectations.

Detailed rules are defined in:
`docs/architecture/NEXUS_MODULAR_NEXTGEN_CHARTER.md`

## 19. Definition of done

The modernization program is not done because:

- the UI works;
- Vercel deployed;
- tests passed once;
- AI generated correct-looking output.

It is done only when:

1. applicable URS/FRS requirements are implemented;
2. PV behavior is benchmarked against authoritative sources and mature market capability;
3. canonical architecture is machine enforced;
4. security boundaries pass adversarial testing;
5. CodeRabbit material findings are closed;
6. regression suites pass;
7. regulated audit/evidence is complete;
8. infrastructure dependencies are controlled through platform interfaces;
9. the clean release candidate is reproducible;
10. the source snapshot is exported with provenance into the clean repository.

**Goal: not merely cleaner code — a controlled, next-generation, regulator-aware PV platform foundation.**
