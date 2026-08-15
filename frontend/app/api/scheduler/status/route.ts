import { NextRequest, NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { schedulerService } from "@/lib/scheduler/scheduler-service";
import type { CreateScheduleInput } from "@/lib/scheduler/scheduler-types";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.RELIABILITY_VIEW);
    return NextResponse.json(await schedulerService.getStatus(principal.tenantId));
  } catch (error) { return routeErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.ADMIN_SETTINGS_MANAGE);
    const body = await request.json() as CreateScheduleInput;
    if (!body.name?.trim() || !body.jobType || !body.frequency || !body.nextRunAt ||
        Number.isNaN(new Date(body.nextRunAt).getTime())) {
      throw new Error("name, jobType, frequency and a valid nextRunAt are required");
    }
    const schedule = await schedulerService.createSchedule({ ...body,
      tenantId: principal.tenantId, actorId: principal.userId,
      idempotencyKey: request.headers.get("x-idempotency-key")?.trim() || undefined,
      requestId: request.headers.get("x-request-id") });
    return NextResponse.json({ schedule }, { status: 201 });
  } catch (error) { return routeErrorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.ADMIN_SETTINGS_MANAGE);
    const jobIds = await schedulerService.runDueSchedules(principal.tenantId,
      principal.userId, request.headers.get("x-request-id"));
    return NextResponse.json({ createdJobIds: jobIds, count: jobIds.length });
  } catch (error) { return routeErrorResponse(error); }
}
