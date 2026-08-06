import { NextRequest, NextResponse } from "next/server";
import { getPackageHistory } from "@/lib/super-user/history-store";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { routeErrorResponse } from "@/lib/api/route-error";

export async function GET(request: NextRequest) {
  try {
    await requirePermission(request, PERMISSIONS.SUPER_USER_CONSOLE_MANAGE);

    const { searchParams } = new URL(request.url);
    const packageId = searchParams.get("packageId") ?? undefined;

    const history = getPackageHistory(packageId);

    return NextResponse.json({
      ok: true,
      module: "super-user-package-history",
      generatedAt: new Date().toISOString(),
      data: history,
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}