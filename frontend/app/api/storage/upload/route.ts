import { NextRequest, NextResponse } from "next/server";

import { documentManager } from "@/lib/storage/document-manager";
import type { UploadDocumentInput } from "@/lib/storage/storage-types";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { routeErrorResponse } from "@/lib/api/route-error";

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.STORAGE_UPLOAD_EXECUTE);

    const body = (await request.json()) as UploadDocumentInput;

    if (body.tenantId !== principal.tenantId) {
      throw new Error("Storage tenant scope does not match authenticated tenant");
    }
    if (process.env.CLINIXAI_STORAGE_PROVIDER === "cloudflare-r2") {
      throw new Error("Regulated document upload requires a persistent client-workspace registry; generic upload is disabled for R2");
    }
    const document = await documentManager.upload(body);

    return NextResponse.json({
      success: true,
      data: document,
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}