# Production Release Handoff Checklist

A release is not considered validated merely because this checklist exists or because automated checks pass.

## Technical readiness

- [ ] Exact production build SHA identified.
- [ ] GitHub CI passed for the exact build SHA.
- [ ] Required database migrations approved and applied.
- [ ] Database schema verification passed after migration.
- [ ] Production environment variables/secrets configured.
- [ ] Dependency health checks pass.
- [ ] No unresolved Critical reliability finding.
- [ ] Scheduler authentication and scheduled-search execution verified.
- [ ] Backup/rollback procedure documented and tested where required.

## Functional / governance readiness

- [ ] Search → Hits → Screening → Review/MR → Intake positive E2E passed.
- [ ] Negative/unresolved workflow scenarios passed.
- [ ] Multi-patient explicit relation scenario passed.
- [ ] Zero-patient scenario passed.
- [ ] Duplicate/provenance scenario passed.
- [ ] Expectedness/Label applicability scenarios passed.
- [ ] Causality controlled-method scenarios passed.
- [ ] RBAC and tenant-isolation scenarios passed.
- [ ] Audit and evidence retrieval verified.
- [ ] Intake content hash and source lineage verified.

## Qualification / Quality readiness

- [ ] IQ executed and approved.
- [ ] OQ executed and approved.
- [ ] PQ/UAT executed and approved.
- [ ] Deviations assessed and closed/accepted.
- [ ] Validation Owner sign-off recorded.
- [ ] Quality Approver sign-off recorded.
- [ ] Release Approver sign-off recorded.
- [ ] Approved System Validation Package retained with content SHA-256.

## Handoff

Record production release time, deployment identifier, approver, rollback point, monitoring owner, support/escalation contact, and post-release verification outcome.
