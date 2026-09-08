import { NextRequest, NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { getPackageAudit, searchPackages } from "@/lib/package-workflow-store";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.PACKAGE_VIEW);
    const packageId = request.nextUrl.searchParams.get("package_id") || "";

    if (!packageId) {
      return NextResponse.json(
        { success: false, error: "package_id is required." },
        { status: 400 },
      );
    }

    const pkg = searchPackages("", principal.tenantId).find(
      (item) => item.packageId === packageId,
    );
    if (!pkg) throw new Error("Package not found.");

    return NextResponse.json({
      success: true,
      package: pkg,
      history: [
        {
          version: pkg.version,
          state: pkg.currentState,
          locked: pkg.locked,
          updatedAt: pkg.updatedAt,
          assignedTo: pkg.assignedTo,
        },
      ],
      audit: getPackageAudit(packageId),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}