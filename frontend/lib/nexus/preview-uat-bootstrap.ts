import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";
import { runGovernedDatabaseMigrations } from "@/lib/database/governed-migration-runner";

const TARGET_GIT_BRANCH = "cleanup/zero-deviation-baseline-20260930";
const TARGET_PROJECT_ID = "old-mountain-a8148190";
const TARGET_BRANCH_PREFIX = "br-muddy-tooth-";
const TARGET_DATABASE = "neondb";
const EXPECTED_MIGRATION = "039";
const EXPECTED_MIGRATION_COUNT = 39;
const ADMIN_EMAIL = "support@theclinixai.com";
const TENANT_KEY = "uat-tenant";
const TENANT_NAME = "ClinixAI UAT Workspace";
const WORKSPACE_KEY = "clinixai-uat-primary";
const WORKSPACE_NAME = "ClinixAI UAT Primary Workspace";
const BOOTSTRAP_VERSION = "wave3-uat-v2";

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
] as const;

type Fingerprint = {
  database_name: string;
  neon_project_id: string | null;
  neon_branch_id: string | null;
};

function assertPreviewRuntime() {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.VERCEL_GIT_COMMIT_REF !== TARGET_GIT_BRANCH
  ) {
    throw new Error("UAT bootstrap is restricted to the governed cleanup Preview branch.");
  }
}

function assertPasswordHash(): string {
  const hash = process.env.PREVIEW_UAT_ADMIN_PASSWORD_HASH?.trim() ?? "";
  if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash)) {
    throw new Error("PREVIEW_UAT_ADMIN_PASSWORD_HASH is missing or invalid.");
  }
  return hash;
}

async function readFingerprint(): Promise<Fingerprint> {
  const result = await getPostgresPool().query<Fingerprint>(`
    SELECT
      current_database() AS database_name,
      current_setting('neon.project_id', true) AS neon_project_id,
      current_setting('neon.branch_id', true) AS neon_branch_id
  `);
  return result.rows[0];
}

function assertTarget(fingerprint: Fingerprint) {
  if (fingerprint.database_name !== TARGET_DATABASE) {
    throw new Error(
      `UAT bootstrap guard rejected database=${fingerprint.database_name}; expected=${TARGET_DATABASE}.`,
    );
  }
  if (fingerprint.neon_project_id !== TARGET_PROJECT_ID) {
    throw new Error(
      `UAT bootstrap guard rejected neonProjectId=${fingerprint.neon_project_id ?? "null"}; expected=${TARGET_PROJECT_ID}.`,
    );
  }
  if (
    typeof fingerprint.neon_branch_id !== "string" ||
    !fingerprint.neon_branch_id.startsWith(TARGET_BRANCH_PREFIX)
  ) {
    throw new Error(
      `UAT bootstrap guard rejected neonBranchId=${fingerprint.neon_branch_id ?? "null"}; expected prefix=${TARGET_BRANCH_PREFIX}.`,
    );
  }
}

export async function getPreviewUatBootstrapStatus() {
  assertPreviewRuntime();
  const fingerprint = await readFingerprint();
  assertTarget(fingerprint);

  const tables = await getPostgresPool().query<{
    migration_ledger_present: boolean;
    tenants_present: boolean;
    users_present: boolean;
  }>(`
    SELECT
      to_regclass('public.clinixai_schema_migrations') IS NOT NULL AS migration_ledger_present,
      to_regclass('public.tenants') IS NOT NULL AS tenants_present,
      to_regclass('public.application_users') IS NOT NULL AS users_present
  `);

  let migrationCount = 0;
  let maxMigration: string | null = null;
  let uatTenantCount = 0;
  let adminCount = 0;

  if (tables.rows[0].migration_ledger_present) {
    const migrations = await getPostgresPool().query<{
      migration_count: number;
      max_migration: string | null;
    }>(`
      SELECT count(*)::int AS migration_count,
             max(migration_id) AS max_migration
        FROM clinixai_schema_migrations
    `);
    migrationCount = Number(migrations.rows[0]?.migration_count ?? 0);
    maxMigration = migrations.rows[0]?.max_migration ?? null;
  }

  if (tables.rows[0].tenants_present) {
    const tenants = await getPostgresPool().query<{ count: number }>(
      "SELECT count(*)::int AS count FROM tenants WHERE tenant_key = $1",
      [TENANT_KEY],
    );
    uatTenantCount = Number(tenants.rows[0]?.count ?? 0);
  }

  if (tables.rows[0].users_present) {
    const users = await getPostgresPool().query<{ count: number }>(
      "SELECT count(*)::int AS count FROM application_users WHERE lower(email) = lower($1)",
      [ADMIN_EMAIL],
    );
    adminCount = Number(users.rows[0]?.count ?? 0);
  }

  return {
    ...fingerprint,
    migrationCount,
    maxMigration,
    uatTenantCount,
    adminCount,
    ready:
      migrationCount === EXPECTED_MIGRATION_COUNT &&
      maxMigration === EXPECTED_MIGRATION &&
      uatTenantCount === 1 &&
      adminCount === 1,
  };
}

export async function runPreviewUatBootstrap() {
  assertPreviewRuntime();
  const passwordHash = assertPasswordHash();
  const fingerprint = await readFingerprint();
  assertTarget(fingerprint);

  const before = await getPreviewUatBootstrapStatus();
  if (before.ready) {
    return { alreadyReady: true, ...before };
  }

  const migrations = await runGovernedDatabaseMigrations();
  if (
    migrations.migrationCount !== EXPECTED_MIGRATION_COUNT ||
    migrations.maxMigration !== EXPECTED_MIGRATION
  ) {
    throw new Error("Governed migrations did not reach the expected 039 schema ceiling.");
  }

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");

    const existingBootstrap = await client.query(
      `SELECT 1
         FROM audit_events
        WHERE event_type = 'PREVIEW_UAT_BOOTSTRAPPED'
          AND details->>'bootstrapVersion' = $1
        LIMIT 1`,
      [BOOTSTRAP_VERSION],
    );
    if (existingBootstrap.rows[0]) {
      await client.query("COMMIT");
      return { alreadyReady: true, ...(await getPreviewUatBootstrapStatus()) };
    }

    const population = await client.query<{
      tenants: number;
      users: number;
    }>(`
      SELECT
        (SELECT count(*)::int FROM tenants) AS tenants,
        (SELECT count(*)::int FROM application_users) AS users
    `);
    if (
      Number(population.rows[0]?.tenants ?? 0) !== 0 ||
      Number(population.rows[0]?.users ?? 0) !== 0
    ) {
      throw new Error(
        "UAT bootstrap refuses to grant initial authority because the target database is not empty.",
      );
    }

    const tenant = await client.query<{ id: string }>(
      `INSERT INTO tenants (tenant_key, display_name, status, configuration)
       VALUES ($1, $2, 'active', $3::jsonb)
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

    const user = await client.query<{ id: string }>(
      `INSERT INTO application_users (
         email, display_name, password_hash, status,
         failed_login_attempts, locked_until
       ) VALUES ($1, 'ClinixAI Super Admin', $2, 'active', 0, NULL)
       RETURNING id`,
      [ADMIN_EMAIL, passwordHash],
    );
    const userId = user.rows[0].id;

    await client.query(
      `INSERT INTO tenant_memberships (
         tenant_id, user_id, role_key, permissions, membership_status,
         membership_version, updated_by, updated_at
       ) VALUES ($1, $2, 'CLINIXAI_SUPER_ADMIN', '[]'::jsonb, 'active', 1, $2, now())`,
      [tenantId, userId],
    );

    await client.query(
      `INSERT INTO platform_role_assignments (
         user_id, role_key, status, updated_by, updated_at
       ) VALUES ($1, 'PLATFORM_SUPER_ADMIN', 'active', $1, now())`,
      [userId],
    );

    const workspace = await client.query<{ id: string }>(
      `INSERT INTO nexus_client_workspaces (
         tenant_id, workspace_key, display_name, status, configuration,
         created_by, updated_by
       ) VALUES ($1, $2, $3, 'active', $4::jsonb, $5, $5)
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
       ) VALUES ($1, $2, $3, 'WORKSPACE_ADMIN', 'active', 1, $3, now())`,
      [tenantId, workspaceId, userId],
    );

    for (const moduleKey of MODULES) {
      await client.query(
        `INSERT INTO tenant_module_entitlements (
           tenant_id, environment, module_key, status, capabilities, limits,
           version, updated_by, updated_at
         ) VALUES ($1, 'UAT', $2, 'enabled', '{}'::jsonb, '{}'::jsonb, 1, $3, now())`,
        [tenantId, moduleKey, userId],
      );

      await client.query(
        `INSERT INTO nexus_workspace_module_entitlements (
           tenant_id, workspace_id, environment, module_key, status,
           capabilities, limits, version, updated_by, updated_at
         ) VALUES ($1, $2, 'UAT', $3, 'enabled', '{}'::jsonb, '{}'::jsonb, 1, $4, now())`,
        [tenantId, workspaceId, moduleKey, userId],
      );

      await client.query(
        `INSERT INTO nexus_workspace_module_roles (
           tenant_id, workspace_id, user_id, environment, module_key,
           role_key, custom_permissions, status, version, updated_by, updated_at
         ) VALUES ($1, $2, $3, 'UAT', $4, 'MODULE_ADMIN', '[]'::jsonb, 'active', 1, $3, now())`,
        [tenantId, workspaceId, userId, moduleKey],
      );
    }

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, workspace_id, environment, module_key, actor_id,
         event_type, event_category, outcome, details
       ) VALUES ($1, $2, 'UAT', 'GOVERNANCE', $3,
                 'PREVIEW_UAT_BOOTSTRAPPED', 'PLATFORM_GOVERNANCE', 'success', $4::jsonb)`,
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
      ],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  return { alreadyReady: false, ...(await getPreviewUatBootstrapStatus()) };
}
