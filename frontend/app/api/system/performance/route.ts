import { NextRequest, NextResponse } from "next/server";

import {
  getPerformanceSummary,
  listPerformanceMetrics,
} from "@/lib/performance/performance-metrics";
import { getRuntimePerformanceSettings } from "@/lib/performance/runtime-performance-settings";
import { literatureWorkflowService } from "@/lib/literature/workflow/literature-workflow-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveLimit(request: NextRequest): number {
  const rawLimit =
    request.nextUrl.searchParams.get("limit");

  if (!rawLimit) {
    return 100;
  }

  const parsed = Number.parseInt(rawLimit, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 100;
  }

  return Math.min(parsed, 1_000);
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse> {
  const limit = resolveLimit(request);

  return NextResponse.json(
    {
      success: true,
      checkedAt: new Date().toISOString(),
      settings: getRuntimePerformanceSettings(),
      workflow: literatureWorkflowService.getPerformanceStatus(),
      summary: getPerformanceSummary(),
      recentMetrics: listPerformanceMetrics(limit),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
