import { getPostgresPool } from "@/lib/database/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface FingerprintRow {
  current_database: string;
  neon_branch_id: string | null;
  neon_project_id: string | null;
  migration_ledger_present: boolean;
  migration_id: string | null;
  migration_count: string;
  nexus_migration_count: string;
  safety_table_count: string;
  uat_tenant_count: string;
}

export async function GET(): Promise<Response> {
  if (process.env.VERCEL_ENV === "production") {
    return new Response("Not Found", { status: 404 });
  }

  const result = await getPostgresPool().query<FingerprintRow>(`
    WITH state AS (
      SELECT
        current_database() AS current_database,
        current_setting('neon.branch_id', true) AS neon_branch_id,
        current_setting('neon.project_id', true) AS neon_project_id,
        to_regclass('public.clinixai_schema_migrations') IS NOT NULL
          AS migration_ledger_present,
        to_regclass('public.tenants') IS NOT NULL AS tenants_present
    )
    SELECT
      state.current_database,
      state.neon_branch_id,
      state.neon_project_id,
      state.migration_ledger_present,
      CASE WHEN state.migration_ledger_present THEN
        (SELECT max(migration_id) FROM clinixai_schema_migrations)
      ELSE NULL END AS migration_id,
      CASE WHEN state.migration_ledger_present THEN
        (SELECT count(*)::text FROM clinixai_schema_migrations)
      ELSE '0' END AS migration_count,
      CASE WHEN state.migration_ledger_present THEN
        (
          SELECT count(*)::text
          FROM clinixai_schema_migrations
          WHERE migration_id BETWEEN '022' AND '032'
        )
      ELSE '0' END AS nexus_migration_count,
      (
        SELECT count(*)::text
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name LIKE 'safety_%'
      ) AS safety_table_count,
      CASE WHEN state.tenants_present THEN
        (
          SELECT count(*)::text
          FROM tenants
          WHERE tenant_key IN ('nexus-uat-rc1-a', 'nexus-uat-rc1-b')
            AND status = 'active'
        )
      ELSE '0' END AS uat_tenant_count
    FROM state
  `);

  const row = result.rows[0];
  const previewBranch =
    process.env.VERCEL_GIT_COMMIT_REF?.trim() ||
    process.env.GITHUB_HEAD_REF?.trim() ||
    "";

  const nexusEnvironment =
    process.env.NEXUS_DEFAULT_ENVIRONMENT?.trim().toUpperCase() ||
    (process.env.VERCEL_ENV === "preview" &&
    previewBranch === "release/nexus-integrated-rc1"
      ? "UAT"
      : "PROD");

  const fingerprint = {
    vercelEnvironment: process.env.VERCEL_ENV ?? "unknown",
    gitBranch: previewBranch || "unknown",
    nexusEnvironment,
    database: row.current_database,
    neonProjectId: row.neon_project_id,
    neonBranchId: row.neon_branch_id,
    migrationLedgerPresent: row.migration_ledger_present,
    maxMigration: row.migration_id,
    migrationCount: Number(row.migration_count),
    nexusMigrationCount: Number(row.nexus_migration_count),
    safetyTableCount: Number(row.safety_table_count),
    uatTenantCount: Number(row.uat_tenant_count),
  };

  const ready =
    fingerprint.vercelEnvironment === "preview" &&
    fingerprint.nexusEnvironment === "UAT" &&
    fingerprint.migrationLedgerPresent &&
    fingerprint.maxMigration === "032" &&
    fingerprint.nexusMigrationCount === 11 &&
    fingerprint.safetyTableCount >= 31 &&
    fingerprint.uatTenantCount === 2 &&
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
