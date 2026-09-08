import { NextRequest, NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { getPostgresPool } from "@/lib/database/postgres";
import { resolveRequestPrincipal } from "@/lib/rbac/request-principal";

type SessionAuditBody = {
  action?: string;
  sessionId?: string;
  environment?: string;
  reason?: string;
};

export async function POST(request: NextRequest) {
  try {
    const principal = await resolveRequestPrincipal(request);
    const body = (await request.json()) as SessionAuditBody;
    const action = String(body.action || "").trim().toUpperCase();

    if (!action) throw new Error("Session audit action is required.");

    const result = await getPostgresPool().query<{ id: string; occurred_at: Date }>(
      `
        INSERT INTO audit_events (
          tenant_id, actor_id, event_type, event_category, outcome,
          request_id, source_ip, details
        ) VALUES ($1, $2, $3, 'SESSION_SECURITY', 'success', $4, $5, $6::jsonb)
        RETURNING id, occurred_at
      `,
      [
        principal.tenantId,
        principal.userId,
        `SESSION_${action}`,
        request.headers.get("x-request-id")?.trim() || null,
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
        JSON.stringify({
          sessionId: body.sessionId || null,
          environment: body.environment || null,
          reason: body.reason || null,
          roleKey: principal.roleKey,
        }),
      ],
    );

    return NextResponse.json({
      success: true,
      audit: {
        id: result.rows[0].id,
        timestamp: result.rows[0].occurred_at.toISOString(),
        action,
        tenantId: principal.tenantId,
        userId: principal.userId,
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
