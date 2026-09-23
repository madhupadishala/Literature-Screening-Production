import { NextResponse } from "next/server";

import { sessionManager } from "@/lib/auth/session-manager";
import { mapRoleKeyToUserRole } from "@/lib/auth/role-mapping";
import { getPostgresPool } from "@/lib/database/postgres";

const ACCESS_TOKEN_COOKIE = "clinixai_access_token";
const ACCESS_TOKEN_MAX_AGE_SECONDS = 60 * 60;
const REVIEW_BRANCH = "feat/nexus-horizontal-operations-shell";
const REVIEW_TENANT_KEY = "nexus-uat-rc1-a";

function reviewAccessEnabled(): boolean {
  return (
    process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_GIT_COMMIT_REF === REVIEW_BRANCH
  );
}

export async function POST() {
  // This endpoint is intentionally unavailable in production and on every
  // preview branch except the explicitly approved Nexus horizontal-shell UAT
  // review branch. Normal authentication remains mandatory everywhere else.
  if (!reviewAccessEnabled()) {
    return NextResponse.json({ error: "Review access is not available." }, { status: 404 });
  }

  const result = await getPostgresPool().query<{
    tenant_id: string;
    tenant_key: string;
    user_id: string;
    email: string;
    display_name: string;
    role_key: string;
  }>(
    `SELECT
       t.id AS tenant_id,
       t.tenant_key,
       u.id AS user_id,
       u.email,
       u.display_name,
       m.role_key
     FROM tenants t
     JOIN tenant_memberships m ON m.tenant_id = t.id
     JOIN application_users u ON u.id = m.user_id
     WHERE t.tenant_key = $1
       AND t.status = 'active'
       AND u.status = 'active'
       AND m.membership_status = 'active'
     ORDER BY CASE m.role_key
       WHEN 'CLINIXAI_SUPER_ADMIN' THEN 0
       WHEN 'PV_ADMINISTRATOR' THEN 1
       WHEN 'SUPER_USER' THEN 2
       WHEN 'QUALITY_APPROVER' THEN 3
       ELSE 9
     END,
     u.created_at
     LIMIT 1`,
    [REVIEW_TENANT_KEY],
  );

  const identity = result.rows[0];
  if (!identity) {
    return NextResponse.json(
      { error: "The controlled UAT review identity is not configured." },
      { status: 503 },
    );
  }

  const session = sessionManager.createSession({
    userId: identity.user_id,
    email: identity.email,
    name: identity.display_name,
    tenantId: identity.tenant_id,
    role: mapRoleKeyToUserRole(identity.role_key),
    provider: "internal",
  });

  const response = NextResponse.json(
    {
      authenticated: true,
      reviewMode: true,
      tenantKey: identity.tenant_key,
      roleKey: identity.role_key,
      session,
    },
    { status: 201 },
  );

  response.cookies.set(ACCESS_TOKEN_COOKIE, session.accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
  });

  return response;
}
