import { type NextRequest } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error";
import {
  configurationSnapshotPayload,
  resolveActiveConfigurations,
} from "@/lib/configuration/active-resolver";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(
      request,
      PERMISSIONS.CONFIG_VIEW,
    );

    const active = await resolveActiveConfigurations(principal.tenantId);

    return Response.json({
      success: true,
      data: {
        active,
        snapshot: configurationSnapshotPayload(active),
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
