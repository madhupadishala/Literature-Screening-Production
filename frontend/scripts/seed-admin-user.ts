/**
 * Creates (or updates) one real, password-protected user with an active
 * tenant membership, so there's an actual account to log in with instead
 * of the old fake username-guessing login.
 *
 * Usage:
 *   SEED_ADMIN_EMAIL=you@theclinixai.com \
 *   SEED_ADMIN_PASSWORD='a-real-password' \
 *   SEED_ADMIN_TENANT_KEY=demo-tenant \
 *   npx tsx scripts/seed-admin-user.ts
 *
 * Requires DATABASE_URL to point at a reachable Postgres instance with
 * migrations 001-015 already applied (docker-compose does this for you).
 */
import { Pool } from "pg";
import bcrypt from "bcryptjs";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const tenantKey = process.env.SEED_ADMIN_TENANT_KEY || "demo-tenant";
  const displayName = process.env.SEED_ADMIN_NAME || "ClinixAI Admin";

  if (!email || !password) {
    console.error(
      "SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required environment variables.",
    );
    process.exit(1);
  }

  if (password.length < 12) {
    console.error("SEED_ADMIN_PASSWORD should be at least 12 characters.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const passwordHash = await bcrypt.hash(password, 12);

    const tenant = await client.query<{ id: string }>(
      `INSERT INTO tenants (tenant_key, display_name, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (tenant_key) DO UPDATE SET updated_at = now()
       RETURNING id`,
      [tenantKey, `${tenantKey} workspace`],
    );

    const user = await client.query<{ id: string }>(
      `INSERT INTO application_users (email, display_name, password_hash, status, failed_login_attempts, locked_until)
       VALUES ($1, $2, $3, 'active', 0, NULL)
       ON CONFLICT (email)
       DO UPDATE SET password_hash = EXCLUDED.password_hash,
                      display_name = EXCLUDED.display_name,
                      failed_login_attempts = 0,
                      locked_until = NULL,
                      status = 'active',
                      updated_at = now()
       RETURNING id`,
      [email, displayName, passwordHash],
    );

    await client.query(
      `INSERT INTO tenant_memberships (tenant_id, user_id, role_key, permissions, membership_status)
       VALUES ($1, $2, 'CLINIXAI_SUPER_ADMIN', '[]'::jsonb, 'active')
       ON CONFLICT (tenant_id, user_id)
       DO UPDATE SET role_key = 'CLINIXAI_SUPER_ADMIN', membership_status = 'active'`,
      [tenant.rows[0].id, user.rows[0].id],
    );

    await client.query("COMMIT");
    console.log(`Seeded admin user ${email} on tenant "${tenantKey}".`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
