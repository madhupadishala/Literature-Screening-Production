import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { requireModulePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getIntakeWorkspace } from "@/lib/safety/intake/intake-review-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ intakeId: string }> },
): Promise<Response> {
  try {
    const principal = await requireModulePermission(
      request,
      NEXUS_MODULES.INTAKE,
      PERMISSIONS.INTAKE_VIEW,
    );
    const { intakeId } = await context.params;
    const workspace = await getIntakeWorkspace({
      principal,
      intakeRecordId: intakeId,
    });

    return Response.json({ success: true, data: workspace });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
