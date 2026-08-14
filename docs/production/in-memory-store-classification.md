# In-memory store release classification

This inventory distinguishes durable regulated records from process-local implementation details.
It is a release gate: a production deployment must not enable a release-critical path while its
authoritative state exists only in memory.

## Release-critical — migrate or disable

| Path | State | Release treatment |
| --- | --- | --- |
| `frontend/lib/jobs/job-queue.ts` and `scheduler/scheduler-service.ts` | Work and schedules | Use a durable queue/schedule ledger or disable background processing endpoints. |
| `frontend/lib/admin/config-store.ts` and `feature-flags.ts` | Tenant configuration and flags | Move authoritative configuration to versioned PostgreSQL governance records. |
| `frontend/lib/platform/vector/vector-provider.ts` and `frontend/lib/vector/vector-store.ts` | Vector data | Production RAG must use the controlled pgvector path; memory providers must be development-only. |
| `frontend/lib/auth/session-manager.ts` | Session registry | Confirm all production authentication is stateless/database-backed or replace this registry. |

## Operational state — persist when relied upon

| Path | State | Release treatment |
| --- | --- | --- |
| `frontend/lib/notifications/notification-store.ts` | User notifications | Persist if notifications are used for regulated assignments or escalations. |
| `frontend/lib/reporting/report-store.ts` | Report metrics | Persist only when used as report-of-record evidence. |
| `frontend/lib/search/search-store.ts` | Global search index | Treat as rebuildable cache; never as the authoritative source. |
| `frontend/lib/monitoring/error-tracker.ts` | Error history | Send to the approved observability backend; memory is acceptable only as a local buffer. |

## Process-local by design

Provider registries, TTL caches, circuit-breaker state, rate-limiter windows, health probes,
runtime counters and request-local grouping maps are not regulated records. They may remain
in memory when production behavior is documented and multi-instance limitations are accepted.

## Closed in this branch

- Workflow packages, Hits, Screening and Intake persistence.
- Evidence artifacts and PDF content lifecycle.
- Governed review and Evidence Package snapshots.
- Import/export jobs and export download content.
- Knowledge governance records and transition history (migration 019).
- Knowledge Repository API content, integrity hashes and lifecycle state (migration 020).
- Generic document upload/retrieval/deletion API with PostgreSQL content and metadata (migration 021).
