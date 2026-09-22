import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { requireModulePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getEvidencePackagePayload } from "@/lib/safety/case-release/case-release-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ caseId: string; packageId: string }> },
): Promise<Response> {
  try {
    const principal = await requireModulePermission(
      request,
      NEXUS_MODULES.CASE_PROCESSING,
      PERMISSIONS.CASE_EXPORT,
    );
    const { caseId, packageId } = await context.params;
    const result = await getEvidencePackagePayload({
      principal,
      caseId,
      packageId,
    });

    return new Response(JSON.stringify(result.payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="case-evidence-${safeName(caseId)}-${safeName(packageId)}.json"`,
        "X-Content-SHA256": result.sha256,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
