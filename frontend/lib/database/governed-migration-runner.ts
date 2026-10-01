import "server-only";

import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { getPostgresPool } from "@/lib/database/postgres";

export type MigrationRunResult = {
  migrationCount: number;
  maxMigration: string;
  applied: string[];
  skipped: string[];
};

export async function runGovernedDatabaseMigrations(): Promise<MigrationRunResult> {
  const pool = getPostgresPool();
  const client = await pool.connect();
  const migrationsRoot = path.join(process.cwd(), "database", "migrations");
  const applied: string[] = [];
  const skipped: string[] = [];

  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [
      "clinixai_schema_migrations",
    ]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS clinixai_schema_migrations (
        migration_id text PRIMARY KEY,
        migration_name text NOT NULL,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now(),
        execution_ms integer NOT NULL CHECK (execution_ms >= 0)
      )
    `);

    const filenames = (await readdir(migrationsRoot))
      .filter((filename) => /^\d{3}_.+\.sql$/i.test(filename))
      .sort((left, right) => left.localeCompare(right));

    if (filenames.length === 0) {
      throw new Error("No governed migration files were packaged with the deployment.");
    }

    for (const filename of filenames) {
      const migrationId = filename.slice(0, 3);
      const migrationName = filename
        .replace(/^\d{3}_/, "")
        .replace(/\.sql$/i, "")
        .replaceAll("_", " ");
      const sql = await readFile(path.join(migrationsRoot, filename), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");

      const existing = await client.query<{ checksum: string }>(
        `SELECT checksum
           FROM clinixai_schema_migrations
          WHERE migration_id = $1`,
        [migrationId],
      );

      if (existing.rowCount === 1) {
        if (existing.rows[0].checksum !== checksum) {
          throw new Error(
            `Migration ${migrationId} was already applied with a different checksum.`,
          );
        }
        skipped.push(migrationId);
        continue;
      }

      const startedAt = performance.now();
      await client.query("BEGIN");
      try {
        await client.query(sql);
        const executionMs = Math.max(0, Math.round(performance.now() - startedAt));
        await client.query(
          `INSERT INTO clinixai_schema_migrations (
             migration_id, migration_name, checksum, execution_ms
           ) VALUES ($1, $2, $3, $4)`,
          [migrationId, migrationName, checksum, executionMs],
        );
        await client.query("COMMIT");
        applied.push(migrationId);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    const summary = await client.query<{
      migration_count: number;
      max_migration: string;
    }>(
      `SELECT count(*)::int AS migration_count,
              max(migration_id) AS max_migration
         FROM clinixai_schema_migrations`,
    );

    return {
      migrationCount: Number(summary.rows[0]?.migration_count ?? 0),
      maxMigration: summary.rows[0]?.max_migration ?? "",
      applied,
      skipped,
    };
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [
        "clinixai_schema_migrations",
      ]);
    } catch {
      // Connection may already be unavailable.
    }
    client.release();
  }
}
