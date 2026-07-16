import { NextResponse } from "next/server";
import { schedulerService } from "@/lib/scheduler/scheduler-service";
import type { CreateScheduleInput } from "@/lib/scheduler/scheduler-types";

export async function GET() {
  return NextResponse.json(schedulerService.getStatus());
}

export async function POST(request: Request) {
  const body = (await request.json()) as CreateScheduleInput;

  if (!body.tenantId || !body.name || !body.jobType || !body.frequency) {
    return NextResponse.json(
      {
        error: "tenantId, name, jobType and frequency are required",
      },
      { status: 400 },
    );
  }

  const schedule = schedulerService.createSchedule(body);

  return NextResponse.json(
    {
      schedule,
    },
    { status: 201 },
  );
}

export async function PATCH() {
  const jobs = schedulerService.runDueSchedules();

  return NextResponse.json({
    createdJobs: jobs,
    count: jobs.length,
  });
}