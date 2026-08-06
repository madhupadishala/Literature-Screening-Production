import { NextRequest, NextResponse } from "next/server";
import {
  assignPackage,
  getPackageAssignments,
} from "@/lib/super-user/assignment-store";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { routeErrorResponse } from "@/lib/api/route-error";

export async function GET(request: NextRequest) {
  try {
    await requirePermission(request, PERMISSIONS.SUPER_USER_CONSOLE_MANAGE);

    const { searchParams } = new URL(request.url);
    const packageId = searchParams.get("packageId") ?? "";

    if (!packageId) {
      return NextResponse.json(
        {
          ok: false,
          error: "packageId is required.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      module: "super-user-package-assignments",
      generatedAt: new Date().toISOString(),
      data: getPackageAssignments(packageId),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.SUPER_USER_CONSOLE_MANAGE);
    const body = await request.json();

    const result = assignPackage({
      packageId: String(body.packageId ?? ""),
      // Previously trusted a client-supplied tenantId and assignedBy
      // string -- either could be spoofed to act against another
      // tenant's packages or attribute the assignment to someone else.
      tenantId: principal.tenantKey,
      assignedToUserId: String(body.assignedToUserId ?? ""),
      assignedBy: principal.displayName || principal.email,
      reason: String(body.reason ?? ""),
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      module: "super-user-package-assignment",
      generatedAt: new Date().toISOString(),
      message: result.message,
      data: result.assignment,
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
