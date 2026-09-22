import { getPostgresPool } from "@/lib/database/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  if (process.env.VERCEL_ENV === "production") {
    return new Response("Not Found", { status: 404 });
  }

  const result = await getPostgresPool().query<{
    current_database: string;
    neon_branch_id: string | null;
    neon_project_id: string | null;
    migration_id: string | null;
    migration_count: string;
    nexus_migration_count: string;
    safety_table_count: string;
  }>(`
    SELECT
      current_database() AS current_database,
      current_setting('neon.branch_id', true) AS neon_branch_id,
      current_setting('neon.project_id', true) AS neon_project_id,
      (SELECT max(migration_id) FROM clinixai_schema_migrations) AS migration_id,
      (SELECT count(*)::text FROM clinixai_schema_migrations) AS migration_count,
      (
        SELECT count(*)::text
        FROM clinixai_schema_migrations
        WHERE migration_id BETWEEN '022' AND '031'
      ) AS nexus_migration_count,
      (
        SELECT count(*)::text
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name LIKE 'safety_%'
      ) AS safety_table_count
  `);

  return Response.json(
    {
      vercelEnvironment: process.env.VERCEL_ENV ?? "unknown",
      nexusEnvironment: process.env.NEXUS_DEFAULT_ENVIRONMENT ?? "PROD",
      database: result.rows[0].current_database,
      neonProjectId: result.rows[0].neon_project_id,
      neonBranchId: result.rows[0].neon_branch_id,
      maxMigration: result.rows[0].migration_id,
      migrationCount: Number(result.rows[0].migration_count),
      nexusMigrationCount: Number(result.rows[0].nexus_migration_count),
      safetyTableCount: Number(result.rows[0].safety_table_count),
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
