import { type NextRequest, NextResponse } from "next/server";

import {
  createIdentitySession,
  NEXUS_IDENTITY_SESSION_COOKIE,
  NEXUS_IDENTITY_SESSION_MAX_AGE_SECONDS,
  resolveIdentitySession,
  revokeIdentitySession,
} from "@/lib/auth/identity-session-service";
import { verifyIdentityCredentials } from "@/lib/auth/verify-credentials";
import { getPostgresPool } from "@/lib/database/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readIdentityToken(request: NextRequest): string | null {
  return request.cookies.get(NEXUS_IDENTITY_SESSION_COOKIE)?.value ?? null;
}

async function listTenantMemberships(userId: string) {
  const result = await getPostgresPool().query<{
    tenant_id: string;
    tenant_key: string;
    display_name: string;
    role_key: string;
  }>(
    `SELECT t.id AS tenant_id, t.tenant_key, t.display_name, m.role_key
       FROM tenant_memberships m
       JOIN tenants t ON t.id = m.tenant_id
      WHERE m.user_id = $1
        AND m.membership_status = 'active'
        AND t.status = 'active'
      ORDER BY t.display_name, t.tenant_key`,
    [userId],
  );

  return result.rows.map((row) => ({
    tenantId: row.tenant_id,
    tenantKey: row.tenant_key,
    displayName: row.display_name,
    roleKey: row.role_key,
  }));
}

export async function GET(request: NextRequest): Promise<Response> {
  const session = await resolveIdentitySession(readIdentityToken(request));
  if (!session) {
    return Response.json({ authenticated: false, identity: null, tenants: [] }, { status: 401 });
  }

  return Response.json({
    authenticated: true,
    identity: session,
    tenants: await listTenantMemberships(session.userId),
  });
}

type LoginBody = {
  email?: string;
  password?: string;
};

export async function POST(request: NextRequest): Promise<Response> {
  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.email !== "string" || typeof body.password !== "string") {
    return Response.json({ error: "email and password must be strings." }, { status: 400 });
  }

  const email = body.email.trim();
  const password = body.password;
  if (!email || !password) {
    return Response.json({ error: "email and password are required." }, { status: 400 });
  }

  const identity = await verifyIdentityCredentials(email, password);
  if (!identity.ok) {
    return Response.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const created = await createIdentitySession({
    userId: identity.userId,
    provider: "internal",
  });

  const response = NextResponse.json(
    {
      authenticated: true,
      identity: created.session,
      tenants: await listTenantMemberships(identity.userId),
      next: "SELECT_TENANT",
    },
    { status: 201 },
  );

  response.cookies.set(NEXUS_IDENTITY_SESSION_COOKIE, created.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: NEXUS_IDENTITY_SESSION_MAX_AGE_SECONDS,
  });

  return response;
}

export async function DELETE(request: NextRequest): Promise<Response> {
  const revoked = await revokeIdentitySession(readIdentityToken(request));
  const response = NextResponse.json({ revoked });
  response.cookies.set(NEXUS_IDENTITY_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
