import { NextRequest, NextResponse } from "next/server";

import { workflowAnalytics } from "@/lib/reporting/workflow-analytics";

export async function GET(request: NextRequest) {
  try {
    const tenantId =
      request.nextUrl.searchParams.get("tenantId") ??
      "demo-tenant";

    workflowAnalytics.seedDemoMetrics(
      tenantId,
    );

    const dashboard =
      workflowAnalytics.buildSummary(
        tenantId,
      );

    return NextResponse.json({
      success: true,
      data: dashboard,
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