import { getPostgresPool } from "@/lib/database/postgres";
import { getDefaultNexusEnvironment } from "@/lib/nexus/runtime-environment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  if (process.env.VERCEL_ENV === "production") {
    return new Response("Not Found", { status: 404 });
  }

  const pool = getPostgresPool();

  const base = await pool.query<{
    current_database: string;
    neon_branch_id: string | null;
    neon_project_id: string | null;
    migration_ledger_present: boolean;
    tenants_present: boolean;
  }>(`
    SELECT
      current_database() AS current_database,
      current_setting('neon.branch_id', true) AS neon_branch_id,
      current_setting('neon.project_id', true) AS neon_project_id,
      to_regclass('public.clinixai_schema_migrations') IS NOT NULL
        AS migration_ledger_present,
      to_regclass('public.tenants') IS NOT NULL AS tenants_present
  `);

  const baseRow = base.rows[0];

  let migrationId: string | null = null;
  let migrationCount = 0;
  let nexusMigrationCount = 0;

  if (baseRow.migration_ledger_present) {
    const ledger = await pool.query<{
      migration_id: string | null;
      migration_count: string;
      nexus_migration_count: string;
    }>(`
      SELECT
        max(migration_id) AS migration_id,
        count(*)::text AS migration_count,
        count(*) FILTER (
          WHERE migration_id BETWEEN '022' AND '039'
        )::text AS nexus_migration_count
      FROM clinixai_schema_migrations
    `);
    migrationId = ledger.rows[0].migration_id;
    migrationCount = Number(ledger.rows[0].migration_count);
    nexusMigrationCount = Number(ledger.rows[0].nexus_migration_count);
  }

  const safetyTables = await pool.query<{
    safety_table_count: string;
  }>(`
    SELECT count(*)::text AS safety_table_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name LIKE 'safety_%'
  `);

  let uatTenantCount = 0;
  if (baseRow.tenants_present) {
    const tenants = await pool.query<{ uat_tenant_count: string }>(`
      SELECT count(*)::text AS uat_tenant_count
      FROM tenants
      WHERE tenant_key IN ('uat-tenant', 'nexus-uat-rc1-a', 'nexus-uat-rc1-b')
        AND status = 'active'
    `);
    uatTenantCount = Number(tenants.rows[0].uat_tenant_count);
  }

  const previewBranch =
    process.env.VERCEL_GIT_COMMIT_REF?.trim() ||
    process.env.GITHUB_HEAD_REF?.trim() ||
    "";

  const nexusEnvironment = getDefaultNexusEnvironment();

  const fingerprint = {
    vercelEnvironment: process.env.VERCEL_ENV ?? "unknown",
    gitBranch: previewBranch || "unknown",
    nexusEnvironment,
    database: baseRow.current_database,
    neonProjectId: baseRow.neon_project_id,
    neonBranchId: baseRow.neon_branch_id,
    migrationLedgerPresent: baseRow.migration_ledger_present,
    maxMigration: migrationId,
    migrationCount,
    nexusMigrationCount,
    safetyTableCount: Number(safetyTables.rows[0].safety_table_count),
    uatTenantCount,
  };

  const ready =
    fingerprint.vercelEnvironment === "preview" &&
    fingerprint.nexusEnvironment === "UAT" &&
    fingerprint.migrationLedgerPresent &&
    fingerprint.maxMigration === "039" &&
    fingerprint.nexusMigrationCount === 18 &&
    fingerprint.safetyTableCount >= 31 &&
    fingerprint.uatTenantCount >= 1 &&
    Boolean(fingerprint.neonProjectId) &&
    Boolean(fingerprint.neonBranchId);

  return Response.json(
    {
      ready,
      ...fingerprint,
    },
    {
      status: ready ? 200 : 503,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

