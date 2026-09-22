import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { requireModulePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  finalizeSafetyCase,
  previewCaseFinalization,
} from "@/lib/safety/case-review/case-review-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ caseId: string }> },
): Promise<Response> {
  try {
    const principal = await requireModulePermission(
      request,
      NEXUS_MODULES.CASE_PROCESSING,
      PERMISSIONS.CASE_VIEW,
    );
    const { caseId } = await context.params;
    const result = await previewCaseFinalization({ principal, caseId });
    return Response.json({ success: true, data: result });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ caseId: string }> },
): Promise<Response> {
  try {
    const principal = await requireModulePermission(
      request,
      NEXUS_MODULES.CASE_PROCESSING,
      PERMISSIONS.CASE_FINALIZE,
    );
    const { caseId } = await context.params;
    const body = (await request.json()) as { reason?: unknown };
    if (typeof body.reason !== "string") {
      throw new Error("Finalization reason is required.");
    }

    const result = await finalizeSafetyCase({
      principal,
      caseId,
      reason: body.reason,
    });
    return Response.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
