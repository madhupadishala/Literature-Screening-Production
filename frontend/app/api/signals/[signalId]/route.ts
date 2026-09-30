import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requireWorkspaceModulePermission } from "@/lib/rbac/workspace-guard";
import { getSignal } from "@/lib/signals/signal-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ signalId: string }> },
): Promise<Response> {
  try {
    const principal = await requireWorkspaceModulePermission(
      request,
      NEXUS_MODULES.SIGNAL_MANAGEMENT,
      PERMISSIONS.SIGNAL_VIEW,
    );
    const { signalId } = await context.params;
    return Response.json({ success: true, data: await getSignal({ principal, signalId }) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
