import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { requireModulePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getExternalHandoffPayload } from "@/lib/safety/disposition/disposition-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
}

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{ intakeId: string; packageId: string }>;
  },
): Promise<Response> {
  try {
    const principal = await requireModulePermission(
      request,
      NEXUS_MODULES.INTAKE,
      PERMISSIONS.INTAKE_EXPORT,
    );
    const { intakeId, packageId } = await context.params;
    const handoff = await getExternalHandoffPayload({
      principal,
      intakeRecordId: intakeId,
      packageId,
    });

    return new Response(JSON.stringify(handoff.payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName(
          handoff.destinationSystem,
        )}-${safeName(intakeId)}.json"`,
        "X-Nexus-Package-Format": handoff.packageFormat,
        "X-Content-SHA256": handoff.payloadSha256,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
