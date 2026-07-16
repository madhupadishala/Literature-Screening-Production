import { NextResponse } from "next/server";
import { sessionManager } from "@/lib/auth/session-manager";
import type { CreateSessionInput } from "@/lib/auth/auth-types";

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

export async function POST(request: Request) {
  const body = (await request.json()) as CreateSessionInput;

  if (!body.email || !body.tenantId) {
    return NextResponse.json(
      {
        error: "email and tenantId are required",
      },
      { status: 400 },
    );
  }

  const session = sessionManager.createSession(body);

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