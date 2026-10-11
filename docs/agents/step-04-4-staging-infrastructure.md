# Nexus 4.4 — Existing-infrastructure staging architecture (2026-10-11)

## Verified connected assets

- Vercel team project `nexus-automation` (Next.js; project metadata `live:false` at inspection). `frontend/vercel.json` has `git.deploymentEnabled:false`: **do not enable automatic deployment**.
- Neon `clinixai-validation-db`, project ID `old-mountain-48148190`, main branch `br-muddy-tooth-b3186ol1` contains full Nexus application tables, including `audit_events`, `literature_review_workspaces`, `nexus_workspace_memberships`, `knowledge_documents`. An existing non-primary `nexus-uat-rc1-20260922` branch also exists. No Neon branch/database was created or modified in this work.
- `clinixai-pv-platform` Supabase project is inactive; Terrevo Supabase projects are separate and **must not** be repurposed.
- GitHub Actions already runs Python WSGI/TypeScript contract integration and 9 impacted CI workflows. These are ephemeral integration tests, not a persistent hosted backend.

## Selected architecture

1. **Frontend:** existing Vercel Next.js Nexus project. No redeployment or new project until explicit controlled staging qualification.
2. **Application/knowledge data:** existing Neon Nexus database, with a controlled existing non-primary UAT branch only after its data ownership and suitability are verified; never use `main` for synthetic cases.
3. **Python specialists:** reuse `backend/services/pv_agents/service.py` behind a private HTTPS reverse proxy in an authorized persistent Python runtime. **No such runtime was confirmed among the connected Vercel/Neon/Supabase assets.** Vercel Next.js and Neon Postgres are not evidence of a persistent Python application server. Do not represent a loopback fixture or GitHub runner as a live staging deployment.
4. **Development test runtime now available:** `python -m backend.services.pv_agents.run_staging` with loopback-only binding, explicit env opt-in and service token scopes; `wsgiref` is not production-grade. Run only with synthetic test narratives. GitHub workflow `pv-agent-integration.yml` exercises offline contracts.
5. **Audit:** Python writes to configured durable SQLite file in local testing; production/staging runtime needs validated durable storage (not ephemeral Vercel filesystem). Next.js persists application audit in Neon `audit_events`. Correlate by `audit_id` and `request_id`; do not retain raw narrative or bearer in the Nexus app audit event.

## Staging environment contract (DO NOT commit actual values)

Backend private runtime environment variables:
- `NEXUS_PV_AGENTS_ENABLED=true` only in controlled staging
- `NEXUS_PV_SERVICE_TOKEN_SCOPES`: JSON mapping a **strong** service bearer to non-production explicit `tenant_id`, `client_id`, `workspace_id` scopes.
- `NEXUS_PV_AUDIT_DB`: durable, access-controlled writable path (not ephemeral /tmp).
- `NEXUS_PV_REGISTER_SPECIALISTS=true` only when model provider, compatible installed dependencies and audits are available.
- `NEXUS_PV_SPECIALIST_AUDIT_DIR`: durable path for specialist traces.
- `NEXUS_PV_PROVIDER`, `AI_MODEL` / `SERIOUSNESS_MODEL` / `CAUSALITY_MODEL` and provider-specific credentials must be set by the owner **in provider secret settings**, never in chat or GitHub.
- `NEXUS_PV_SPECIALIST_GRAPH_ENABLED`: enable only after actual KnowledgeRouter source corpus and client-scope proof.

Next.js server environment variables:
- `NEXUS_PV_AGENT_SERVICE_URL`: trusted private HTTPS origin of the Python service, with no path/query.
- `NEXUS_PV_AGENT_SERVICE_TOKEN`: matching secret in provider protected settings.
- `NEXUS_LITERATURE_SHARED_AGENTS_ENABLED=true` only after all acceptance requirements.
- `NEXUS_PV_AGENT_DATA_TRANSFER_APPROVED=true` only after approved PII/document transfer policy.
- `NEXUS_PV_AGENT_CLIENT_MAPPING_CONFIRMED=true` only after documented workspace-to-client mapping.
- `NEXT_PUBLIC_NEXUS_LITERATURE_SHARED_AGENTS_ENABLED=true`: **public UI-only gate**, never an authorization control.

## No-deviation acceptance sequence

1. Retain the 9/9 CI-good commit `ddeab3040e8d104c35d9b4345c6e7df6b08d0b2e` as the prior reference; rerun impacted CI on every staging code change.
2. Run loopback staging smoke tests with controlled mock or offline worker. Verify 200, 401, 403, 409, 502, 503, no-store and audit record/restart.
3. Select/authorize persistent Python hosting **without activating Nexus production**. Do not consume Vercel deploy quotas or provision chargeable compute without approval.
4. Register actual scoped service credentials and permitted client mappings on host/Next.js protected configuration.
5. Test a live Next.js → Python HTTPS request and negative cross-tenant case, then KB citation/source revision, real provider-backed workers and durable audit restart; keep human review mandatory.
6. Capture privacy approval, PV expert and QA signoff before enabling staged clinical suggestions or proceeding to Step 4.5.

**Present acceptance decision:** local/CI engineering-ready, persistent HTTPS Python staging runtime **not yet provisioned**. No autonomous clinical release.
