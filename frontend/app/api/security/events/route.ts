import { runRoute, successResponse } from "@/lib/enterprise/api-response";
import { requireInternalMonitoringToken } from "@/lib/enterprise/request-guard";
import { securityAudit } from "@/lib/enterprise/security-audit";
import type { SecurityAuditEvent } from "@/lib/enterprise/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return runRoute(request, async (context) => {
    requireInternalMonitoringToken(request);

    const url = new URL(request.url);
    const limit = Number.parseInt(url.searchParams.get("limit") || "50", 10);
    const severity = url.searchParams.get("severity") as
      | SecurityAuditEvent["severity"]
      | null;

    const events = securityAudit.list({
      limit: Number.isFinite(limit) ? limit : 50,
      type: url.searchParams.get("type") || undefined,
      severity: severity || undefined,
      since: url.searchParams.get("since") || undefined,
    });

    return successResponse(
      { count: events.length, events },
      200,
      context.requestId,
    );
  });
}
