import { NextRequest, NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { requirePermission } from "@/lib/rbac/guard";
import { isPermission, PERMISSIONS } from "@/lib/rbac/permissions";

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.RBAC_VIEW);
    const body = (await request.json()) as { permission?: string };
    const permission = body.permission?.trim();

    if (!permission || !isPermission(permission)) {
      return NextResponse.json(
        {
          allowed: false,
          message: "A valid canonical permission is required.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      allowed: principal.hasPermission(permission),
      role: principal.roleKey,
      permission,
      tenantId: principal.tenantId,
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
