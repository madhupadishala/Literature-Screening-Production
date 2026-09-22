import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { getPostgresPool } from "@/lib/database/postgres";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { requireModulePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeFileName(value: string): string {
  return value.replace(/[\r\n"]/g, "_");
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ intakeId: string; documentId: string }> },
): Promise<Response> {
  try {
    const principal = await requireModulePermission(
      request,
      NEXUS_MODULES.INTAKE,
      PERMISSIONS.INTAKE_VIEW,
    );
    const { intakeId, documentId } = await context.params;

    const result = await getPostgresPool().query<{
      file_name: string;
      content_type: string;
      content_bytes: Buffer;
      content_sha256: string;
    }>(
      `SELECT file_name, content_type, content_bytes, content_sha256
         FROM safety_source_documents
        WHERE tenant_id = $1
          AND intake_record_id = $2
          AND id = $3
        LIMIT 1`,
      [principal.tenantId, intakeId, documentId],
    );

    const document = result.rows[0];
    if (!document) {
      return Response.json(
        { success: false, error: "Source document not found." },
        { status: 404 },
      );
    }

    return new Response(new Uint8Array(document.content_bytes), {
      headers: {
        "Content-Type": document.content_type,
        "Content-Disposition": `inline; filename="${safeFileName(document.file_name)}"`,
        "X-Content-SHA256": document.content_sha256,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
