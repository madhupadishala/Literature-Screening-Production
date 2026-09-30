import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { getIntakeInputExport } from "@/lib/literature/intake-input/intake-input-service";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requireWorkspaceModulePermission } from "@/lib/rbac/workspace-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ exportId: string }> },
): Promise<Response> {
  try {
    const principal = await requireWorkspaceModulePermission(request, NEXUS_MODULES.LITERATURE, PERMISSIONS.INTAKE_INPUT_DOWNLOAD);
    const { exportId } = await context.params;
    const exported = await getIntakeInputExport({ principal, exportId });
    return new Response(exported.content, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${exported.fileName}"`,
        "Content-Type": "application/json; charset=utf-8",
        Digest: `sha-256=${Buffer.from(exported.sha256, "hex").toString("base64")}`,
        "X-Content-Type-Options": "nosniff",
        "X-ClinixAI-Export-Id": exported.exportId,
        "X-ClinixAI-SHA256": exported.sha256,
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
