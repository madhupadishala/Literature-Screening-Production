import { NextRequest, NextResponse } from "next/server";
import { performPackageAction } from "@/lib/package-workflow-store";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { routeErrorResponse } from "@/lib/api/route-error";

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.PACKAGE_ACTION_EXECUTE);
    const body = await request.json();

    const result = performPackageAction({
      packageId: body.packageId,
      action: body.action,
      assignedTo: body.assignedTo,
      routeTo: body.routeTo,
      comment: body.comment,
      // Previously trusted performedBy/role/tenantId straight from the
      // request body -- any caller could attribute an action to anyone,
      // claim any role, or act against a tenant they don't belong to.
      // Now always the authenticated caller's verified identity.
      performedBy: principal.displayName || principal.email,
      role: principal.roleKey,
      tenantId: principal.tenantKey,
      environment: body.environment || "PROD",
    });

    return NextResponse.json(result);
  } catch (error) {
    return routeErrorResponse(error);
  }
}