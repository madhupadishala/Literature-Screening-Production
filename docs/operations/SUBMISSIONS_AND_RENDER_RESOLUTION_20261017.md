# Submissions visibility and Render release synchronization

Investigated 17 October 2026. No UI files, production database records, Render settings, or live deployment were changed during this investigation. The scripts below are prepared for execution, not a claim that their operations have been applied.

## 1. Confirmed Submissions visibility defect

Production database: old-mountain-48148190 / br-muddy-tooth-b3186ol1 / literature_screening_prod.

Actual latest selection history matches the screenshot:

- Tenant clinixai-prod: c3570ce0-6492-4dac-ba40-c0363b2835a4.
- Client workspace clinixai-prod-primary (TheClinixAI Production Workspace): 8c2b32e2-6816-4265-9e71-48411d5207c4.
- User support@theclinixai.com (ClinixAI Super Admin): 01e00a97-ff7f-4908-b84d-563766d9bff7.
- Environment PROD; latest selected module CASE_PROCESSING.

Direct SQL result:

| Check | Observed |
| --- | --- |
| User, tenant, workspace | active |
| Tenant and workspace memberships | active |
| Tenant role | CLINIXAI_SUPER_ADMIN |
| Platform role | PLATFORM_SUPER_ADMIN, active |
| PROD tenant SUBMISSIONS entitlement | missing |
| PROD workspace SUBMISSIONS entitlement | missing |
| User PROD workspace SUBMISSIONS roles | empty |
| nexus_submission_packages and nexus_submission_preflight_runs | present |

Navigation uses /api/context/current -> listAccessibleWorkspaces. A tenant entitlement, workspace entitlement and an active user module role must all exist before SUBMISSIONS appears. Super Admin membership alone does not bypass these assignments. This is an access-data gap, not missing deployed page code.

Read-only check:

```sh
psql -X -v ON_ERROR_STOP=1 -f frontend/database/operations/check-production-submissions-access.sql
```

Missing-record seed:

```sh
psql -X -v ON_ERROR_STOP=1 -f frontend/database/operations/grant-production-submissions-view.sql
```

Use the existing runner's production PG connection environment (PGHOST/PGDATABASE/PGUSER/PGPASSWORD/PGSSLMODE or PGSERVICE); do not paste credentials into command history. The seed checks database and Neon branch, requires the exact active existing memberships/administrator, inserts only missing records, records history, and rolls back if existing entitlements are disabled/suspended/expired. It does not reactivate accounts, create tenants, reset validity windows, or change clinical transport settings. Repeating it adds no duplicate grants/history.

MODULE_VIEWER is sufficient for visibility and submission viewing. It does not grant creation or transmission. If package creation is separately required, assign MODULE_OPERATOR using the controlled module-role administration path. Leave NEXUS_LIVE_SUBMISSION_TRANSPORT_ENABLED unchanged.

After executing the seed, refresh the application. Click Submissions in global navigation, or use Switch workspace and explicitly select SUBMISSIONS. The signed context must change from CASE_PROCESSING to SUBMISSIONS. Entering /submissions directly while retaining a CASE_PROCESSING context does not authorize the submissions API.

## 2. Render evidence and exact synchronization

Existing service: srv-db5o1a7lk1mc73all2gg, nexus-pv-specialists-staging, madhu's workspace (tea-db5n2f5ckfvc73ap55dg).

Verified configuration: Python/free, repo Literature-Screening-Production, branch integration/nexus-27-agents-kb-execution-20261015, autoDeploy=no/trigger=off, healthCheckPath empty. Last deployment bb1f070b is live. It is not a failed build.

Observed logs (UTC):

```text
2026-10-16 09:12:16 Build successful
2026-10-16 09:12:43 Listening at: http://0.0.0.0:10000
2026-10-16 09:12:44 HEAD / HTTP/1.1 503
2026-10-16 09:12:48 Your service is live
2026-10-16 09:13:34 GET /readyz HTTP/1.1 200
2026-10-16 09:13:34 GET /healthz HTTP/1.1 200
2026-10-16 09:28:34 Handling signal: term
2026-10-16 22:53:46 Running gunicorn ...
2026-10-16 22:53:52 staging_acceptance route=inventory http_status=200 passed=true slots=27 executed=0 audit_present=true
2026-10-16 22:53:54 staging_acceptance route=dispatch http_status=200 passed=true slots=27 executed=13 audit_present=true
```

The targeted error/fatal log query returned no records. Earlier external 20-second health probes timed out; those client timeouts do not establish a build failure. Fresh probes during this investigation both succeeded: GET /healthz -> 200 with state=disabled; GET /readyz -> 200 with ready=true and clinical_execution_enabled=false. The health failure is not currently reproducible; the code release mismatch remains. The observed idle termination followed by startup is consistent with a free service cold start. Render documents 15-minute idle spin-down and approximately one-minute spin-up.

The root route returns 503 intentionally while clinical dispatch is disabled. Configure the infrastructure liveness check as /healthz; verify /readyz separately for Postgres audit and scoped-token readiness. Neither endpoint proves all 27 specialists are executable.

Prepared script pins the existing Vercel release, preserving environment secrets and clinical gates:

```sh
python scripts/deploy_render_nexus_release.py --dry-run
# With RENDER_API_KEY injected by the runner:
python scripts/deploy_render_nexus_release.py
```

The script verifies service/workspace/repo, PATCHes the branch to fix/auth-tenancy-audit-20261017, sets healthCheckPath=/healthz, keeps autoDeployTrigger=off, retains the existing pip requirements entrypoint and Gunicorn WSGI app, adds stdout access/error logging, and POSTs /deploys with commitId=52fba8cc1bc971599d0badfe75e36aa593a6f8c3. It does not upgrade the plan or overwrite environment variables. The PATCH alone does not start a deployment; the POST is required.

Dashboard equivalent: open https://dashboard.render.com/web/srv-db5o1a7lk1mc73all2gg, set the release branch and /healthz under Settings, retain the current build/start commands, then Manual Deploy -> Deploy a specific commit -> 52fba8cc1bc971599d0badfe75e36aa593a6f8c3.

Build command:

```text
pip install -r backend/services/pv_agents/requirements-render.txt
```

Start command:

```text
gunicorn backend.services.pv_agents.render_wsgi:application --bind 0.0.0.0:$PORT --workers 1 --timeout 120 --access-logfile - --error-logfile - --capture-output
```

After the deploy becomes live, require matching commit metadata and 200 responses from /healthz and /readyz. If /readyz returns 503, its implemented dependency checks require NEXUS_PV_AUDIT_BACKEND=postgres, a valid NEXUS_PV_AUDIT_DATABASE_URL with access to pv_agent_service_audit, and a nonempty object in NEXUS_PV_SERVICE_TOKEN_SCOPES. Diagnose the server-side exception type; do not log credential values.

Code sync is distinct from native execution: the Python service alone cannot host the five TypeScript specialists or a colocated AG02 Ollama worker. The native socket topology requires those workers on the same host, as described in docs/NEXUS_NATIVE_STAGING_VM_RUNBOOK.md. Do not enable NEXUS_PV_AGENTS_ENABLED merely to get a green liveness check.

## Verification of prepared changes

- Production diagnostics were read-only and returned the exact missing access records above.
- Render build/start/health evidence was read through the connected account.
- Seven WSGI health/runtime tests passed with mocked dependencies.
- Five deployment-script tests passed: pinned commit, destination guard, settings verification, exact deploy payload, and no deployment after PATCH failure.
- Script dry run and Python compilation passed.
- The SQL seed was matched to the live schema but not executed; no claim of applied grants or runtime synchronization is made.

UI overhaul remains untouched as requested.

References: https://api-docs.render.com/reference/update-service ; https://api-docs.render.com/reference/create-deploy ; https://render.com/docs/free ; https://render.com/docs/health-checks
