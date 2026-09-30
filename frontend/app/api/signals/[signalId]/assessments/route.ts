import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requireWorkspaceModulePermission } from "@/lib/rbac/workspace-guard";
import { recordSignalAssessment } from "@/lib/signals/signal-service";
import type { RecordSignalAssessmentRequest } from "@/lib/signals/signal-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ signalId: string }> },
): Promise<Response> {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Invalid signal assessment body.");
    }
    const signalRequest = body as RecordSignalAssessmentRequest;
    const approvalTransition =
      signalRequest.nextStatus === "CONFIRMED" ||
      signalRequest.nextStatus === "CLOSED";
    const principal = await requireWorkspaceModulePermission(
      request,
      NEXUS_MODULES.SIGNAL_MANAGEMENT,
      approvalTransition ? PERMISSIONS.SIGNAL_APPROVE : PERMISSIONS.SIGNAL_ASSESS,
    );
    const { signalId } = await context.params;
    return Response.json({
      success: true,
      data: await recordSignalAssessment({
        principal,
        signalId,
        request: signalRequest,
      }),
    }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
