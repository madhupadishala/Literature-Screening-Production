# Platform Capability Target

## Principle

Application modules consume platform capabilities through stable internal interfaces. Infrastructure products must not leak across regulated workflow code.

## Canonical capability boundaries

### Data
- `RelationalStore` -> PostgreSQL
- `VectorStore` -> Qdrant
- `SearchIndex` -> Elasticsearch
- `CacheStore` -> Redis
- `ObjectStore` -> approved object/document storage

### Messaging
- `EventBus` -> Kafka

### AI
- `ModelGateway`
- `EmbeddingService`
- `RetrievalService`
- `RerankingService`
- `StructuredExtractionService`
- `AIWorkflowOrchestrator` -> LangChain/LangGraph adapters
- `AIEvaluationService`
- `PromptRegistry`

### Governance
- `IdentityService`
- `TenantContext`
- `WorkspaceContext`
- `AuthorizationService`
- `AuditService`
- `EvidenceService`
- `PolicyService`

## Ownership rules

### PostgreSQL
Authoritative regulated transactional state and configuration.

### Qdrant
Semantic/vector retrieval only. Never authoritative for access control or regulated record state.

### Redis
Ephemeral state only: cache, locks, rate limits, temporary coordination, optional session support. Never regulated source of truth.

### Kafka
Asynchronous event transport. Events do not replace governed database transactions or audit evidence.

### Elasticsearch
Searchable index/analytics projection. Never regulated system of record.

### LangChain / LangGraph
Orchestration implementation behind internal interfaces. Business rules and regulatory decisions remain in domain services, not framework graphs.

## Module rule

Literature, Intake/Triage, L2A/Case Processing and Submissions may not import infrastructure clients directly in domain workflow code.

All access must pass through platform capability interfaces.

## Retrieval authorization order

Identity
-> Tenant
-> Client Workspace
-> Environment
-> Module entitlement
-> User role
-> Permission
-> Authorized retrieval scope
-> Vector/full-text retrieval
-> Reranking
-> Model
-> Human workflow
-> Audit/evidence

## Migration rule

Existing direct infrastructure usage is catalogued first. It is replaced only when:
1. equivalent behavior is proven,
2. migration is covered by tests,
3. audit/evidence behavior is preserved,
4. security boundary is maintained or improved.
