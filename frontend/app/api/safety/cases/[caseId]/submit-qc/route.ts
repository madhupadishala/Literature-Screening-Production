import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { requireModulePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { submitCaseForQc } from "@/lib/safety/case-review/case-review-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ caseId: string }> },
): Promise<Response> {
  try {
    const principal = await requireModulePermission(
      request,
      NEXUS_MODULES.CASE_PROCESSING,
      PERMISSIONS.CASE_PROCESS,
    );
    const { caseId } = await context.params;
    const body = (await request.json()) as { comments?: unknown };
    if (typeof body.comments !== "string") {
      throw new Error("comments are required.");
    }
    const result = await submitCaseForQc({
      principal,
      caseId,
      comments: body.comments,
    });
    return Response.json({ success: true, data: result });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
