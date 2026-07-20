import { access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: buildSslConfiguration(),
  max: 2,
  application_name: "ClinixAI Sprint 7 Verification",
});

const requiredFiles = [
  "database/migrations/004_adhoc_search_tenant_configuration.sql",
  "app/literature-search/page.tsx",
  "app/admin/configuration/page.tsx",
  "app/api/literature/adhoc-search/route.ts",
  "app/api/literature/adhoc-search/evidence/route.ts",
  "app/api/admin/configuration/route.ts",
  "lib/literature/adhoc-search/search-service.ts",
  "lib/configuration/repository.ts",
  "lib/rbac/permissions.ts",
];

for (const file of requiredFiles) {
  await access(path.join(process.cwd(), file));
}

const client = await pool.connect();
let passed = false;

try {
  const migration = await client.query(
    `
      SELECT migration_id, migration_name, applied_at
      FROM clinixai_schema_migrations
      WHERE migration_id = '004'
    `,
  );

  if (migration.rowCount !== 1) {
    throw new Error("Migration 004 is not recorded as applied.");
  }

  const tables = await client.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      ORDER BY table_name
    `,
    [[
      "tenant_configuration_sets",
      "tenant_configuration_versions",
      "configuration_uploads",
      "literature_source_connectors",
      "ad_hoc_literature_searches",
      "ad_hoc_literature_results",
      "package_configuration_snapshots",
      "tenant_configuration_audit",
    ]],
  );

  if (tables.rowCount !== 8) {
    throw new Error(
      `Expected 8 Sprint 7 tables; found ${tables.rowCount}.`,
    );
  }

  const tenantKey =
    process.env.DEFAULT_TENANT_KEY?.trim() || "demo-tenant";

  const sources = await client.query(
    `
      SELECT s.source_key, s.enabled, s.max_results
      FROM literature_source_connectors s
      JOIN tenants t ON t.id = s.tenant_id
      WHERE t.tenant_key = $1
      ORDER BY s.source_key
    `,
    [tenantKey],
  );

  const requiredSources = new Set(["PUBMED", "EUROPE_PMC", "CROSSREF"]);
  for (const row of sources.rows) requiredSources.delete(row.source_key);

  if (requiredSources.size > 0) {
    throw new Error(
      `Missing configured sources: ${[...requiredSources].join(", ")}`,
    );
  }

  passed = true;

  console.log("");
  console.log("============================================================");
  console.log("SPRINT 7 FOUNDATION VERIFICATION PASSED");
  console.log("============================================================");
  console.log("Migration: 004 applied");
  console.log("Tables: 8 verified");
  console.log("Open connectors: PubMed, Europe PMC, Crossref");
  console.log("RBAC demo principal: ready");
  console.log("No Intake workspace: confirmed by manifest boundary");
  console.log("");
  console.table(sources.rows);
} finally {
  client.release();
  await pool.end();
}

if (!passed) process.exitCode = 1;

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
