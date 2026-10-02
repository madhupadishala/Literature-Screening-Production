import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";
import { runGovernedDatabaseMigrations } from "@/lib/database/governed-migration-runner";

const GOVERNED_UAT_GIT_BRANCHES = new Set([
  "cleanup/zero-deviation-baseline-20260930",
  "preview/wave4",
]);
const TARGET_PROJECT_ID = "old-mountain-48148190";
const TARGET_BRANCH_ID = "br-square-breeze-b3yxypxx";
const TARGET_DATABASE = "literature_screening_prod";
const EXPECTED_MIGRATION = "039";
const EXPECTED_MIGRATION_COUNT = 39;

const ADMIN_EMAIL = "support@theclinixai.com";
const TENANT_KEY = "nexus-uat-rc1-a";
const WORKSPACE_KEY = "clinixai-uat-primary";
const WORKSPACE_NAME = "ClinixAI UAT Primary Workspace";
const BOOTSTRAP_VERSION = "wave3-uat-v3";

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

type TableState = {
  migration_ledger_present: boolean;
  workspaces_present: boolean;
  workspace_memberships_present: boolean;
  workspace_entitlements_present: boolean;
  workspace_roles_present: boolean;
};

function assertPreviewRuntime() {
  const gitBranch = process.env.VERCEL_GIT_COMMIT_REF?.trim() ?? "";
  if (
    process.env.VERCEL_ENV !== "preview" ||
    !GOVERNED_UAT_GIT_BRANCHES.has(gitBranch)
  ) {
    throw new Error(
      "UAT bootstrap is restricted to governed UAT Preview branches.",
    );
  }
}

function getPasswordHash(): string {
  const hash = process.env.PREVIEW_UAT_ADMIN_PASSWORD_HASH?.trim() ?? "";
  if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash)) {
    throw new Error(
      "PREVIEW_UAT_ADMIN_PASSWORD_HASH is missing or invalid for Preview.",
    );
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
  if (
    fingerprint.database_name !== TARGET_DATABASE ||
    fingerprint.neon_project_id !== TARGET_PROJECT_ID ||
    fingerprint.neon_branch_id !== TARGET_BRANCH_ID
  ) {
    throw new Error(
      `UAT bootstrap guard rejected target database=${fingerprint.database_name}, project=${fingerprint.neon_project_id ?? "null"}, branch=${fingerprint.neon_branch_id ?? "null"}.`,
    );
  }
}

async function readTableState(): Promise<TableState> {
  const result = await getPostgresPool().query<TableState>(`
    SELECT
      to_regclass('public.clinixai_schema_migrations') IS NOT NULL
        AS migration_ledger_present,
      to_regclass('public.nexus_client_workspaces') IS NOT NULL
        AS workspaces_present,
      to_regclass('public.nexus_workspace_memberships') IS NOT NULL
        AS workspace_memberships_present,
      to_regclass('public.nexus_workspace_module_entitlements') IS NOT NULL
        AS workspace_entitlements_present,
      to_regclass('public.nexus_workspace_module_roles') IS NOT NULL
        AS workspace_roles_present
  `);
  return result.rows[0];
}

export async function getPreviewUatBootstrapStatus() {
  assertPreviewRuntime();
  const fingerprint = await readFingerprint();
  assertTarget(fingerprint);

  const tables = await readTableState();

  let migrationCount = 0;
  let maxMigration: string | null = null;
  if (tables.migration_ledger_present) {
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

  const tenant = await getPostgresPool().query<{
    tenant_count: number;
  }>(
    "SELECT count(*)::int AS tenant_count FROM tenants WHERE tenant_key = $1 AND status = 'active'",
    [TENANT_KEY],
  );

  const admin = await getPostgresPool().query<{
    admin_count: number;
  }>(
    `SELECT count(*)::int AS admin_count
       FROM application_users u
       JOIN tenant_memberships m ON m.user_id = u.id
       JOIN tenants t ON t.id = m.tenant_id
      WHERE lower(u.email) = lower($1)
        AND u.status = 'active'
        AND t.tenant_key = $2
        AND m.role_key = 'CLINIXAI_SUPER_ADMIN'
        AND m.membership_status = 'active'`,
    [ADMIN_EMAIL, TENANT_KEY],
  );

  let workspaceCount = 0;
  let enabledModuleCount = 0;
  let adminModuleRoleCount = 0;

  if (
    tables.workspaces_present &&
    tables.workspace_memberships_present &&
    tables.workspace_entitlements_present &&
    tables.workspace_roles_present
  ) {
    const workspace = await getPostgresPool().query<{
      workspace_count: number;
      enabled_module_count: number;
      admin_module_role_count: number;
    }>(
      `SELECT
         count(DISTINCT w.id)::int AS workspace_count,
         count(DISTINCT CASE WHEN e.status = 'enabled' THEN e.module_key END)::int
           AS enabled_module_count,
         count(DISTINCT CASE WHEN r.status = 'active' AND r.role_key = 'MODULE_ADMIN'
                             THEN r.module_key END)::int
           AS admin_module_role_count
       FROM tenants t
       JOIN nexus_client_workspaces w
         ON w.tenant_id = t.id
        AND w.workspace_key = $1
        AND w.status = 'active'
       LEFT JOIN nexus_workspace_module_entitlements e
         ON e.workspace_id = w.id
        AND e.environment = 'UAT'
       LEFT JOIN application_users u
         ON lower(u.email) = lower($2)
       LEFT JOIN nexus_workspace_module_roles r
         ON r.workspace_id = w.id
        AND r.user_id = u.id
        AND r.environment = 'UAT'
      WHERE t.tenant_key = $3`,
      [WORKSPACE_KEY, ADMIN_EMAIL, TENANT_KEY],
    );
    workspaceCount = Number(workspace.rows[0]?.workspace_count ?? 0);
    enabledModuleCount = Number(workspace.rows[0]?.enabled_module_count ?? 0);
    adminModuleRoleCount = Number(
      workspace.rows[0]?.admin_module_role_count ?? 0,
    );
  }

  const tenantCount = Number(tenant.rows[0]?.tenant_count ?? 0);
  const adminCount = Number(admin.rows[0]?.admin_count ?? 0);

  return {
    ...fingerprint,
    migrationCount,
    maxMigration,
    tenantCount,
    adminCount,
    workspaceCount,
    enabledModuleCount,
    adminModuleRoleCount,
    ready:
      migrationCount === EXPECTED_MIGRATION_COUNT &&
      maxMigration === EXPECTED_MIGRATION &&
      tenantCount === 1 &&
      adminCount === 1 &&
      workspaceCount === 1 &&
      enabledModuleCount === MODULES.length &&
      adminModuleRoleCount === MODULES.length,
  };
}

export async function runPreviewUatBootstrap() {
  assertPreviewRuntime();
  const passwordHash = getPasswordHash();

  const fingerprint = await readFingerprint();
  assertTarget(fingerprint);

  const before = await getPreviewUatBootstrapStatus();
  if (before.ready) {
    return { alreadyReady: true, ...before };
  }

  if (before.migrationCount < 32 || before.maxMigration === null) {
    throw new Error(
      "Governed UAT bootstrap requires the existing qualified RC1 schema through migration 032.",
    );
  }

  const migrations = await runGovernedDatabaseMigrations();
  if (
    migrations.migrationCount !== EXPECTED_MIGRATION_COUNT ||
    migrations.maxMigration !== EXPECTED_MIGRATION
  ) {
    throw new Error(
      "Governed migrations did not reach the expected 039 schema ceiling.",
    );
  }

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");

    const tenant = await client.query<{ id: string }>(
      `SELECT id
         FROM tenants
        WHERE tenant_key = $1
          AND status = 'active'
        FOR UPDATE`,
      [TENANT_KEY],
    );
    if (!tenant.rows[0]) {
      throw new Error("The governed UAT tenant was not found.");
    }
    const tenantId = tenant.rows[0].id;

    const user = await client.query<{ id: string }>(
      `UPDATE application_users
          SET password_hash = $2,
              status = 'active',
              failed_login_attempts = 0,
              locked_until = NULL,
              updated_at = now()
        WHERE lower(email) = lower($1)
        RETURNING id`,
      [ADMIN_EMAIL, passwordHash],
    );
    if (!user.rows[0]) {
      throw new Error("The governed UAT administrator identity was not found.");
    }
    const userId = user.rows[0].id;

    const platformRole = await client.query(
      `SELECT 1
         FROM platform_role_assignments
        WHERE user_id = $1
          AND role_key = 'PLATFORM_SUPER_ADMIN'
          AND status = 'active'`,
      [userId],
    );
    if (!platformRole.rows[0]) {
      throw new Error(
        "The administrator is missing the pre-existing PLATFORM_SUPER_ADMIN assignment.",
      );
    }

    await client.query(
      `INSERT INTO tenant_memberships (
         tenant_id, user_id, role_key, permissions, membership_status,
         membership_version, updated_by, updated_at
       ) VALUES ($1, $2, 'CLINIXAI_SUPER_ADMIN', '[]'::jsonb, 'active', 1, $2, now())
       ON CONFLICT (tenant_id, user_id)
       DO UPDATE SET
         role_key = 'CLINIXAI_SUPER_ADMIN',
         membership_status = 'active',
         membership_version = tenant_memberships.membership_version + 1,
         updated_by = $2,
         updated_at = now()`,
      [tenantId, userId],
    );

    const workspace = await client.query<{ id: string }>(
      `INSERT INTO nexus_client_workspaces (
         tenant_id, workspace_key, display_name, status, configuration,
         created_by, updated_by
       ) VALUES ($1, $2, $3, 'active', $4::jsonb, $5, $5)
       ON CONFLICT (tenant_id, workspace_key)
       DO UPDATE SET
         display_name = EXCLUDED.display_name,
         status = 'active',
         configuration =
           nexus_client_workspaces.configuration || EXCLUDED.configuration,
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
          SET status = 'revoked',
              revoked_at = now()
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
              'PREVIEW_UAT_BOOTSTRAPPED', 'PLATFORM_GOVERNANCE', 'success',
              $4::jsonb
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
          tenantKey: TENANT_KEY,
          workspaceKey: WORKSPACE_KEY,
          containsRealPatientData: false,
        }),
        BOOTSTRAP_VERSION,
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
