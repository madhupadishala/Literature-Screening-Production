import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// Redeploy marker: pick up Preview-scoped UAT admin secret.
import process from "node:process";

import pg from "pg";

const { Pool } = pg;

const TARGET_GIT_BRANCH = "cleanup/zero-deviation-baseline-20260930";
const TARGET_PROJECT_ID = "old-mountain-a8148190";
const TARGET_BRANCH_PREFIX = "br-muddy-tooth-";
const TARGET_DATABASE = "neondb";
const EXPECTED_MIGRATION = "039";
const EXPECTED_MIGRATION_COUNT = 39;
const ADMIN_EMAIL = "support@theclinixai.com";
const ADMIN_PASSWORD_HASH =
  process.env.PREVIEW_UAT_ADMIN_PASSWORD_HASH?.trim() || "";
const TENANT_KEY = "uat-tenant";
const TENANT_NAME = "ClinixAI UAT Workspace";
const WORKSPACE_KEY = "clinixai-uat-primary";
const WORKSPACE_NAME = "ClinixAI UAT Primary Workspace";
const BOOTSTRAP_VERSION = "wave3-uat-v1";

const STATUS_FILE = path.join(process.cwd(), "public", "uat-bootstrap-status.json");

function writeBootstrapStatus(status) {
  mkdirSync(path.dirname(STATUS_FILE), { recursive: true });
  writeFileSync(
    STATUS_FILE,
    JSON.stringify(
      {
        bootstrapVersion: BOOTSTRAP_VERSION,
        generatedAt: new Date().toISOString(),
        ...status,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}

const MODULES = [
  "LITERATURE",
  "INTAKE",
  "CASE_PROCESSING",
  "MEDICAL_REVIEW",
  "SUBMISSIONS",
  "SIGNAL_MANAGEMENT",
  "AGGREGATE_REPORTING",
  "PV_DOCUMENTATION",
  "GOVERNANCE",
];

function sslConfiguration() {
  const mode = process.env.DATABASE_SSL_MODE?.trim().toLowerCase();
  if (!mode || mode === "disable") return false;
  if (mode === "no-verify" || mode === "require") return { rejectUnauthorized: false };
  if (mode === "verify-full") return { rejectUnauthorized: true };
  throw new Error(
    "DATABASE_SSL_MODE must be disable, no-verify, require, or verify-full.",
  );
}

function createPool() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");
  return new Pool({
    connectionString: databaseUrl,
    ssl: sslConfiguration(),
    max: 2,
    connectionTimeoutMillis: 15_000,
    statement_timeout: 120_000,
    application_name: "ClinixAI Wave 3 UAT Bootstrap",
  });
}

async function readFingerprint(client) {
  const result = await client.query(`
    SELECT
      current_database() AS database_name,
      current_setting('neon.project_id', true) AS neon_project_id,
      current_setting('neon.branch_id', true) AS neon_branch_id,
      to_regclass('public.clinixai_schema_migrations') IS NOT NULL AS migration_ledger_present,
      to_regclass('public.tenants') IS NOT NULL AS tenants_present
  `);
  return result.rows[0];
}

function assertTarget(fingerprint) {
  if (fingerprint.database_name !== TARGET_DATABASE) {
    throw new Error(
      `Guard failed: expected database ${TARGET_DATABASE}, received ${fingerprint.database_name}.`,
    );
  }
  if (fingerprint.neon_project_id !== TARGET_PROJECT_ID) {
    throw new Error(
      `Guard failed: expected Neon project ${TARGET_PROJECT_ID}, received ${fingerprint.neon_project_id}.`,
    );
  }
  if (
    typeof fingerprint.neon_branch_id !== "string" ||
    !fingerprint.neon_branch_id.startsWith(TARGET_BRANCH_PREFIX)
  ) {
    throw new Error(
      `Guard failed: unexpected Neon branch ${fingerprint.neon_branch_id ?? "null"}.`,
    );
  }
}

async function runMigrationsIfRequired() {
  let pool = createPool();
  let client = await pool.connect();

  try {
    const before = await readFingerprint(client);
    assertTarget(before);

    if (!before.migration_ledger_present && before.tenants_present) {
      throw new Error(
        "Guard failed: tenants exist without a migration ledger; refusing automatic bootstrap.",
      );
    }

    let migrationComplete = false;
    if (before.migration_ledger_present) {
      const current = await client.query(
        `SELECT max(migration_id) AS max_migration, count(*)::int AS migration_count
           FROM clinixai_schema_migrations`,
      );
      migrationComplete =
        current.rows[0]?.max_migration === EXPECTED_MIGRATION &&
        Number(current.rows[0]?.migration_count) === EXPECTED_MIGRATION_COUNT;
    }

    if (migrationComplete) {
      console.log("PREVIEW_UAT_MIGRATIONS_ALREADY_CURRENT");
      return;
    }
  } finally {
    client.release();
    await pool.end();
  }

  const migration = spawnSync(
    process.execPath,
    ["scripts/run-database-migrations.mjs"],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    },
  );
  if (migration.status !== 0) {
    throw new Error(
      `Controlled database migration runner exited with status ${migration.status ?? "unknown"}.`,
    );
  }

  pool = createPool();
  client = await pool.connect();
  try {
    const after = await readFingerprint(client);
    assertTarget(after);
    if (!after.migration_ledger_present) {
      throw new Error("Migration ledger is still missing after the controlled migration run.");
    }
    const current = await client.query(
      `SELECT max(migration_id) AS max_migration, count(*)::int AS migration_count
         FROM clinixai_schema_migrations`,
    );
    if (
      current.rows[0]?.max_migration !== EXPECTED_MIGRATION ||
      Number(current.rows[0]?.migration_count) !== EXPECTED_MIGRATION_COUNT
    ) {
      throw new Error(
        `Migration verification failed: expected ${EXPECTED_MIGRATION_COUNT} migrations through ${EXPECTED_MIGRATION}.`,
      );
    }
    console.log("PREVIEW_UAT_MIGRATIONS_VERIFIED");
  } finally {
    client.release();
    await pool.end();
  }
}

async function provisionUat() {
  const pool = createPool();
  const client = await pool.connect();

  try {
    const fingerprint = await readFingerprint(client);
    assertTarget(fingerprint);

    const current = await client.query(
      `SELECT max(migration_id) AS max_migration, count(*)::int AS migration_count
         FROM clinixai_schema_migrations`,
    );
    if (
      current.rows[0]?.max_migration !== EXPECTED_MIGRATION ||
      Number(current.rows[0]?.migration_count) !== EXPECTED_MIGRATION_COUNT
    ) {
      throw new Error("UAT provisioning requires the complete migration set through 039.");
    }

    await client.query("BEGIN");

    const tenant = await client.query(
      `INSERT INTO tenants (tenant_key, display_name, status, configuration)
       VALUES ($1, $2, 'active', $3::jsonb)
       ON CONFLICT (tenant_key)
       DO UPDATE SET
         display_name = EXCLUDED.display_name,
         status = 'active',
         configuration = tenants.configuration || EXCLUDED.configuration,
         updated_at = now()
       RETURNING id`,
      [
        TENANT_KEY,
        TENANT_NAME,
        JSON.stringify({
          environment: "UAT",
          bootstrapVersion: BOOTSTRAP_VERSION,
          containsRealPatientData: false,
        }),
      ],
    );
    const tenantId = tenant.rows[0].id;

    const user = await client.query(
      `INSERT INTO application_users (
         email, display_name, password_hash, status,
         failed_login_attempts, locked_until
       ) VALUES ($1, 'ClinixAI Super Admin', $2, 'active', 0, NULL)
       ON CONFLICT (email)
       DO UPDATE SET
         display_name = EXCLUDED.display_name,
         updated_at = now()
       RETURNING id`,
      [ADMIN_EMAIL, ADMIN_PASSWORD_HASH],
    );
    const userId = user.rows[0].id;

    await client.query(
      `INSERT INTO tenant_memberships (
         tenant_id, user_id, role_key, permissions, membership_status,
         membership_version, updated_by, updated_at
       ) VALUES ($1, $2, 'CLINIXAI_SUPER_ADMIN', '[]'::jsonb, 'active', 1, $2, now())
       ON CONFLICT (tenant_id, user_id)
       DO NOTHING`,
      [tenantId, userId],
    );

    await client.query(
      `INSERT INTO platform_role_assignments (
         user_id, role_key, status, updated_by, updated_at
       ) VALUES ($1, 'PLATFORM_SUPER_ADMIN', 'active', $1, now())
       ON CONFLICT (user_id)
       DO NOTHING`,
      [userId],
    );

    const workspace = await client.query(
      `INSERT INTO nexus_client_workspaces (
         tenant_id, workspace_key, display_name, status, configuration,
         created_by, updated_by
       ) VALUES ($1, $2, $3, 'active', $4::jsonb, $5, $5)
       ON CONFLICT (tenant_id, workspace_key)
       DO UPDATE SET
         display_name = EXCLUDED.display_name,
         status = 'active',
         configuration = nexus_client_workspaces.configuration || EXCLUDED.configuration,
         version = nexus_client_workspaces.version + 1,
         updated_by = $5,
         updated_at = now()
       RETURNING id`,
      [
        tenantId,
        WORKSPACE_KEY,
        WORKSPACE_NAME,
        JSON.stringify({
          environment: "UAT",
          bootstrapVersion: BOOTSTRAP_VERSION,
          containsRealPatientData: false,
        }),
        userId,
      ],
    );
    const workspaceId = workspace.rows[0].id;

    await client.query(
      `INSERT INTO nexus_workspace_memberships (
         tenant_id, workspace_id, user_id, workspace_role, status,
         version, updated_by, updated_at
       ) VALUES ($1, $2, $3, 'WORKSPACE_ADMIN', 'active', 1, $3, now())
       ON CONFLICT (workspace_id, user_id)
       DO UPDATE SET
         workspace_role = 'WORKSPACE_ADMIN',
         status = 'active',
         version = nexus_workspace_memberships.version + 1,
         updated_by = $3,
         updated_at = now()`,
      [tenantId, workspaceId, userId],
    );

    for (const moduleKey of MODULES) {
      await client.query(
        `INSERT INTO tenant_module_entitlements (
           tenant_id, environment, module_key, status, capabilities, limits,
           version, updated_by, updated_at
         ) VALUES ($1, 'UAT', $2, 'enabled', '{}'::jsonb, '{}'::jsonb, 1, $3, now())
         ON CONFLICT (tenant_id, environment, module_key)
         DO UPDATE SET
           status = 'enabled',
           version = tenant_module_entitlements.version + 1,
           updated_by = $3,
           updated_at = now()`,
        [tenantId, moduleKey, userId],
      );

      await client.query(
        `INSERT INTO nexus_workspace_module_entitlements (
           tenant_id, workspace_id, environment, module_key, status,
           capabilities, limits, version, updated_by, updated_at
         ) VALUES ($1, $2, 'UAT', $3, 'enabled', '{}'::jsonb, '{}'::jsonb, 1, $4, now())
         ON CONFLICT (workspace_id, environment, module_key)
         DO UPDATE SET
           status = 'enabled',
           version = nexus_workspace_module_entitlements.version + 1,
           updated_by = $4,
           updated_at = now()`,
        [tenantId, workspaceId, moduleKey, userId],
      );

      await client.query(
        `INSERT INTO nexus_workspace_module_roles (
           tenant_id, workspace_id, user_id, environment, module_key,
           role_key, custom_permissions, status, version, updated_by, updated_at
         ) VALUES ($1, $2, $3, 'UAT', $4, 'MODULE_ADMIN', '[]'::jsonb, 'active', 1, $3, now())
         ON CONFLICT (workspace_id, user_id, environment, module_key, role_key)
         DO UPDATE SET
           status = 'active',
           version = nexus_workspace_module_roles.version + 1,
           updated_by = $3,
           updated_at = now()`,
        [tenantId, workspaceId, userId, moduleKey],
      );
    }

    await client.query(
      `UPDATE nexus_identity_sessions
          SET status = 'revoked', revoked_at = now()
        WHERE user_id = $1
          AND status = 'active'`,
      [userId],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, workspace_id, environment, module_key, actor_id,
         event_type, event_category, outcome, details
       )
       SELECT $1, $2, 'UAT', 'GOVERNANCE', $3,
              'PREVIEW_UAT_BOOTSTRAPPED', 'PLATFORM_GOVERNANCE', 'success', $4::jsonb
       WHERE NOT EXISTS (
         SELECT 1
         FROM audit_events
         WHERE tenant_id = $1
           AND event_type = 'PREVIEW_UAT_BOOTSTRAPPED'
           AND details->>'bootstrapVersion' = $5
       )`,
      [
        tenantId,
        workspaceId,
        userId,
        JSON.stringify({
          bootstrapVersion: BOOTSTRAP_VERSION,
          migrationCeiling: EXPECTED_MIGRATION,
          environment: "UAT",
          containsRealPatientData: false,
        }),
        BOOTSTRAP_VERSION,
      ],
    );

    await client.query("COMMIT");

    console.log(
      JSON.stringify({
        event: "PREVIEW_UAT_BOOTSTRAP_READY",
        tenantKey: TENANT_KEY,
        workspaceKey: WORKSPACE_KEY,
        adminEmail: ADMIN_EMAIL,
        moduleCount: MODULES.length,
        migrationCeiling: EXPECTED_MIGRATION,
      }),
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.VERCEL_GIT_COMMIT_REF !== TARGET_GIT_BRANCH
  ) {
    writeBootstrapStatus({
      ready: false,
      state: "skipped_non_preview",
      message: "Bootstrap only runs on the governed cleanup preview branch.",
    });
    console.log("PREVIEW_UAT_BOOTSTRAP_SKIPPED");
    return;
  }

  if (!ADMIN_PASSWORD_HASH) {
    writeBootstrapStatus({
      ready: false,
      state: "missing_admin_secret",
      message: "PREVIEW_UAT_ADMIN_PASSWORD_HASH is not configured for this Preview deployment.",
    });
    console.log("PREVIEW_UAT_BOOTSTRAP_SKIPPED: PREVIEW_UAT_ADMIN_PASSWORD_HASH is not configured.");
    return;
  }

  writeBootstrapStatus({
    ready: false,
    state: "running",
    message: "UAT database migration and provisioning are in progress.",
  });

  await runMigrationsIfRequired();
  await provisionUat();

  writeBootstrapStatus({
    ready: true,
    state: "ready",
    message: "UAT migrations and governed provisioning completed.",
    migrationCeiling: EXPECTED_MIGRATION,
    migrationCount: EXPECTED_MIGRATION_COUNT,
    tenantKey: TENANT_KEY,
    workspaceKey: WORKSPACE_KEY,
    adminEmail: ADMIN_EMAIL,
  });
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.message : "Unknown UAT bootstrap failure.";
  writeBootstrapStatus({
    ready: false,
    state: "failed",
    message: message.slice(0, 1200),
  });
  console.error("PREVIEW_UAT_BOOTSTRAP_FAILED", message);
});
