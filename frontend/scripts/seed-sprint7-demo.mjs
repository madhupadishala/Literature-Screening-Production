import process from "node:process";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured.");
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: buildSslConfiguration(),
  max: 2,
  application_name: "ClinixAI Sprint 7 Seed",
});

const tenantKey = process.env.DEFAULT_TENANT_KEY?.trim() || "demo-tenant";
const tenantName =
  process.env.DEFAULT_TENANT_NAME?.trim() ||
  "ClinixAI Investor Demonstration";
const email =
  process.env.DEFAULT_USER_EMAIL?.trim() ||
  "product.admin@theclinixai.local";
const displayName =
  process.env.DEFAULT_USER_DISPLAY_NAME?.trim() ||
  "Product Administrator";
const roleKey =
  process.env.DEFAULT_ROLE_KEY?.trim() || "CLINIXAI_SUPER_ADMIN";

const client = await pool.connect();

try {
  await client.query("BEGIN");

  const tenant = await client.query(
    `
      INSERT INTO tenants (tenant_key, display_name, status)
      VALUES ($1, $2, 'active')
      ON CONFLICT (tenant_key)
      DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now()
      RETURNING id
    `,
    [tenantKey, tenantName],
  );

  const user = await client.query(
    `
      INSERT INTO application_users (email, display_name, status)
      VALUES ($1, $2, 'active')
      ON CONFLICT (email)
      DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now()
      RETURNING id
    `,
    [email, displayName],
  );

  await client.query(
    `
      INSERT INTO tenant_memberships (
        tenant_id,
        user_id,
        role_key,
        permissions
      )
      VALUES ($1, $2, $3, '[]'::jsonb)
      ON CONFLICT (tenant_id, user_id)
      DO UPDATE SET role_key = EXCLUDED.role_key
    `,
    [tenant.rows[0].id, user.rows[0].id, roleKey],
  );

  const sources = [
    [
      "PUBMED",
      "PubMed / MEDLINE",
      "PUBMED_EUTILITIES",
      "https://eutils.ncbi.nlm.nih.gov/entrez/eutils",
      200,
    ],
    [
      "EUROPE_PMC",
      "Europe PMC",
      "EUROPE_PMC_REST",
      "https://www.ebi.ac.uk/europepmc/webservices/rest/search",
      200,
    ],
    [
      "CROSSREF",
      "Crossref",
      "CROSSREF_REST",
      "https://api.crossref.org/v1/works",
      200,
    ],
  ];

  for (const source of sources) {
    await client.query(
      `
        INSERT INTO literature_source_connectors (
          tenant_id,
          source_key,
          display_name,
          connector_type,
          enabled,
          base_url,
          max_results,
          settings,
          created_by,
          updated_by
        )
        VALUES ($1, $2, $3, $4, true, $5, $6, '{}'::jsonb, $7, $7)
        ON CONFLICT (tenant_id, source_key)
        DO UPDATE SET
          display_name = EXCLUDED.display_name,
          connector_type = EXCLUDED.connector_type,
          base_url = EXCLUDED.base_url,
          updated_at = now()
      `,
      [
        tenant.rows[0].id,
        source[0],
        source[1],
        source[2],
        source[3],
        source[4],
        user.rows[0].id,
      ],
    );
  }

  await client.query("COMMIT");

  console.log("Sprint 7 demo principal and open literature sources are ready.");
  console.table([
    {
      tenant: tenantKey,
      user: email,
      role: roleKey,
      sources: sources.map((source) => source[0]).join(", "),
    },
  ]);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}

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
