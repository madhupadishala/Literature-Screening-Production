import { NextRequest, NextResponse } from "next/server";

import {
  getWorkflowTimeline,
} from "@/lib/workflow/workflow-timeline-store";

export async function GET(
  request: NextRequest,
) {

  const { searchParams } = new URL(request.url);

  const packageId =
    searchParams.get("packageId") ??
    "PKG-LIT-2026-0001";

  return NextResponse.json({

    ok: true,

    generatedAt: new Date().toISOString(),

    data: getWorkflowTimeline(packageId),

  });

}