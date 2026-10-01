import { randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";
import pg from "pg";

const { Pool } = pg;
const TARGET_BRANCH = "cleanup/zero-deviation-baseline-20260930";
const ADMIN_EMAIL = "support@theclinixai.com";
const TENANT_KEY = "clinixai-prod";

function sslConfiguration() {
  const mode = process.env.DATABASE_SSL_MODE?.trim().toLowerCase();
  if (!mode || mode === "disable") return false;
  if (mode === "no-verify" || mode === "require") return { rejectUnauthorized: false };
  if (mode === "verify-full") return { rejectUnauthorized: true };
  throw new Error("DATABASE_SSL_MODE must be disable, no-verify, require, or verify-full.");
}

async function main() {
  const environment = process.env.VERCEL_ENV?.trim().toLowerCase();
  const branch = process.env.VERCEL_GIT_COMMIT_REF?.trim();

  if (environment !== "preview" || branch !== TARGET_BRANCH) {
    console.log("ADMIN_RESET_SKIPPED: preview cleanup branch guard did not match.");
    return;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");

  const temporaryPassword = `CA!${randomBytes(18).toString("base64url")}`;
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: sslConfiguration(),
    max: 1,
    application_name: "ClinixAI One-Time Admin Reset",
  });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const tenant = await client.query(
      `SELECT id, display_name
         FROM tenants
        WHERE tenant_key = $1
          AND status = 'active'
        LIMIT 1`,
      [TENANT_KEY],
    );
    if (!tenant.rows[0]) {
      throw new Error(`Active tenant "${TENANT_KEY}" was not found. No reset was performed.`);
    }

    const user = await client.query(
      `INSERT INTO application_users (
         email, display_name, password_hash, status,
         failed_login_attempts, locked_until, updated_at
       ) VALUES ($1, 'ClinixAI Super Admin', $2, 'active', 0, NULL, now())
       ON CONFLICT (email)
       DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         status = 'active',
         failed_login_attempts = 0,
         locked_until = NULL,
         updated_at = now()
       RETURNING id, email`,
      [ADMIN_EMAIL, passwordHash],
    );

    await client.query(
      `INSERT INTO tenant_memberships (
         tenant_id, user_id, role_key, permissions, membership_status,
         membership_version, updated_at
       ) VALUES ($1, $2, 'CLINIXAI_SUPER_ADMIN', '[]'::jsonb, 'active', 1, now())
       ON CONFLICT (tenant_id, user_id)
       DO UPDATE SET
         role_key = 'CLINIXAI_SUPER_ADMIN',
         membership_status = 'active',
         membership_version = tenant_memberships.membership_version + 1,
         updated_at = now()`,
      [tenant.rows[0].id, user.rows[0].id],
    );

    const identitySessionsPresent = await client.query(
      "SELECT to_regclass('public.nexus_identity_sessions') IS NOT NULL AS present",
    );
    if (identitySessionsPresent.rows[0]?.present) {
      await client.query(
        `UPDATE nexus_identity_sessions
            SET status = 'revoked', revoked_at = now()
          WHERE user_id = $1
            AND status = 'active'`,
        [user.rows[0].id],
      );
    }

    await client.query("COMMIT");

    console.log("ADMIN_RESET_SUCCESS");
    console.log(`ADMIN_RESET_EMAIL=${ADMIN_EMAIL}`);
    console.log(`ADMIN_RESET_TENANT=${TENANT_KEY}`);
    console.log(`ADMIN_RESET_PASSWORD=${temporaryPassword}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("ADMIN_RESET_FAILED", error);
  process.exit(1);
});
