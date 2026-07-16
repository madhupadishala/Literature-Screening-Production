import { NextResponse } from "next/server";

import { aiObservability } from "@/lib/platform/observability/ai-observability";
import type { AIRequestMetric } from "@/lib/platform/observability/ai-observability-types";

export async function GET() {
  return NextResponse.json({
    status: aiObservability.getStatus(),
    metrics: aiObservability.listMetrics(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as AIRequestMetric;

  const metric = aiObservability.record(body);

  return NextResponse.json(
    {
      metric,
    },
    {
      status: 201,
    },
  );
}