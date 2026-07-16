import { NextRequest, NextResponse } from "next/server";

import { configurationStoreService } from "@/lib/admin/config-store";
import { featureFlagsService } from "@/lib/admin/feature-flags";

export async function GET(request: NextRequest) {
  try {
    const tenantId =
      request.nextUrl.searchParams.get("tenantId") ??
      "demo-tenant";

    configurationStoreService.seedDemoTenant();
    featureFlagsService.seedDefaults();

    return NextResponse.json({
      success: true,

      configuration:
        configurationStoreService.get(
          tenantId,
        ),

      featureFlags:
        featureFlagsService.list(),
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
      },
      {
        status: 500,
      },
    );
  }
}