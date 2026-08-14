import { NextRequest, NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { importStore } from "@/lib/io/import-store";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.DATA_IMPORT);
    const body = await request.json();

    const job = importStore.create({
      ...body,
      tenantId: principal.tenantId,
      requestedBy: principal.userId,
    });

    return NextResponse.json({
      success: true,
      data: job,
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}