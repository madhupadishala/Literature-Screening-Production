import pg from "pg";
import process from "node:process";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: false,
  max: 2,
  application_name: "ClinixAI Demo Workspace Setup",
});

const tenantId = "01f0dcd2-416d-486b-93bc-371d834901f3";
const adminId = "9dcb2e9c-c89c-44ea-8ec9-45ea156a17c5";

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Create workspace
    const ws = await client.query(`
      INSERT INTO nexus_client_workspaces (tenant_id, workspace_key, display_name, status, created_by, updated_by)
      VALUES ($1, 'literature-workspace', 'Literature Screening Workspace', 'active', $2, $2)
      ON CONFLICT (tenant_id, workspace_key) DO UPDATE SET status = 'active', updated_by = EXCLUDED.updated_by, updated_at = now()
      RETURNING id`,
      [tenantId, adminId]
    );
    const workspaceId = ws.rows[0].id;
    console.log('Workspace:', workspaceId);

    // Add admin membership
    await client.query(`
      INSERT INTO nexus_workspace_memberships (tenant_id, workspace_id, user_id, workspace_role, status, updated_by)
      VALUES ($1, $2, $3, 'WORKSPACE_ADMIN', 'active', $3)
      ON CONFLICT (tenant_id, workspace_id, user_id) DO UPDATE SET workspace_role = 'WORKSPACE_ADMIN', status = 'active', updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [tenantId, workspaceId, adminId]
    );
    console.log('Admin membership added');

    // Add all demo users
    const users = await client.query(`SELECT id FROM application_users WHERE email LIKE 'demo.%'`);
    for (const user of users.rows) {
      await client.query(`
        INSERT INTO nexus_workspace_memberships (tenant_id, workspace_id, user_id, workspace_role, status, updated_by)
        VALUES ($1, $2, $3, 'WORKSPACE_MEMBER', 'active', $3)
        ON CONFLICT (tenant_id, workspace_id, user_id) DO UPDATE SET workspace_role = 'WORKSPACE_MEMBER', status = 'active', updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [tenantId, workspaceId, user.id]
      );
    }
    console.log('All users added to workspace');

    // Add literature module entitlement
    await client.query(`
      INSERT INTO nexus_workspace_module_entitlements (tenant_id, workspace_id, environment, module_key, status, updated_by)
      VALUES ($1, $2, 'PROD', 'literature', 'enabled', $3)
      ON CONFLICT (workspace_id, environment, module_key) DO UPDATE SET status = 'enabled', updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [tenantId, workspaceId, adminId]
    );
    console.log('Literature entitlement added');

    // Add roles for all users
    const roles = ['MODULE_VIEWER', 'MODULE_OPERATOR', 'MODULE_REVIEWER', 'MODULE_QC', 'MODULE_MEDICAL_REVIEWER', 'MODULE_MANAGER', 'MODULE_ADMIN'];
    for (const user of users.rows) {
      for (const role of roles) {
        await client.query(`
          INSERT INTO nexus_workspace_module_roles (tenant_id, workspace_id, user_id, environment, module_key, role_key, status, updated_by)
          VALUES ($1, $2, $3, 'PROD', 'literature', $4, 'active', $3)
          ON CONFLICT (workspace_id, user_id, environment, module_key, role_key) DO UPDATE SET status = 'active', updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [tenantId, workspaceId, user.id, role]
        );
      }
    }
    console.log('All roles added');

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