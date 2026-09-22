# ClinixAI Nexus RC1 Production Release Runbook

## Release boundary

Nexus RC1 deploys the governed Literature, Intake and Case Processing modules in one platform. Literature remains an upstream safety source. This release includes Intake review/extraction, ICSR validity and triage, duplicate/follow-up review, disposition, L2A case processing, QC, Medical Review, immutable finalization, evidence packages and controlled exports. Validated regional E2B XML transmission, regulatory gateway connectivity/acknowledgement handling, and embedded proprietary MedDRA/WHODrug content remain outside this release.

## Required authority

The release manager coordinates Engineering, Database Operations, Security, PV Product, QA, and the designated Release Owner. A release candidate cannot be created until every mandatory gate is passed or formally waived in the governed release console.

## Pre-deployment

1. Record the release version, immutable build SHA, operator, maintenance window, database owner, and rollback owner.
2. Validate the environment against `deployment/production-environment.schema.json` without printing secret values.
3. Confirm `ALLOW_DEMO_PRINCIPAL=false`, HTTPS is enforced, database TLS is enabled, and the monitoring token contains at least 32 characters.
4. Create and verify a restorable PostgreSQL backup. Record its protected location and retention policy outside the application repository.
5. Verify the existing migration ledger and apply migrations `001` through `032` in order using `npm run db:migrate` from one controlled migration job. Migration checksums must match the immutable release artifact. Do not run migrations concurrently from application replicas.
6. Run `npm run seed:demo` only in an explicitly approved synthetic demonstration tenant. Never seed a client production tenant.
7. Run `npm run validate:e2e`. Authoritative validation requires both `DATABASE_URL` and `RELEASE_BASE_URL`; skipped checks are not release evidence.
8. Run `npm run release:gate`. The command must complete the production build and report all release gates ready.

## Deployment

1. Deploy the immutable artifact identified by `BUILD_SHA`; do not build different source on individual replicas.
2. Keep new replicas out of service until `/api/health/live` and `/api/health/ready` succeed.
3. Shift traffic gradually while monitoring HTTP error rate, database pool waiters, AI failure rate, p95 latency, dependency status, and authorization denials.
4. Verify the complete synthetic golden path in the target environment: Literature → Intake → source review/extraction → ICSR validity/triage → duplicate/follow-up review → disposition → Case Processing → QC → Medical Review → finalization → evidence package/export. Also execute negative entitlement, RBAC and tenant-isolation scenarios.
5. Record automated UAT, manual PV UAT, smoke results, checklist evidence, and Release Owner approval in `/admin/release-readiness`.
6. Create the release candidate only after the console reports `READY`. Candidate creation records an immutable manifest hash and gate snapshot.

## Rollback triggers

Rollback when a critical readiness dependency is unhealthy, tenant isolation fails, audit events cannot be written, database pool waiters persist, error budgets are exceeded, output hashes fail verification, or governed workflow state becomes inconsistent.

## Rollback procedure

1. Stop traffic promotion and preserve logs, request identifiers, audit records, health snapshots, and performance snapshots.
2. Route traffic to the last verified immutable build.
3. If a migration requires reversal, stop writers first. Restore the verified database backup rather than applying destructive ad hoc SQL.
4. Re-run liveness, readiness, database readiness, authoritative end-to-end validation, and the smoke suite.
5. Record the rollback decision, affected release/build, timestamps, owner, evidence, and corrective-action reference in the audit and release records.

## Post-release

Monitor critical dependencies, AI and search p95 latency, failures, pool utilization, access denials, and workflow distribution throughout the observation window. Close the release only after PV Product, QA, Engineering, and Operations confirm stable results.
