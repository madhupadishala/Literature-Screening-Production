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