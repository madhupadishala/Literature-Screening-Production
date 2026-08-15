import { NextRequest, NextResponse } from "next/server";

import { configurationStoreService } from "@/lib/admin/config-store";
import type { TenantConfiguration } from "@/lib/admin/config-store";
import { featureFlagsService } from "@/lib/admin/feature-flags";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { routeErrorResponse } from "@/lib/api/route-error";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.CONFIG_VIEW);

    await configurationStoreService.ensure(principal.tenantId, principal.tenantKey);
    await featureFlagsService.ensureDefaults(principal.tenantId);

    return NextResponse.json({
      success: true,

      configuration:
        await configurationStoreService.get(principal.tenantId),

      featureFlags:
        await featureFlagsService.list(principal.tenantId),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

type SettingsPatch = {
  configuration?: TenantConfiguration;
  featureFlag?: { key: string; description?: string; enabled: boolean; version: number };
};

export async function PATCH(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.ADMIN_SETTINGS_MANAGE);
    const body = await request.json() as SettingsPatch;
    if (!body.configuration && !body.featureFlag) {
      throw new Error("configuration or featureFlag is required");
    }
    const requestId = request.headers.get("x-request-id");
    const configuration = body.configuration
      ? await configurationStoreService.upsert({ ...body.configuration,
          tenantId: principal.tenantId }, principal.userId, requestId)
      : undefined;
    const featureFlag = body.featureFlag
      ? await featureFlagsService.set({ ...body.featureFlag, tenantId: principal.tenantId,
          actorId: principal.userId, requestId })
      : undefined;
    return NextResponse.json({ success: true, configuration, featureFlag });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
