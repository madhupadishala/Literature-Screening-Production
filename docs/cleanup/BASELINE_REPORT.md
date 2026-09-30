# Cleanup Baseline Report

Status: BASELINE CAPTURE QUALIFIED; CURRENT SECURITY BASELINE CLEAN
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
| TypeScript errors | **0** | Cleanup Baseline Benchmark run 36664295714 | Karpathy / Evidence |
| ESLint errors | **0** | Cleanup Baseline Benchmark run 36664295714 | Karpathy |
| ESLint warnings | **9** | Cleanup Baseline Benchmark run 36664295714 | Karpathy |
| Production build | **PASS** | Cleanup Baseline Benchmark run 36664295714 | Warpath |
| Dependency vulnerabilities | **BEFORE: 21 total (19 high, 2 moderate). CURRENT QUALIFICATION: 0 vulnerabilities after controlled compatible overrides.** | BEFORE run 36664295714; current quality run 36673592664 | Hacker |
| Unused dependencies | pending | Knip | Ponytail |
| Unused files/exports | **BEFORE: 150 files reported. CURRENT: 151 candidates; must be classified before deletion.** | Knip; current run 36675295402 | Ponytail |
| Duplicate code | **308 clones; 4,611 duplicated lines (3.89%); 23,044 duplicated tokens (4.36%) across 720 analyzed files** | jscpd, Cleanup Baseline Benchmark run 36664295714 | Ponytail |
| Circular dependencies | **BEFORE: 0 across 578 files. CURRENT: 0 across 589 processed files.** | Madge; current run 36675295402 | Architecture |
| Architecture boundary violations | **0 blocking violations; 64 warning-level transitional/orphan findings across 637 modules / 1,546 dependencies.** Warning debt remains visible for later module reconciliation. | dependency-cruiser, run 36675295402 | Architecture |
| Secret findings | **CURRENT: 0 incremental findings; 0 findings across full 1,026-commit history; 0 governed working-tree findings.** Prior hits were classified as one exact synthetic idempotency fixture and generated Next.js build material; policy was narrowed/fixed and the clean scans were re-run. | Gitleaks, run 36675295402 | Hacker |
| Literature verification | **PASS** | `screening:verify` / baseline workflow | Evidence |
| Intake verification | **PASS** | `intake:verify` / baseline workflow | Evidence |
| L2A verification | **PASS through Sprint 10 scripted checks** | Nexus sprint verification scripts / baseline workflow | Evidence |
| Tenant isolation | **PASS at Nexus foundation boundary** | `nexus:security-boundaries:verify`, run 36675295402 | Architecture/Hacker |
| Workspace isolation | **PASS at Nexus foundation boundary** | `nexus:security-boundaries:verify`, run 36675295402 | Architecture/Hacker |
| Module entitlement isolation | **PASS at Nexus foundation boundary** | identity/workspace + security-boundary verification, run 36675295402 | Architecture/Hacker |
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


## Baseline architecture findings

The baseline confirms that the current system contains substantial working PV capability but also architecture debt that must be remediated before a clean production baseline is qualified.

### Confirmed high-priority findings

1. **Authentication is currently tenant-first.**
   - The login API requires `tenantId`/tenant key together with email and password.
   - The governing Nexus architecture requires identity authentication first, followed by tenant/workspace selection.

2. **Sessions are process-memory based.**
   - `frontend/lib/auth/session-manager.ts` stores sessions in an in-process `Map`.
   - This is not durable across process restarts or horizontally scaled instances.
   - Durable authoritative session state is required before production qualification.

3. **Legacy/global tenant state exists.**
   - `frontend/lib/tenant/tenant-store.ts` contains in-memory global active-tenant state.
   - This is not an acceptable source of authority for multi-tenant regulated requests.

4. **Request principal resolution still supports trusted identity headers/demo fallback.**
   - Production qualification requires those paths to be disabled/fail-closed except explicitly controlled non-production use.

5. **Module dependency semantics conflict with plug-and-play architecture.**
   - Current `CASE_PROCESSING` definition declares a hard entitlement dependency on `INTAKE`.
   - The charter requires commercial/module combinations to connect by canonical contracts rather than forcing purchase/enablement of every upstream UI module.

6. **Dependency/security debt remains open.**
   - `undici` vulnerabilities are present through Qdrant/Cheerio dependency paths.
   - Additional high-severity development-tool dependency findings exist through lint/tooling dependency paths.
   - No forced breaking downgrade/upgrade is permitted without regression evidence.

7. **Potential dead/unused code is material.**
   - Knip reports 150 potential unused files.
   - No file may be deleted merely because Knip reports it; dynamic routes, validation artifacts, regulated evidence/support code and planned bounded capabilities must first be classified.

8. **Build tracing warning remains.**
   - Dynamic filesystem resolution in controlled knowledge retrieval causes broad project tracing in the Next.js production build.
   - This must be narrowed without changing knowledge behavior.

## Sprint 0 disposition

Sprint 0 baseline capture is qualified. The corrected dependency-cruiser scan is trustworthy, and the corrected Gitleaks policy now produces clean incremental, full-history and governed-working-tree results on run 36675295402. BEFORE metrics remain frozen as evidence; current cleanup metrics are recorded separately and must not overwrite the original baseline.
