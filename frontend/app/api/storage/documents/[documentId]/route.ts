import { NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { documentManager } from "@/lib/storage/document-manager";

interface RouteContext { params: Promise<{ documentId: string }>; }

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.PACKAGE_VIEW);
    const { documentId } = await context.params;
    const stored = await documentManager.getContent(principal.tenantId, documentId);
    if (!stored) throw new Error("Document not found.");
    return new Response(new Uint8Array(stored.content), {
      headers: {
        "content-type": stored.record.contentType,
        "content-disposition": `attachment; filename="${stored.record.fileName.replace(/[\r\n"]/g, "_")}"`,
        "content-length": String(stored.record.sizeBytes),
        "x-content-sha256": stored.record.checksum ?? "",
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.EVIDENCE_DELETE);
    const { documentId } = await context.params;
    const body = (await request.json()) as { reason?: string };
    const document = await documentManager.delete({
      tenantId: principal.tenantId,
      documentId,
      actorId: principal.userId,
      reason: body.reason ?? "",
      requestId: request.headers.get("x-request-id"),
    });
    if (!document) throw new Error("Document not found.");
    return Response.json({ success: true, data: document });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
