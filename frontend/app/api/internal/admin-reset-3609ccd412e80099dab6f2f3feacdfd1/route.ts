import { randomBytes } from "node:crypto";

import { getPostgresPool } from "@/lib/database/postgres";
import { hashPassword } from "@/lib/auth/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TARGET_BRANCH = "cleanup/zero-deviation-baseline-20260930";
const RESET_NONCE = "3609ccd412e80099dab6f2f3feacdfd1";
const ADMIN_EMAIL = "support@theclinixai.com";
const TENANT_KEY = "clinixai-prod";

function page(title: string, body: string, status = 200): Response {
  return new Response(
    `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
body{font-family:Arial,sans-serif;background:#0b2740;color:#102a43;margin:0;padding:24px}
main{max-width:560px;margin:8vh auto;background:#fff;border-radius:20px;padding:28px;box-shadow:0 12px 40px rgba(0,0,0,.2)}
h1{margin:0 0 16px;font-size:28px}p{line-height:1.5}
code{display:block;padding:14px;border-radius:10px;background:#f3f6f9;font-size:18px;word-break:break-all}
.note{font-size:14px;color:#5c6773}
</style>
</head>
<body><main><h1>${title}</h1>${body}</main></body>
</html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, private",
        "X-Robots-Tag": "noindex, nofollow",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export async function GET(): Promise<Response> {
  const environment = process.env.VERCEL_ENV?.trim().toLowerCase();
  const gitBranch = process.env.VERCEL_GIT_COMMIT_REF?.trim();

  if (environment !== "preview" || gitBranch !== TARGET_BRANCH) {
    return new Response("Not Found", { status: 404 });
  }

  const pool = getPostgresPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `admin-reset:${RESET_NONCE}`,
    ]);

    const alreadyUsed = await client.query(
      `SELECT 1
         FROM audit_events
        WHERE event_type = 'ADMIN_CREDENTIAL_RESET'
          AND details->>'resetNonce' = $1
          AND outcome = 'success'
        LIMIT 1`,
      [RESET_NONCE],
    );

    if (alreadyUsed.rows[0]) {
      await client.query("ROLLBACK");
      return page(
        "Admin reset already used",
        "<p>This one-time reset link has already been consumed. No password was changed.</p>",
        410,
      );
    }

    const tenant = await client.query<{ id: string; display_name: string }>(
      `SELECT id, display_name
         FROM tenants
        WHERE tenant_key = $1
          AND status = 'active'
        LIMIT 1`,
      [TENANT_KEY],
    );
    if (!tenant.rows[0]) {
      throw new Error(`Active tenant "${TENANT_KEY}" was not found.`);
    }

    const temporaryPassword = `CA!${randomBytes(18).toString("base64url")}`;
    const passwordHash = await hashPassword(temporaryPassword);

    const existing = await client.query<{ id: string }>(
      `SELECT id
         FROM application_users
        WHERE lower(email) = lower($1)
        ORDER BY created_at
        LIMIT 1`,
      [ADMIN_EMAIL],
    );

    let userId: string;
    if (existing.rows[0]) {
      userId = existing.rows[0].id;
      await client.query(
        `UPDATE application_users
            SET email = $2,
                password_hash = $3,
                status = 'active',
                failed_login_attempts = 0,
                locked_until = NULL,
                updated_at = now()
          WHERE id = $1`,
        [userId, ADMIN_EMAIL, passwordHash],
      );
    } else {
      const created = await client.query<{ id: string }>(
        `INSERT INTO application_users (
           email, display_name, password_hash, status,
           failed_login_attempts, locked_until
         ) VALUES ($1, 'ClinixAI Super Admin', $2, 'active', 0, NULL)
         RETURNING id`,
        [ADMIN_EMAIL, passwordHash],
      );
      userId = created.rows[0].id;
    }

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
      [tenant.rows[0].id, userId],
    );

    const identitySessionsPresent = await client.query<{ present: boolean }>(
      "SELECT to_regclass('public.nexus_identity_sessions') IS NOT NULL AS present",
    );
    if (identitySessionsPresent.rows[0]?.present) {
      await client.query(
        `UPDATE nexus_identity_sessions
            SET status = 'revoked', revoked_at = now()
          WHERE user_id = $1
            AND status = 'active'`,
        [userId],
      );
    }

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES ($1, NULL, 'ADMIN_CREDENTIAL_RESET', 'SECURITY_ADMIN', 'success', $2::jsonb)`,
      [
        tenant.rows[0].id,
        JSON.stringify({
          resetNonce: RESET_NONCE,
          email: ADMIN_EMAIL,
          tenantKey: TENANT_KEY,
          method: "one-time-protected-preview-reset",
        }),
      ],
    );

    await client.query("COMMIT");

    return page(
      "Admin password reset complete",
      `<p><strong>Email</strong></p><code>${ADMIN_EMAIL}</code>
       <p><strong>New admin password</strong></p><code>${temporaryPassword}</code>
       <p><strong>Tenant</strong></p><code>${tenant.rows[0].display_name}</code>
       <p class="note">Copy the password now. This reset endpoint is one-time only; reopening it will not reveal or change the password again.</p>`,
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    const message = error instanceof Error ? error.message : "Unknown reset error.";
    return page(
      "Admin reset failed",
      `<p>No password was changed.</p><code>${message.replace(/[<>&]/g, "")}</code>`,
      500,
    );
  } finally {
    client.release();
  }
}
