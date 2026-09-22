import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { requireModulePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { resolveCaseQuery } from "@/lib/safety/case-review/case-review-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ caseId: string; queryId: string }> },
): Promise<Response> {
  try {
    const principal = await requireModulePermission(
      request,
      NEXUS_MODULES.CASE_PROCESSING,
      PERMISSIONS.CASE_PROCESS,
    );
    const { caseId, queryId } = await context.params;
    const body = (await request.json()) as { responseText?: unknown };
    if (typeof body.responseText !== "string") {
      throw new Error("responseText is required.");
    }

    await resolveCaseQuery({
      principal,
      caseId,
      queryId,
      responseText: body.responseText,
    });
    return Response.json({ success: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
