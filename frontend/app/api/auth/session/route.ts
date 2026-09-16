import { type NextRequest, NextResponse } from "next/server";
import { sessionManager } from "@/lib/auth/session-manager";
import { verifyCredentials } from "@/lib/auth/verify-credentials";

const ACCESS_TOKEN_COOKIE = "clinixai_access_token";
const ACCESS_TOKEN_MAX_AGE_SECONDS = 60 * 60;

function getAccessToken(request: NextRequest) {
  const header = request.headers.get("authorization");

  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length);
  }

  return request.cookies.get(ACCESS_TOKEN_COOKIE)?.value ?? null;
}

function clearAccessTokenCookie(response: NextResponse) {
  response.cookies.set(ACCESS_TOKEN_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

export async function GET(request: NextRequest) {
  const token = getAccessToken(request);

  return NextResponse.json(sessionManager.getCurrentSessionResponse(token));
}

type LoginBody = {
  email: string;
  password: string;
  tenantId: string; // tenant_key, e.g. "demo-tenant"
};

export async function POST(request: NextRequest) {
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

  const response = NextResponse.json(
    {
      authenticated: true,
      session,
    },
    { status: 201 },
  );

  // Same-origin application APIs can authenticate automatically without
  // exposing the bearer token to every client-side fetch call. The token is
  // still HMAC-signed and authorization is re-read from PostgreSQL per
  // protected request.
  response.cookies.set(ACCESS_TOKEN_COOKIE, session.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
  });

  return response;
}

export async function DELETE(request: NextRequest) {
  const token = getAccessToken(request);
  const current = sessionManager.getCurrentSessionResponse(token);
  const response = NextResponse.json({
    revoked: false,
    session: current.session,
  });

  if (current.session) {
    const revokedSession = sessionManager.revokeSession(current.session.id);
    const revokedResponse = NextResponse.json({
      revoked: Boolean(revokedSession),
      session: revokedSession,
    });
    clearAccessTokenCookie(revokedResponse);
    return revokedResponse;
  }

  // A serverless instance may not hold the in-memory session that created the
  // token. Clearing the browser cookie still ends the browser session; the
  // short-lived signed access token expires independently.
  clearAccessTokenCookie(response);
  return response;
}
