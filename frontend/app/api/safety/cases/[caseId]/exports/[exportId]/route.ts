import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { requireModulePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCaseExportContent } from "@/lib/safety/case-release/case-release-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ caseId: string; exportId: string }> },
): Promise<Response> {
  try {
    const principal = await requireModulePermission(
      request,
      NEXUS_MODULES.CASE_PROCESSING,
      PERMISSIONS.CASE_EXPORT,
    );
    const { caseId, exportId } = await context.params;
    const result = await getCaseExportContent({
      principal,
      caseId,
      exportId,
    });

    const isHtml = result.format === "HUMAN_READABLE_HTML";
    const body = isHtml
      ? result.contentText ?? ""
      : JSON.stringify(result.payloadJson ?? {}, null, 2);

    return new Response(body, {
      headers: {
        "Content-Type": isHtml
          ? "text/html; charset=utf-8"
          : "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName(caseId)}-${safeName(result.format.toLowerCase())}.${isHtml ? "html" : "json"}"`,
        "X-Content-SHA256": result.sha256,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
