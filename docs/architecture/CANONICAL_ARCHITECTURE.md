# Canonical Platform Architecture

Status: Governing target for cleanup

## Access hierarchy

Identity
-> Tenant
-> Client Workspace
-> Environment
-> Module Entitlement
-> Workspace Membership
-> Module Role
-> Permission
-> Workflow Data
-> Immutable Audit/Evidence

## Layering

### Presentation/API
Next.js UI/API adapters. No authoritative access logic in the browser.

### Application
Use cases and workflow orchestration.

### Domain
Regulated business rules and state invariants.

### Platform services
Authorization, audit, evidence, AI, retrieval, eventing, storage, observability.

### Infrastructure adapters
PostgreSQL, Qdrant, Elasticsearch, Redis, Kafka, object storage, model providers, LangChain/LangGraph.

## Dependency direction

Presentation -> Application -> Domain
Application -> Platform interfaces
Infrastructure -> Platform interfaces
Domain MUST NOT depend on infrastructure vendors.
Infrastructure adapters MUST NOT define regulatory business rules.

## Event-driven rule

Kafka is used for asynchronous integration where decoupling/reliability is useful.
It is not a substitute for synchronous authorization checks or authoritative database transactions.

Recommended event flow examples:
- Literature relevant item accepted -> PV_CASE_CANDIDATE_CREATED
- Intake accepted -> INTAKE_ACCEPTED
- Case created -> CASE_CREATED
- Case finalized -> CASE_FINALIZED
- Submission package ready -> SUBMISSION_READY
- Transmission attempted -> SUBMISSION_TRANSMISSION_ATTEMPTED
- Acknowledgement received -> SUBMISSION_ACKNOWLEDGED

Each event must be versioned, attributable, scoped and idempotently consumable.

## Search and retrieval

Authorized context is resolved BEFORE search.

AuthorizationService
-> authorized scope
-> RetrievalService
   -> Qdrant vector candidates
   -> Elasticsearch lexical candidates
   -> hybrid fusion
   -> reranking
-> AI/model or user workflow

Qdrant and Elasticsearch never determine authorization.

## Cache

Redis may cache safe derived authorization/retrieval/runtime data, but PostgreSQL remains authoritative.
Security-sensitive cache entries require bounded TTL/invalidation.

## AI

ModelGateway abstracts model providers.
LangChain/LangGraph may orchestrate behind AIWorkflowOrchestrator.
Prompts/policies are versioned assets.
AI does not own deterministic regulatory rules.

## Module boundary rule

Literature, Intake/Triage, L2A/Case Processing and Submissions may use shared platform capabilities but must not embed vendor infrastructure SDK use inside domain logic.

## Migration strategy

1. Inventory direct vendor/platform usage.
2. Introduce interface + adapter.
3. Add characterization tests around existing behavior.
4. Redirect one bounded use case.
5. Verify parity and security.
6. Repeat.
7. Remove obsolete direct dependency only after proven unused.

No big-bang rewrite.
