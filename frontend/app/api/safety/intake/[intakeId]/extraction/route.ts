import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { requireModulePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { runIntakeExtraction } from "@/lib/safety/intake/intake-review-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ExtractionBody {
  reason?: unknown;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ intakeId: string }> },
): Promise<Response> {
  try {
    const principal = await requireModulePermission(
      request,
      NEXUS_MODULES.INTAKE,
      PERMISSIONS.INTAKE_PROCESS,
    );
    const { intakeId } = await context.params;
    const body = (await request.json()) as ExtractionBody;
    if (typeof body.reason !== "string") {
      throw new Error("reason is required.");
    }

    const workspace = await runIntakeExtraction({
      principal,
      intakeRecordId: intakeId,
      reason: body.reason,
    });

    return Response.json({ success: true, data: workspace });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
