import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { assertSafetyIntakeInScope } from "@/lib/safety/common/safety-workspace-scope";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requireWorkspaceModulePermission } from "@/lib/rbac/workspace-guard";
import { completeIntakeSourceReview } from "@/lib/safety/intake/intake-review-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReviewBody {
  reason?: unknown;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ intakeId: string }> },
): Promise<Response> {
  try {
    const principal = await requireWorkspaceModulePermission(
      request,
      NEXUS_MODULES.INTAKE,
      PERMISSIONS.INTAKE_PROCESS,
    );
    const { intakeId } = await context.params;
    await assertSafetyIntakeInScope(principal, intakeId);
    await assertSafetyIntakeInScope(principal, intakeId);
    const body = (await request.json()) as ReviewBody;
    if (typeof body.reason !== "string") {
      throw new Error("reason is required.");
    }

    const workspace = await completeIntakeSourceReview({
      principal,
      intakeRecordId: intakeId,
      reason: body.reason,
    });

    return Response.json({ success: true, data: workspace });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
