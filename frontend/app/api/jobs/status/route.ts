import { NextRequest, NextResponse } from "next/server";

import { jobQueue } from "@/lib/jobs/job-queue";
import { jobRunner } from "@/lib/jobs/job-runner";

export async function GET(request: NextRequest) {
  try {
    const tenantId =
      request.nextUrl.searchParams.get("tenantId") ?? "demo-tenant";

    jobQueue.seedDemoJobs(tenantId);

    return NextResponse.json({
      success: true,
      data: {
        summary: jobQueue.summary(tenantId),
        jobs: jobQueue.list(tenantId),
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Job Status Error", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Unknown job status error",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const tenantId = body.tenantId ?? "demo-tenant";
    const limit = body.limit ?? 5;

    jobQueue.seedDemoJobs(tenantId);

    const completedJobs = await jobRunner.runMany(tenantId, limit);

    return NextResponse.json({
      success: true,
      data: {
        completedJobs,
        summary: jobQueue.summary(tenantId),
        jobs: jobQueue.list(tenantId),
      },
    });
  } catch (error) {
    console.error("Job Runner Error", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Unknown job runner error",
      },
      { status: 500 },
    );
  }
}