# Nexus supervised native-specialist staging qualification

No employee login or clinical release work. Do not use production patient information.

## Database: controlled preflight, migration and reversal
Use the migration-owner staging connection only, after taking a verified DB backup.
```bash
export NEXUS_STAGE=staging
export DATABASE_URL='<staging migration-owner URL>'
bash backend/services/pv_agents/migrations/manage_rejection_audit.sh pre
bash backend/services/pv_agents/migrations/manage_rejection_audit.sh apply
bash backend/services/pv_agents/migrations/manage_rejection_audit.sh post
```
Grant only INSERT to dedicated `nexus_audit_writer` (a separately provisioned
LOGIN role with no inherited owner/superuser privileges); revoke ALL from
`PUBLIC`, `anon`, `authenticated` and application roles. Writer must set
transaction-local `nexus.audit_tenant` and `nexus.audit_client` before INSERT.
Never grant UPDATE, DELETE, TRUNCATE or ownership to the writer.
Verify enforcement through a connected non-owner role; migration-owner permission
checks alone cannot establish least privilege. RLS prevents ordinary non-privileged
roles from reading; owner/superusers require separate operational controls.
No raw patient information is allowed in error_type or audit metadata.

Rollback only when empty, confirmed:
```bash
export NEXUS_AUDIT_ROLLBACK_CONFIRMED=YES_EMPTY_ONLY
bash backend/services/pv_agents/migrations/manage_rejection_audit.sh rollback
```
If any rows exist, preserve immutable evidence and use a forward migration instead.

## Supervision
The supplied systemd unit `ops/nexus-native-worker.service` assumes a Linux host
that can run a persistent Node process. This is not available on static Vercel
serverless functions. Render Python and Node services cannot share a Unix socket
unless they share one host/container; use a colocated container or a different
authenticated private transport for separated hosts.

Dedicated env file owned by root, mode 0600:
- `IPC_SIGNING_SECRET`: 32+ bytes, identical to Python runtime's private signing secret
- `NEXUS_NATIVE_SOCKET_PATH`: `/run/nexus-agents/agent.sock`
- `NEXUS_PV_AGENTS_ENABLED=false`
- Approved COI provider credentials and provider-factory configuration: required
  for AG08; do not substitute a public provider or dummy credential
- Staging Postgres audit writer URL: only supplied to the Python audit writer,
  not the Node specialist worker

MemoryMax=512M; Restart=on-failure; RestartSec=5s; StartLimitBurst=5 per 60s.
Node worker handles SIGTERM, closes open descriptors and unlinks its socket.
Node's UDS binds with 0600; supervisor creates `/run/nexus-agents` mode 0700.
Worker must be marked unhealthy after timeout, crash or signature failure.
No auto-activation of clinical dispatch.

## Hosted phases (only synthetic ICSRs)

A. Install approved Node dependencies; start supervised Node worker, validate
socket is a socket mode 0600 and owned by the service identity. Probe a
signed readiness message **before** registering any TS route as healthy.

B. From a colocated Python runtime, run
`bash scripts/run-native-specialist-smoke.sh` with mock engines and no data egress.
Then execute synthetic signed requests against AG02 and each of AG08/12/17/20/26
with the actual approved provider and controlled local knowledge.
Verify five independent review-required outcomes and unique audit identifiers.
The Node dummy-handler smoke is a transport test, **not** clinical engine qualification.

C. Inject a deliberately invalid HMAC and confirm transport denial. The request's
tenant/client claims are untrusted and must not be attributed to real tenants.
Record a sanitized security rejection event through the trusted Python harness
under a reserved synthetic security principal, query durable Postgres records with
a separate auditor identity, then verify append-only restrictions.
Do not count the socket server closing a tampered connection as proof of DB write.

Unresolved until hosted: reviewed COI provider provision, realtime worker readiness
protocol, actual hosted TS engine execution, and migration/role verification.
