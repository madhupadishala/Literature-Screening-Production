import { NextRequest, NextResponse } from "next/server";

type SessionAuditBody = {
  action: string;
  sessionId?: string;
  userName?: string;
  role?: string;
  tenantId?: string;
  environment?: string;
  reason?: string;
};

// NOTE: this currently only console.logs. SessionTimeoutGuard calls
// /api/session/audit (singular), but this route previously lived at
// /api/sessions/audit (plural) and was never actually reachable -- fixed
// here by moving it to the path the UI calls.
//
// Follow-up (not done yet): write these events into the real `audit_events`
// Postgres table that lib/rbac/guard.ts already uses for
// AUTHORIZATION_DENIED events, so session lock/unlock/logout show up in the
// same audit trail instead of only server logs.
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SessionAuditBody;

    const auditRecord = {
      id: `SESSION-AUD-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: body.action,
      sessionId: body.sessionId || "unknown",
      userName: body.userName || "unknown",
      role: body.role || "unknown",
      tenantId: body.tenantId || "unknown",
      environment: body.environment || "unknown",
      reason: body.reason || "",
    };

    console.log("[SESSION AUDIT]", auditRecord);

    return NextResponse.json({
      success: true,
      audit: auditRecord,
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to record session audit.",
      },
      { status: 400 }
    );
  }
}
