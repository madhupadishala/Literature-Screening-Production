# Single-host staging target — no split Render/Vercel IPC

Use a dedicated Linux VM (Ubuntu 24.04 LTS, Docker Engine + Compose v2),
minimum 4 vCPU / 16 GiB RAM for an approved small local model (actual RAM
depends on model); separate managed staging Postgres database. Do NOT
run on the existing Python-only Render web service or production database.

## Prepare
1. Install Docker with Compose, clone approved integration branch, pin
   Ollama image digest and approved local model. Restrict host ingress.
2. Configure secret-manager files, mode 0400, readable only by the UID used
   inside staging containers: `IPC_SECRET_FILE` and `STAGING_DB_URL_FILE`.
   The latter is **not** a migration-owner credential.
3. Provision separate database identities: migration owner, INSERT-only
   rejection audit writer, and SELECT-only restricted auditor.
   Explicitly revoke UPDATE/DELETE/TRUNCATE and PUBLIC/anon permissions.
4. Model readiness must mean the approved model is actually present and
   callable; `ollama list` alone does not prove the model is available.
5. Ensure `NEXUS_PV_AGENTS_ENABLED=false` in all services.

## Database approval / migration
Run `manage_rejection_audit.sh pre`, inspect current DB/database role,
back up, then `apply` and `post` with authorized migration-owner
credentials. Execute a role-level permission test as the operational
writer, and a tenant-filtered auditor verification. Do not infer tenant
isolation just from an owner-level RLS metadata query.

## Phase A startup
```bash
export OLLAMA_IMAGE_TAG=<pinned-version>
export APPROVED_LOCAL_MODEL=<approved-cached-model>
export IPC_SECRET_FILE=/run/secrets/nexus-ipc-key
export STAGING_DB_URL_FILE=/run/secrets/nexus-staging-db
docker compose -f docker-compose.native-staging.yml config --quiet
docker compose -f docker-compose.native-staging.yml up -d --build ollama ipc-init node
docker compose -f docker-compose.native-staging.yml exec node stat -c '%a %u:%g %F' /run/nexus-agents/agent.sock
```
Require output `600 11001:11001 socket`. Python's `probe_native_ready`
validates a **signed response** before registration.

## Phase B/C strictly gated
Phase B requires genuine approved AG02 provider injection and the five TS
engines bound to controlled synthetic source packs. Phase C requires dedicated
writer and independently queried auditor credentials. The qualification
runner now raises rather than reporting a false pass if those prerequisites
are missing. In particular, it must not run automatically as a continuously
restarting Compose service until these are supplied.

For a colocated, configured Python runner container:
```bash
docker compose -f docker-compose.native-staging.yml run --rm \
  --no-deps python python -m backend.services.pv_agents.native_qualification_runner
```
The command is executable but will intentionally fail closed without injected
approved AG02 provider and auditor credentials. Provide them through your
trusted staging-only composition layer; never synthesize successful outputs.

## Evidence to retain
Capture UTC timestamps, branch+SHA, sanitized Phase A handshake,
the six per-agent status/review/autonomy assertions, tamper denial,
the specific rejection event UUID and exactly one auditor-visible matching
database record. Do not print clinical text or secrets. Sign off only after
these commands have actually run and all tests passed.

## Rollback
Stop Python, then Node; confirm closed sockets. Only reverse migration 002
when the audit table has no records; otherwise perform forward remediation.
