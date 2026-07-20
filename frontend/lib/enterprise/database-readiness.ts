import { REQUIRED_DATABASE_MIGRATIONS } from "@/lib/database/migration-registry";
import {
  getPostgresPool,
  getSafeDatabaseTarget,
} from "@/lib/database/postgres";

export interface MigrationReadinessItem {
  id: string;
  name: string;
  required: boolean;
  status: "applied" | "pending";
  checksum?: string;
  appliedAt?: string;
}

export interface DatabaseReadinessReport {
  status: "healthy" | "degraded" | "unhealthy";
  provider: string;
  configured: boolean;
  connectivityVerified: boolean;
  message: string;
  checkedAt: string;
  migrations: MigrationReadinessItem[];
  details?: unknown;
}

interface AppliedMigrationRow {
  migration_id: string;
  checksum: string;
  applied_at: Date | string;
}

export async function getDatabaseReadiness(): Promise<DatabaseReadinessReport> {
  const checkedAt = new Date().toISOString();
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    return {
      status: "unhealthy",
      provider: "memory-development",
      configured: false,
      connectivityVerified: false,
      message:
        "A production PostgreSQL DATABASE_URL is required; memory-development is not release-ready.",
      checkedAt,
      migrations: pendingMigrations(),
    };
  }

  let target;
  try {
    target = getSafeDatabaseTarget();
  } catch (error) {
    return {
      status: "unhealthy",
      provider: "unsupported",
      configured: true,
      connectivityVerified: false,
      message: error instanceof Error ? error.message : String(error),
      checkedAt,
      migrations: pendingMigrations(),
    };
  }

  try {
    const pool = getPostgresPool();
    const client = await pool.connect();

    try {
      const serverResult = await client.query<{
        database_name: string;
        database_user: string;
        server_version: string;
      }>(`
        SELECT
          current_database() AS database_name,
          current_user AS database_user,
          current_setting('server_version') AS server_version
      `);

      const tableResult = await client.query<{ exists: boolean }>(`
        SELECT to_regclass('public.clinixai_schema_migrations') IS NOT NULL AS exists
      `);

      const migrationTableExists = tableResult.rows[0]?.exists === true;
      let appliedRows: AppliedMigrationRow[] = [];

      if (migrationTableExists) {
        const appliedResult = await client.query<AppliedMigrationRow>(`
          SELECT migration_id, checksum, applied_at
          FROM clinixai_schema_migrations
          ORDER BY migration_id
        `);
        appliedRows = appliedResult.rows;
      }

      const appliedById = new Map(
        appliedRows.map((row) => [row.migration_id, row] as const),
      );
      const migrations: MigrationReadinessItem[] = REQUIRED_DATABASE_MIGRATIONS.map(
        (migration) => {
          const row = appliedById.get(migration.id);
          return {
            id: migration.id,
            name: migration.name,
            required: migration.required,
            status: row ? "applied" : "pending",
            checksum: row?.checksum,
            appliedAt: row ? new Date(row.applied_at).toISOString() : undefined,
          };
        },
      );
      const migrationsPassed = migrations.every(
        (migration) => migration.status === "applied",
      );

      const vectorResult = await client.query<{ installed: boolean }>(`
        SELECT EXISTS (
          SELECT 1 FROM pg_extension WHERE extname = 'vector'
        ) AS installed
      `);
      const server = serverResult.rows[0];

      if (!migrationsPassed) {
        return {
          status: "unhealthy",
          provider: target.provider,
          configured: true,
          connectivityVerified: true,
          message:
            "PostgreSQL connectivity is verified, but required migrations 001, 002 and 003 are not all applied.",
          checkedAt,
          migrations,
          details: {
            target,
            serverVersion: server?.server_version,
            databaseName: server?.database_name,
            databaseUser: server?.database_user,
            migrationTableExists,
            pgvectorInstalled: vectorResult.rows[0]?.installed === true,
          },
        };
      }

      return {
        status: "healthy",
        provider: target.provider,
        configured: true,
        connectivityVerified: true,
        message:
          "Production PostgreSQL connectivity and required migrations are verified directly from the database.",
        checkedAt,
        migrations,
        details: {
          target,
          serverVersion: server?.server_version,
          databaseName: server?.database_name,
          databaseUser: server?.database_user,
          migrationTableExists,
          pgvectorInstalled: vectorResult.rows[0]?.installed === true,
        },
      };
    } finally {
      client.release();
    }
  } catch (error) {
    return {
      status: "unhealthy",
      provider: target.provider,
      configured: true,
      connectivityVerified: false,
      message: "PostgreSQL connectivity or readiness verification failed.",
      checkedAt,
      migrations: pendingMigrations(),
      details: {
        target,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function pendingMigrations(): MigrationReadinessItem[] {
  return REQUIRED_DATABASE_MIGRATIONS.map((migration) => ({
    id: migration.id,
    name: migration.name,
    required: migration.required,
    status: "pending",
  }));
}
