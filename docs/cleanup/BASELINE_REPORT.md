# Cleanup Baseline Report

Status: BASELINE CAPTURE IN PROGRESS
Branch: cleanup/zero-deviation-baseline-20260930
Source baseline: current main at branch creation
Purpose: measure current implementation before cleanup or architecture remediation.

## Rules

- No application behavior changes during baseline capture.
- No dependency replacement during baseline capture.
- No architecture remediation during baseline capture.
- Results are evidence, not targets to manipulate.
- Every later cleanup result must be compared back to this document.

## Required measurements

| Measure | Current | Evidence | Gate |
|---|---:|---|---|
| TypeScript errors | pending | `tsc --noEmit` | Karpathy / Evidence |
| ESLint errors | pending | `npm run lint` | Karpathy |
| ESLint warnings | pending | `npm run lint` | Karpathy |
| Production build | pending | `npm run build` | Warpath |
| Dependency vulnerabilities | pending | `npm audit` | Hacker |
| Unused dependencies | pending | Knip | Ponytail |
| Unused files/exports | pending | Knip | Ponytail |
| Duplicate code | pending | jscpd | Ponytail |
| Circular dependencies | pending | Madge | Architecture |
| Architecture boundary violations | pending | dependency-cruiser | Architecture |
| Secret findings | pending | Gitleaks | Hacker |
| Literature verification | pending | existing verification scripts | Evidence |
| Intake verification | pending | existing verification scripts | Evidence |
| L2A verification | pending | existing Nexus verification scripts | Evidence |
| Tenant isolation | pending | existing + new negative tests | Architecture/Hacker |
| Workspace isolation | pending | new negative tests | Architecture/Hacker |
| Module entitlement isolation | pending | existing + new negative tests | Architecture/Hacker |
| Audit/evidence integrity | pending | governed verification | Evidence |
| Migration integrity | pending | governed migration checks | Evidence |

## Current capability inventory observed from package manifest

### Existing
- Next.js 16.3.5
- React 19.2.4
- PostgreSQL client (`pg`)
- OpenAI SDK
- Qdrant JS REST client
- XML, PDF, DOCX, XLSX parsing capability
- governed knowledge verification scripts
- pgvector load/verify/retrieval scripts referenced in package scripts
- tenant-integrity verification
- Nexus sprint verification scripts
- production release gate
- scheduler verification
- deployment verification

### Target shared platform capabilities to add/standardize
- LangChain / LangGraph adapter layer
- Qdrant as dedicated vector retrieval capability
- Redis cache/session/lock/rate-limit capability
- Kafka event backbone
- Elasticsearch full-text/operational search
- centralized model gateway
- centralized embedding service
- centralized retrieval/reranking service
- centralized event bus
- centralized cache abstraction
- centralized search abstraction
- observability/tracing
- AI evaluation harness
- prompt/policy registry
- object/document storage abstraction

## Zero-deviation comparison

Later phases must record:

BEFORE -> AFTER -> reason -> evidence -> behavior impact

No cleanup item is complete without that chain.
