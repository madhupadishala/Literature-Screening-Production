import process from "node:process";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL?.trim();
const requiredMigrations = ["001", "002", "003"];

if (!databaseUrl) {
  console.error("DATABASE_URL is not configured.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: buildSslConfiguration(),
  max: 1,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 30_000,
  application_name: "ClinixAI Sprint 6 Database Verification",
});

let exitCode = 0;

try {
  const server = await pool.query(`
    SELECT
      current_database() AS database_name,
      current_user AS database_user,
      current_setting('server_version') AS server_version
  `);
  const migrations = await pool.query(`
    SELECT migration_id, migration_name, checksum, applied_at, execution_ms
    FROM clinixai_schema_migrations
    ORDER BY migration_id
  `);
  const vector = await pool.query(`
    SELECT EXISTS (
      SELECT 1 FROM pg_extension WHERE extname = 'vector'
    ) AS installed
  `);

  const applied = new Set(migrations.rows.map((row) => row.migration_id));
  const missing = requiredMigrations.filter((id) => !applied.has(id));

  console.log("POSTGRESQL SERVER");
  console.table(server.rows);
  console.log("PGVECTOR EXTENSION");
  console.table(vector.rows);
  console.log("APPLIED MIGRATIONS");
  console.table(migrations.rows);

  if (missing.length > 0) {
    exitCode = 1;
    console.error(`Missing required migrations: ${missing.join(", ")}`);
  } else if (vector.rows[0]?.installed !== true) {
    exitCode = 1;
    console.error("The pgvector extension is not installed.");
  } else {
    console.log("Sprint 6 PostgreSQL foundation verification PASSED.");
  }
} catch (error) {
  exitCode = 1;
  console.error("Sprint 6 PostgreSQL verification FAILED.");
  console.error(error instanceof Error ? error.stack || error.message : String(error));
} finally {
  await pool.end();
}

process.exitCode = exitCode;

function buildSslConfiguration() {
  const mode = process.env.DATABASE_SSL_MODE?.trim().toLowerCase();
  if (!mode || mode === "disable") return false;
  if (mode === "no-verify" || mode === "require") {
    return { rejectUnauthorized: false };
  }
  if (mode === "verify-full") return { rejectUnauthorized: true };
  throw new Error(
    "DATABASE_SSL_MODE must be disable, no-verify, require, or verify-full.",
  );
}
