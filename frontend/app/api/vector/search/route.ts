import { NextRequest, NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { vectorStore } from "@/lib/vector/vector-store";
import type { VectorSearchRequest } from "@/lib/vector/vector-types";

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.CONFIG_VIEW);
    const body = (await request.json()) as VectorSearchRequest;
    const result = await vectorStore.search({
      ...body,
      tenantId: principal.tenantId,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return routeErrorResponse(error);
  }
}