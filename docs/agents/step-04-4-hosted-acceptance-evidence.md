# Nexus Sprint 4.4 — Hosted security and independent acceptance checklist
Date: 2026-10-11
Service: nexus-pv-specialists-staging (Render Free, Singapore)
Data: existing controlled Neon UAT branch (NOT production)
Disposition: **PARTIAL, NO CLINICAL RELEASE**

## Shared KB architecture
Every specialist agent accesses the common KnowledgeRouter for the knowledge categories needed by its task. "All agents access all KB" means a common governed retrieval service, NOT unrestricted visibility into every tenant/client, unapproved source, expired label, or other customer's SOPs. Regulated decisions are not driven solely by vector similarity. The specialist bridge rejects mismatched tenant/client rule, product and citation records. Knowledge selection remains scoped to current tenant, active client, regulatory jurisdiction and as-of date, with version/source evidence.

## Live checks completed
- Hosted Python service manually provisioned; auto-deploy off, free plan.
- Live GET /healthz returned service identity and state=disabled.
- Live GET /readyz returned ready=true and clinical_execution_enabled=false; this verifies a PostgreSQL audit preflight, not a clinical engine.
- Live unauthenticated GET /v1/agents/seriousness/assess returned HTTP 503 while disabled (fail-closed, not a full 401 credential test).
- Dedicated SQL-defined Neon audit role: SELECT and INSERT true; UPDATE/DELETE and schema CREATE false, NOBYPASSRLS/NOCREATEDB/NOCREATEROLE, no inherited administrative memberships.
- Frontend and backend remain unable to release autonomous safety decisions.

## Engineering test coverage (not a live substitute)
- Contract suite tests role token scope, input SHA, cross-client/tenant/workspace mismatch, output evidence offsets, missing workers, duplicate IDs and durable SQLite audit across service reinitialization.
- Shared LangGraph scope tests reject foreign client and tenant general rules, client rules, Product Master records, citations.
- Provider failure, timeout and downstream audit error are designed to fail closed and retain human review, but have NOT been validated against live provider traffic.

## Outstanding hosted proof
1. Real POST 401/403, wrong SHA, duplicate/replay, forced timeout, unavailable provider, connection outage; use approved synthetic staging credentials only.
2. Verify actual Neon audit INSERT and restart persistence using an approved synthetic request, matching request_id/audit_id in Next.js `audit_events` as well.
3. Verify every registered specialist against a controlled, *approved* real KnowledgeRouter corpus with the source revision and citation provenance. Currently specialists remain disabled.
4. Document actual client/workspace mapping and approved protected source transfer/PII controls.
5. Independent PV expert adjudication/QA validation and security signoff; reviewer identity, qualification, evidence IDs, acceptance/defects and dated signature or equivalent e-signature. Assistant cannot impersonate or grant these approvals.

## Signoff template (must be completed by authorized humans)
- Validation case set and blinded reference version:
- Reviewers 1 and 2, roles, dates:
- Adjudication report and unresolved cases:
- Security approver and penetration/IDOR test evidence:
- QA approver and URS/FRS traceability evidence:
- Decision: PENDING / APPROVED / REJECTED
- Justification / controlled deviations:

**Until the blanks are filled and hosted proof is complete: do not enable production flags, claim clinical qualification, or merge PR #97 on these grounds.**
