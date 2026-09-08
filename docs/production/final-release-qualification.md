# Final release qualification and production-candidate decision

## Decision

**BLOCKED — not yet a production candidate.**

The repository-owned automated qualification is complete only when the branch quality gate is
green. That result does not replace deployed-environment evidence or governed human approval.
The pull request must remain draft and no immutable release candidate may be created until every
blocking item below is recorded against the same build and release manifest.

## Verified by repository automation

- TypeScript, lint and the Next.js production build.
- PostgreSQL migrations 001–023 on pgvector/PostgreSQL 16.
- Tenant-boundary, database-backed HTTP rollback and operational-security qualification suites.
- Fail-closed release-contract validation for production identity, HTTPS, dependencies, secrets,
  distributed rate limiting, durable security events, backup/restore recency and rollback identity.
- Latest UAT evidence is selected by `executedAt`, not incidental storage order.
- PV/QA UAT sign-off and release-owner approval are non-waivable release-checklist items.

## Blocking deployed-environment evidence

- A reachable HTTPS `RELEASE_BASE_URL` for the exact `BUILD_SHA` and `RELEASE_VERSION`.
- Successful deployed preflight, authoritative E2E, automated UAT and smoke probes.
- Approved distributed edge/WAF rate limiting and durable security-event drain.
- Backup and isolated restore evidence from the previous 30 days.
- An immutable rollback build and exercised rollback procedure.
- Healthy production PostgreSQL, migrations, pgvector, knowledge, evidence and AI dependencies.
- A successful preview/candidate deployment; current PR deployment attempts are externally blocked
  by the hosting account's deployment-rate limit.

## Blocking governance evidence

- All eight mandatory manual PV UAT scenarios passed against the release manifest.
- Security review, monitoring/performance review and release notes approval recorded.
- PV/QA sign-off and the designated release-owner approval recorded; neither can be waived.

## Candidate rule

Run `npm run release:gate` only from the controlled release environment. A green result is the
machine-verifiable prerequisite for candidate creation. Keep the pull request draft and classify
the decision as blocked if any deployed or governance evidence is missing, stale, failed, or tied
to a different build/manifest.
