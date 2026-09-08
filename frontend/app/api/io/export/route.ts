import { NextRequest, NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { exportStore } from "@/lib/io/export-store";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.DATA_EXPORT);
    const body = await request.json();

    const job = await exportStore.create({
      ...body,
      tenantId: principal.tenantId,
      requestedBy: principal.userId,
      idempotencyKey: request.headers.get("x-idempotency-key")?.trim() || undefined,
      requestId: request.headers.get("x-request-id"),
    });

    return NextResponse.json({
      success: true,
      data: job,
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
