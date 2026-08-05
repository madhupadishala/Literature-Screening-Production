import { NextResponse } from "next/server";
import { sessionManager } from "@/lib/auth/session-manager";
import { verifyCredentials } from "@/lib/auth/verify-credentials";

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization");

  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  return header.slice("Bearer ".length);
}

export async function GET(request: Request) {
  const token = getBearerToken(request);

  return NextResponse.json(sessionManager.getCurrentSessionResponse(token));
}

type LoginBody = {
  email: string;
  password: string;
  tenantId: string; // tenant_key, e.g. "demo-tenant"
};

export async function POST(request: Request) {
  let body: Partial<LoginBody>;

  try {
    body = (await request.json()) as Partial<LoginBody>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.email || !body.password || !body.tenantId) {
    return NextResponse.json(
      { error: "email, password and tenantId are required" },
      { status: 400 },
    );
  }

  const check = await verifyCredentials(body.email, body.password, body.tenantId);

  if (!check.ok) {
    const messages: Record<typeof check.reason, string> = {
      invalid_credentials: "Invalid email or password.",
      account_locked: "This account is temporarily locked after repeated failed attempts.",
      no_active_membership: "This user has no active access to the selected tenant.",
    };

    // Same 401 for every failure reason in the status code; the message is
    // informative for the user without confirming which specific check
    // failed to an attacker (except lockout, which is intentionally visible
    // so a legitimate user knows to wait rather than keep retrying).
    return NextResponse.json({ error: messages[check.reason] }, { status: 401 });
  }

  const session = sessionManager.createSession({
    email: check.email,
    name: check.displayName,
    tenantId: check.tenantId,
    role: check.role,
    provider: "internal",
  });

  return NextResponse.json(
    {
      authenticated: true,
      session,
    },
    { status: 201 },
  );
}

export async function DELETE(request: Request) {
  const token = getBearerToken(request);
  const current = sessionManager.getCurrentSessionResponse(token);

  if (!current.session) {
    return NextResponse.json({
      revoked: false,
    });
  }

  const revokedSession = sessionManager.revokeSession(current.session.id);

  return NextResponse.json({
    revoked: Boolean(revokedSession),
    session: revokedSession,
  });
}