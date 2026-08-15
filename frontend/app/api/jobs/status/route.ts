import { NextRequest, NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { jobQueue } from "@/lib/jobs/job-queue";
import { jobRunner } from "@/lib/jobs/job-runner";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.RELIABILITY_VIEW);
    const [summary, jobs] = await Promise.all([
      jobQueue.summary(principal.tenantId), jobQueue.list(principal.tenantId),
    ]);
    return NextResponse.json({ success: true,
      data: { summary, jobs, generatedAt: new Date().toISOString() } });
  } catch (error) { return routeErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.SUPER_USER_CONSOLE_MANAGE);
    const body = await request.json() as { limit?: number };
    const limit = Math.max(1, Math.min(Number(body.limit) || 5, 20));
    await jobQueue.recoverStaleClaims(principal.tenantId);
    const completedJobs = await jobRunner.runMany(principal.tenantId, limit);
    const [summary, jobs] = await Promise.all([
      jobQueue.summary(principal.tenantId), jobQueue.list(principal.tenantId),
    ]);
    return NextResponse.json({ success: true, data: { completedJobs, summary, jobs } });
  } catch (error) { return routeErrorResponse(error); }
}
