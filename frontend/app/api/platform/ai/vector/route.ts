import { NextRequest, NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { getControlledVectorStatus } from "@/lib/knowledge/retrieval/controlled-vector-status";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { LEGACY_VECTOR_DISABLED_MESSAGE } from "@/lib/vector/legacy-vector-policy";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.CONFIG_VIEW);
    return NextResponse.json({
      status: await getControlledVectorStatus(principal.tenantId),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.SOURCE_MANAGE);
    const disabledRequestContext = { tenantId: principal.tenantId };
    void disabledRequestContext;
    throw new Error(LEGACY_VECTOR_DISABLED_MESSAGE);
  } catch (error) {
    return routeErrorResponse(error);
  }
}
