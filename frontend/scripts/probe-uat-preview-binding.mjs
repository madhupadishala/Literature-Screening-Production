import pg from "pg";

const { Pool } = pg;

const isRc1Preview =
  process.env.VERCEL_ENV === "preview" &&
  process.env.VERCEL_GIT_COMMIT_REF === "release/nexus-integrated-rc1";

if (!isRc1Preview || !process.env.DATABASE_URL?.trim()) {
  console.log("UAT preview DB binding probe skipped.");
  process.exit(0);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL.trim(),
  max: 1,
  connectionTimeoutMillis: 15_000,
  statement_timeout: 30_000,
  application_name: "Nexus RC1 Preview Binding Probe",
});

let payload = {
  gitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  database: null,
  neonProjectId: null,
  neonBranchId: null,
  migrationLedgerPresent: false,
  maxMigration: null,
  migrationCount: 0,
  error: null,
};

try {
  const result = await pool.query(`
    WITH state AS (
      SELECT
        current_database() AS current_database,
        current_setting('neon.project_id', true) AS neon_project_id,
        current_setting('neon.branch_id', true) AS neon_branch_id,
        to_regclass('public.clinixai_schema_migrations') IS NOT NULL
          AS migration_ledger_present
    )
    SELECT
      state.current_database,
      state.neon_project_id,
      state.neon_branch_id,
      state.migration_ledger_present,
      CASE WHEN state.migration_ledger_present THEN
        (SELECT max(migration_id) FROM clinixai_schema_migrations)
      ELSE NULL END AS max_migration,
      CASE WHEN state.migration_ledger_present THEN
        (SELECT count(*)::int FROM clinixai_schema_migrations)
      ELSE 0 END AS migration_count
    FROM state
  `);

  payload = {
    ...payload,
    database: result.rows[0]?.current_database ?? null,
    neonProjectId: result.rows[0]?.neon_project_id ?? null,
    neonBranchId: result.rows[0]?.neon_branch_id ?? null,
    migrationLedgerPresent: result.rows[0]?.migration_ledger_present === true,
    maxMigration: result.rows[0]?.max_migration ?? null,
    migrationCount: Number(result.rows[0]?.migration_count ?? 0),
  };
} catch (error) {
  payload.error =
    error instanceof Error
      ? `${error.name}: ${error.message}`.slice(0, 500)
      : "Unknown preview database probe error";
} finally {
  await pool.end().catch(() => undefined);
}

try {
  const response = await fetch(
    "https://br-square-breeze-b3yxypxx-uatrc1.compute.c-4.ap-southeast-1.aws.neon.tech/",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-uat-probe-token": "nexus-rc1-binding-probe-20260922-v1",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!response.ok) {
    throw new Error(`receipt endpoint returned HTTP ${response.status}`);
  }

  console.log(
    "UAT preview DB binding fingerprint captured:",
    JSON.stringify({
      database: payload.database,
      neonProjectId: payload.neonProjectId,
      neonBranchId: payload.neonBranchId,
      migrationLedgerPresent: payload.migrationLedgerPresent,
      maxMigration: payload.maxMigration,
      migrationCount: payload.migrationCount,
      probeError: payload.error,
    }),
  );
} catch (error) {
  console.warn(
    "UAT preview DB binding receipt failed:",
    error instanceof Error ? error.message : String(error),
  );
}
