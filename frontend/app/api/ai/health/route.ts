import { NextResponse } from "next/server";

import { getAIMetricsSummary, listAIMetrics } from "@/lib/ai/ai-metrics";
import { listAIAuditRecords } from "@/lib/ai/ai-audit";
import { validateAIRuntime } from "@/lib/ai/runtime-validator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const validation = validateAIRuntime();

  return NextResponse.json(
    {
      success: validation.valid,
      status: validation.valid ? "READY" : "NOT_READY",
      runtime: validation,
      metrics: getAIMetricsSummary(),
      recentMetrics: listAIMetrics(20),
      recentAuditRecords: listAIAuditRecords(20),
      checkedAt: new Date().toISOString(),
    },
    {
      status: validation.valid ? 200 : 503,
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
