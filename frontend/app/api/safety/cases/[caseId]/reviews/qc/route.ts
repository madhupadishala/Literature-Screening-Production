import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { requireModulePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { recordQcAction } from "@/lib/safety/case-review/case-review-service";

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
      PERMISSIONS.CASE_QC,
    );
    const { caseId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    if (
      typeof body.action !== "string" ||
      !["APPROVE", "RETURN", "QUERY", "COMMENT"].includes(body.action)
    ) {
      throw new Error("A valid QC action is required.");
    }
    if (typeof body.comments !== "string") {
      throw new Error("comments are required.");
    }

    const result = await recordQcAction({
      principal,
      caseId,
      action: body.action as "APPROVE" | "RETURN" | "QUERY" | "COMMENT",
      comments: body.comments,
      fieldPath: typeof body.fieldPath === "string" ? body.fieldPath : undefined,
      queryText: typeof body.queryText === "string" ? body.queryText : undefined,
      narrativeText:
        typeof body.narrativeText === "string" && body.narrativeText.trim()
          ? body.narrativeText
          : undefined,
    });

    return Response.json({ success: true, data: result });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
