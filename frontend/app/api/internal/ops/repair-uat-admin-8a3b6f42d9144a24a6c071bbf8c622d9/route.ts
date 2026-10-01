import { getPostgresPool } from "@/lib/database/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TARGET_BRANCH = "cleanup/zero-deviation-baseline-20260930";
const TARGET_DATABASE = "literature_screening_prod";
const TARGET_TENANT_KEY = "nexus-uat-rc1-a";
const ADMIN_EMAIL = "support@theclinixai.com";
const RESET_NONCE = "8a3b6f42d9144a24a6c071bbf8c622d9";

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(): Promise<Response> {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.VERCEL_GIT_COMMIT_REF !== TARGET_BRANCH
  ) {
    return new Response("Not Found", { status: 404 });
  }

  const passwordHash = process.env.PREVIEW_UAT_ADMIN_PASSWORD_HASH?.trim();
  if (!passwordHash) {
    return json(
      { ok: false, error: "Preview admin password secret is not configured." },
      409,
    );
  }

  const pool = getPostgresPool();
  const client = await pool.connect();

  try {
    const fingerprint = await client.query<{
      database_name: string;
      ledger_present: boolean;
      max_migration: string | null;
      migration_count: number | null;
    }>(`
      SELECT
        current_database() AS database_name,
        to_regclass('public.clinixai_schema_migrations') IS NOT NULL AS ledger_present,
        CASE
          WHEN to_regclass('public.clinixai_schema_migrations') IS NOT NULL
          THEN (SELECT max(migration_id) FROM clinixai_schema_migrations)
          ELSE NULL
        END AS max_migration,
        CASE
          WHEN to_regclass('public.clinixai_schema_migrations') IS NOT NULL
          THEN (SELECT count(*)::int FROM clinixai_schema_migrations)
          ELSE NULL
        END AS migration_count
    `);
    const fp = fingerprint.rows[0];

    if (
      fp.database_name !== TARGET_DATABASE ||
      !fp.ledger_present ||
      fp.max_migration !== "039" ||
      Number(fp.migration_count) !== 39
    ) {
      return json(
        {
          ok: false,
          error: "Governed UAT database preflight failed. No account was changed.",
          database: fp.database_name,
          ledgerPresent: fp.ledger_present,
          maxMigration: fp.max_migration,
          migrationCount: Number(fp.migration_count ?? 0),
        },
        409,
      );
    }

    const tenant = await client.query<{ id: string; display_name: string }>(
      `SELECT id, display_name
         FROM tenants
        WHERE tenant_key = $1
          AND status = 'active'
        LIMIT 1`,
      [TARGET_TENANT_KEY],
    );
    if (!tenant.rows[0]) {
      return json(
        {
          ok: false,
          error: "Governed UAT tenant was not found. No account was changed.",
        },
        409,
      );
    }

    const previouslyApplied = await client.query(
      `SELECT 1
         FROM audit_events
        WHERE tenant_id = $1
          AND event_type = 'UAT_ADMIN_CREDENTIAL_REPAIRED'
          AND details->>'resetNonce' = $2
          AND outcome = 'success'
        LIMIT 1`,
      [tenant.rows[0].id, RESET_NONCE],
    );
    if (previouslyApplied.rows[0]) {
      return json(
        {
          ok: true,
          alreadyApplied: true,
          email: ADMIN_EMAIL,
          tenantKey: TARGET_TENANT_KEY,
          database: TARGET_DATABASE,
        },
        200,
      );
    }

    await client.query("BEGIN");

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
                display_name = 'ClinixAI Super Admin',
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
         membership_version, updated_by, updated_at
       ) VALUES ($1, $2, 'CLINIXAI_SUPER_ADMIN', '[]'::jsonb, 'active', 1, $2, now())
       ON CONFLICT (tenant_id, user_id)
       DO UPDATE SET
         role_key = 'CLINIXAI_SUPER_ADMIN',
         membership_status = 'active',
         membership_version = tenant_memberships.membership_version + 1,
         updated_by = $2,
         updated_at = now()`,
      [tenant.rows[0].id, userId],
    );

    await client.query(
      `INSERT INTO platform_role_assignments (
         user_id, role_key, status, updated_by, updated_at
       ) VALUES ($1, 'PLATFORM_SUPER_ADMIN', 'active', $1, now())
       ON CONFLICT (user_id)
       DO UPDATE SET
         role_key = 'PLATFORM_SUPER_ADMIN',
         status = 'active',
         version = platform_role_assignments.version + 1,
         updated_by = $1,
         updated_at = now()`,
      [userId],
    );

    const workspaces = await client.query<{ id: string; workspace_key: string }>(
      `SELECT id, workspace_key
         FROM nexus_client_workspaces
        WHERE tenant_id = $1
          AND status = 'active'
        ORDER BY workspace_key`,
      [tenant.rows[0].id],
    );

    for (const workspace of workspaces.rows) {
      await client.query(
        `INSERT INTO nexus_workspace_memberships (
           tenant_id, workspace_id, user_id, workspace_role, status,
           version, updated_by, updated_at
         ) VALUES ($1, $2, $3, 'WORKSPACE_ADMIN', 'active', 1, $3, now())
         ON CONFLICT (workspace_id, user_id)
         DO UPDATE SET
           workspace_role = 'WORKSPACE_ADMIN',
           status = 'active',
           version = nexus_workspace_memberships.version + 1,
           updated_by = $3,
           updated_at = now()`,
        [tenant.rows[0].id, workspace.id, userId],
      );

      const modules = await client.query<{ module_key: string }>(
        `SELECT wme.module_key
           FROM nexus_workspace_module_entitlements wme
           JOIN tenant_module_entitlements tme
             ON tme.tenant_id = wme.tenant_id
            AND tme.environment = wme.environment
            AND tme.module_key = wme.module_key
          WHERE wme.tenant_id = $1
            AND wme.workspace_id = $2
            AND wme.environment = 'UAT'
            AND wme.status = 'enabled'
            AND tme.status = 'enabled'
            AND (wme.valid_from IS NULL OR wme.valid_from <= now())
            AND (wme.valid_until IS NULL OR wme.valid_until > now())
            AND (tme.valid_from IS NULL OR tme.valid_from <= now())
            AND (tme.valid_until IS NULL OR tme.valid_until > now())`,
        [tenant.rows[0].id, workspace.id],
      );

      for (const module of modules.rows) {
        await client.query(
          `INSERT INTO nexus_workspace_module_roles (
             tenant_id, workspace_id, user_id, environment, module_key,
             role_key, custom_permissions, status, version, updated_by, updated_at
           ) VALUES ($1, $2, $3, 'UAT', $4, 'MODULE_ADMIN', '[]'::jsonb, 'active', 1, $3, now())
           ON CONFLICT (workspace_id, user_id, environment, module_key, role_key)
           DO UPDATE SET
             status = 'active',
             version = nexus_workspace_module_roles.version + 1,
             updated_by = $3,
             updated_at = now()`,
          [tenant.rows[0].id, workspace.id, userId, module.module_key],
        );
      }
    }

    await client.query(
      `UPDATE nexus_identity_sessions
          SET status = 'revoked', revoked_at = now()
        WHERE user_id = $1
          AND status = 'active'`,
      [userId],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, environment, module_key, actor_id,
         event_type, event_category, outcome, details
       ) VALUES (
         $1, 'UAT', 'GOVERNANCE', $2,
         'UAT_ADMIN_CREDENTIAL_REPAIRED', 'SECURITY_ADMIN', 'success', $3::jsonb
       )`,
      [
        tenant.rows[0].id,
        userId,
        JSON.stringify({
          resetNonce: RESET_NONCE,
          email: ADMIN_EMAIL,
          tenantKey: TARGET_TENANT_KEY,
          workspaceCount: workspaces.rows.length,
          migrationCeiling: "039",
        }),
      ],
    );

    await client.query("COMMIT");

    return json({
      ok: true,
      email: ADMIN_EMAIL,
      tenantKey: TARGET_TENANT_KEY,
      tenantName: tenant.rows[0].display_name,
      database: TARGET_DATABASE,
      migrationCeiling: "039",
      workspaceCount: workspaces.rows.length,
      sessionsRevoked: true,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown admin repair failure.",
      },
      500,
    );
  } finally {
    client.release();
  }
}
