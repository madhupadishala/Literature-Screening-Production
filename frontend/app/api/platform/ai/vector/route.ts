import { NextRequest, NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { vectorStore } from "@/lib/platform/vector/vector-store";
import type {
  VectorRecord,
  VectorSearchRequest,
} from "@/lib/platform/vector/vector-types";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.CONFIG_VIEW);
    return NextResponse.json({
      status: vectorStore.getStatus(principal.tenantId),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as VectorRecord | VectorSearchRequest;
    const permission = "queryVector" in body
      ? PERMISSIONS.CONFIG_VIEW
      : PERMISSIONS.SOURCE_MANAGE;
    const principal = await requirePermission(request, permission);

    if ("queryVector" in body) {
      return NextResponse.json({
        results: vectorStore.search({
          ...body,
          tenantId: principal.tenantId,
        }),
      });
    }

    return NextResponse.json(
      {
        record: vectorStore.upsert({
          ...body,
          metadata: {
            ...body.metadata,
            tenantId: principal.tenantId,
          },
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}