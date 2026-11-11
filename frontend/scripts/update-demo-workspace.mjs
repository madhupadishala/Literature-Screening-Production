import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: false,
  max: 2,
  application_name: "ClinixAI Update Demo Workspace",
});

const tenantId = "01f0dcd2-416d-486b-93bc-371d834901f3";
const workspaceId = "426ed2a6-2a7b-41f6-846e-b8e9e4976a0c";
const environment = "PROD";

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE literature_packages
       SET workspace_id = $1, environment = $2, updated_at = now()
       WHERE tenant_id = $3 AND workspace_id IS NULL`,
      [workspaceId, environment, tenantId]
    );
    console.log('Updated', result.rowCount, 'packages');

    await client.query("COMMIT");
    console.log('Done!');
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);