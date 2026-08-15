# Operational and security qualification

## Verified implementation

- Production identity is bearer-session only; tenant and user headers are rejected.
- Revoked and expired sessions are rejected against the PostgreSQL session ledger.
- Cross-tenant HTTP, database, storage, knowledge, scheduler and vector boundaries are exercised in CI.
- Oversized requests receive HTTP 413; API throttling returns HTTP 429 with retry metadata.
- Production responses include CSP, frame denial, MIME protection, restrictive permissions policy and HSTS.
- Detailed readiness, dependency, audit and release endpoints require RBAC or the internal monitoring token.
- PostgreSQL connectivity, migration 001–023 state and pgvector schema are critical readiness checks.
- Audit-coupled regulated writes are transactionally rolled back when audit persistence fails.

## External evidence required before release

These controls cannot be truthfully proven by source code or CI alone and remain blocking release-contract inputs:

- `EDGE_RATE_LIMIT_PROVIDER`: deployed distributed/WAF rate-limit provider.
- `SECURITY_EVENT_SINK`: approved durable log/security-event drain.
- `DATABASE_BACKUP_VERIFIED_AT`: successful backup evidence from the previous 30 days.
- `DATABASE_RESTORE_VERIFIED_AT`: successful isolated restore test from the previous 30 days.
- `ROLLBACK_BUILD_SHA`: immutable previously deployable build.
- `RELEASE_BASE_URL`: HTTPS release-candidate origin used for smoke probes.

Manual PV/QA UAT, monitoring review, release notes approval and release-owner approval remain governance gates and must not be auto-waived.
