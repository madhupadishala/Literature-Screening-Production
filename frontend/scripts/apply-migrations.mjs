import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
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
  ssl: false,
  max: 2,
  connectionTimeoutMillis: 15_000,
  statement_timeout: 120_000,
  application_name: "ClinixAI Migration Runner",
});

let client;
let exitCode = 0;

try {
  client = await pool.connect();
  await client.query("SELECT pg_advisory_lock(12345)");

  const filenames = (await readdir(migrationsRoot))
    .filter((filename) => /^\d{3}_.+\.sql$/i.test(filename))
    .sort((left, right) => left.localeCompare(right))
    .filter(f => parseInt(f.slice(0,3)) > 15);

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
      await client.query("SELECT pg_advisory_unlock(12345)");
    } catch {
      // The connection may already be unavailable.
    }
    client.release();
  }
  await pool.end();
}

process.exitCode = exitCode;