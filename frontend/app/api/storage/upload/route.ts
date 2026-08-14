import { NextRequest, NextResponse } from "next/server";

import { documentManager } from "@/lib/storage/document-manager";
import type { UploadDocumentInput } from "@/lib/storage/storage-types";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { routeErrorResponse } from "@/lib/api/route-error";

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(
      request,
      PERMISSIONS.STORAGE_UPLOAD_EXECUTE,
    );

    const body = (await request.json()) as UploadDocumentInput;

    const document = await documentManager.upload({
      ...body,
      tenantId: principal.tenantId,
      createdBy: principal.userId,
    });

    return NextResponse.json({
      success: true,
      data: document,
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}