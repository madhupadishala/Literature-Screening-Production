import { NextRequest, NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { getPackageAudit, searchPackages } from "@/lib/package-workflow-store";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.PACKAGE_VIEW);
    const query = request.nextUrl.searchParams.get("query") || "";
    const packages = searchPackages(query, principal.tenantId);

    return NextResponse.json({
      success: true,
      tenant_id: principal.tenantId,
      count: packages.length,
      packages,
      audit: packages[0] ? getPackageAudit(packages[0].packageId) : [],
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}