import type { NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import {
  deleteEvidenceArtifact,
  getEvidenceArtifact,
} from "@/lib/literature/full-text/evidence-artifact-service";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

interface RouteContext {
  params: Promise<{ artifactId: string }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  try {
    const principal = await requirePermission(request, PERMISSIONS.PACKAGE_VIEW);
    const { artifactId } = await context.params;
    const artifact = await getEvidenceArtifact(principal.tenantId, artifactId);

    if (!artifact) throw new Error("Evidence artifact not found.");

    return new Response(new Uint8Array(artifact.content), {
      status: 200,
      headers: {
        "Content-Type": artifact.mediaType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${artifact.fileName || artifact.id}"`,
        "Content-Length": String(artifact.content.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Evidence-SHA256": artifact.sha256,
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  try {
    const principal = await requirePermission(
      request,
      PERMISSIONS.EVIDENCE_DELETE,
    );
    const { artifactId } = await context.params;
    const body = (await request.json()) as { reason?: string };

    await deleteEvidenceArtifact({
      tenantId: principal.tenantId,
      artifactId,
      actorId: principal.userId,
      reason: body.reason || "",
      requestId: request.headers.get("x-request-id"),
    });

    return Response.json({
      success: true,
      artifactId,
      deleted: true,
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
