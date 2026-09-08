import { NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { exportStore } from "@/lib/io/export-store";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

interface RouteContext { params: Promise<{ jobId: string }>; }

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.DATA_EXPORT);
    const { jobId } = await context.params;
    const content = await exportStore.getContent(principal.tenantId, jobId);
    if (!content) throw new Error("Export not found.");
    return new Response(new Uint8Array(content.content), {
      headers: {
        "content-type": content.media_type,
        "content-disposition": `attachment; filename="${content.file_name.replace(/[\r\n"]/g, "_")}"`,
        "x-content-sha256": content.sha256,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
