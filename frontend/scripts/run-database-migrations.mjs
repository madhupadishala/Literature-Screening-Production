import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;
const projectRoot = process.cwd();
const migrationsRoot = path.join(projectRoot, "database", "migrations");
const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.error("DATABASE_URL is not configured.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: buildSslConfiguration(),
  max: 2,
  connectionTimeoutMillis: 15_000,
  statement_timeout: 120_000,
  application_name: "ClinixAI Sprint 6 Migration Runner",
});

let client;
let exitCode = 0;

try {
  client = await pool.connect();
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
    throw new Error(`No migration files found in ${migrationsRoot}`);
  }

  for (const filename of filenames) {
    const migrationId = filename.slice(0, 3);
    const migrationName = filename
      .replace(/^\d{3}_/, "")
      .replace(/\.sql$/i, "")
      .replaceAll("_", " ");
    const sql = await readFile(path.join(migrationsRoot, filename), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");

    const existing = await client.query(
      `
        SELECT checksum, applied_at
        FROM clinixai_schema_migrations
        WHERE migration_id = $1
      `,
      [migrationId],
    );

    if (existing.rowCount === 1) {
      if (existing.rows[0].checksum !== checksum) {
        throw new Error(
          `Migration ${migrationId} was already applied with a different checksum.`,
        );
      }

      console.log(`SKIPPED ${migrationId} ${migrationName} (already applied)`);
      continue;
    }

    const startedAt = performance.now();
    await client.query("BEGIN");

    try {
      await client.query(sql);
      const executionMs = Math.max(0, Math.round(performance.now() - startedAt));
      await client.query(
        `
          INSERT INTO clinixai_schema_migrations (
            migration_id,
            migration_name,
            checksum,
            execution_ms
          ) VALUES ($1, $2, $3, $4)
        `,
        [migrationId, migrationName, checksum, executionMs],
      );
      await client.query("COMMIT");
      console.log(`APPLIED ${migrationId} ${migrationName} (${executionMs} ms)`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  const summary = await client.query(`
    SELECT migration_id, migration_name, checksum, applied_at, execution_ms
    FROM clinixai_schema_migrations
    ORDER BY migration_id
  `);

  console.log("\nDATABASE MIGRATION SUMMARY");
  console.table(summary.rows);
} catch (error) {
  exitCode = 1;
  console.error("Database migration failed.");
  console.error(error instanceof Error ? error.stack || error.message : String(error));
} finally {
  if (client) {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [
        "clinixai_schema_migrations",
      ]);
    } catch {
      // The connection may already be unavailable.
    }
    client.release();
  }
  await pool.end();
}

process.exitCode = exitCode;

function buildSslConfiguration() {
  const mode = process.env.DATABASE_SSL_MODE?.trim().toLowerCase();
  if (!mode || mode === "disable") return false;
  if (mode === "no-verify") return { rejectUnauthorized: false };
  if (mode === "require") return { rejectUnauthorized: false };
  if (mode === "verify-full") return { rejectUnauthorized: true };
  throw new Error(
    "DATABASE_SSL_MODE must be disable, no-verify, require, or verify-full.",
  );
}
