import { NextRequest, NextResponse } from "next/server";

import { configurationStoreService } from "@/lib/admin/config-store";
import { featureFlagsService } from "@/lib/admin/feature-flags";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { routeErrorResponse } from "@/lib/api/route-error";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.CONFIG_VIEW);

    configurationStoreService.seedDemoTenant();
    featureFlagsService.seedDefaults();

    return NextResponse.json({
      success: true,

      configuration:
        configurationStoreService.get(
          principal.tenantKey,
        ),

      featureFlags:
        featureFlagsService.list(),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}