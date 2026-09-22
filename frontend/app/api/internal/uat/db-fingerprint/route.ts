import { getPostgresPool } from "@/lib/database/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  if (process.env.VERCEL_ENV === "production") {
    return new Response("Not Found", { status: 404 });
  }

  const result = await getPostgresPool().query<{
    current_database: string;
    migration_id: string | null;
    migration_count: string;
    safety_table_count: string;
  }>(`
    SELECT
      current_database() AS current_database,
      (SELECT max(migration_id) FROM clinixai_schema_migrations) AS migration_id,
      (SELECT count(*)::text FROM clinixai_schema_migrations) AS migration_count,
      (
        SELECT count(*)::text
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name LIKE 'safety_%'
      ) AS safety_table_count
  `);

  return Response.json(
    {
      environment: process.env.VERCEL_ENV ?? "unknown",
      database: result.rows[0].current_database,
      maxMigration: result.rows[0].migration_id,
      migrationCount: Number(result.rows[0].migration_count),
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
