import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { requireModulePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { reviewCaseAssistSuggestion } from "@/lib/safety/case-processing/case-processing-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{ caseId: string; suggestionId: string }>;
  },
): Promise<Response> {
  try {
    const principal = await requireModulePermission(
      request,
      NEXUS_MODULES.CASE_PROCESSING,
      PERMISSIONS.CASE_PROCESS,
    );
    const { caseId, suggestionId } = await context.params;
    const body = (await request.json()) as {
      decision?: unknown;
      humanPayload?: unknown;
      reviewReason?: unknown;
    };

    if (
      typeof body.decision !== "string" ||
      !["ACCEPTED", "EDITED", "REJECTED"].includes(body.decision)
    ) {
      throw new Error("A valid assist decision is required.");
    }
    if (typeof body.reviewReason !== "string") {
      throw new Error("reviewReason is required.");
    }

    const workspace = await reviewCaseAssistSuggestion({
      principal,
      caseId,
      suggestionId,
      decision: body.decision as "ACCEPTED" | "EDITED" | "REJECTED",
      humanPayload:
        body.humanPayload &&
        typeof body.humanPayload === "object" &&
        !Array.isArray(body.humanPayload)
          ? (body.humanPayload as Record<string, unknown>)
          : undefined,
      reviewReason: body.reviewReason,
    });

    return Response.json({ success: true, data: workspace });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
