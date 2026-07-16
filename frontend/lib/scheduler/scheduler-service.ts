import { jobQueue } from "@/lib/jobs/job-queue";
import type { CreateScheduleInput, ScheduleDefinition } from "./scheduler-types";

function createScheduleId() {
  return `schedule_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function addFrequencyDate(
  date: Date,
  frequency: ScheduleDefinition["frequency"],
) {
  const next = new Date(date);

  if (frequency === "hourly") {
    next.setHours(next.getHours() + 1);
  }

  if (frequency === "daily") {
    next.setDate(next.getDate() + 1);
  }

  if (frequency === "weekly") {
    next.setDate(next.getDate() + 7);
  }

  if (frequency === "monthly") {
    next.setMonth(next.getMonth() + 1);
  }

  return next;
}

type JobQueueAdapter = {
  createJob?: (input: {
    tenantId: string;
    type: ScheduleDefinition["jobType"];
    priority: ScheduleDefinition["priority"];
    payload: Record<string, unknown>;
  }) => unknown;
  create?: (input: {
    tenantId: string;
    type: ScheduleDefinition["jobType"];
    priority: ScheduleDefinition["priority"];
    payload: Record<string, unknown>;
  }) => unknown;
  enqueue?: (input: {
    tenantId: string;
    type: ScheduleDefinition["jobType"];
    priority: ScheduleDefinition["priority"];
    payload: Record<string, unknown>;
  }) => unknown;
};

class SchedulerService {
  private schedules = new Map<string, ScheduleDefinition>();

  createSchedule(input: CreateScheduleInput): ScheduleDefinition {
    const now = new Date().toISOString();

    const schedule: ScheduleDefinition = {
      id: createScheduleId(),
      tenantId: input.tenantId,
      name: input.name,
      description: input.description,
      jobType: input.jobType,
      priority: input.priority ?? "normal",
      frequency: input.frequency,
      status: "active",
      payload: input.payload ?? {},
      nextRunAt: input.nextRunAt,
      createdAt: now,
      updatedAt: now,
    };

    this.schedules.set(schedule.id, schedule);
    return schedule;
  }

  listSchedules() {
    return Array.from(this.schedules.values()).sort((a, b) =>
      a.nextRunAt.localeCompare(b.nextRunAt),
    );
  }

  getSchedule(id: string) {
    return this.schedules.get(id) ?? null;
  }

  updateSchedule(id: string, patch: Partial<ScheduleDefinition>) {
    const existing = this.schedules.get(id);

    if (!existing) {
      return null;
    }

    const updated: ScheduleDefinition = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    this.schedules.set(id, updated);
    return updated;
  }

  getDueSchedules(now = new Date()) {
    return this.listSchedules().filter((schedule) => {
      return (
        schedule.status === "active" &&
        new Date(schedule.nextRunAt).getTime() <= now.getTime()
      );
    });
  }

  runDueSchedules() {
    const now = new Date();
    const dueSchedules = this.getDueSchedules(now);

    const createdJobs = dueSchedules.map((schedule) => {
      const queueAdapter = jobQueue as unknown as JobQueueAdapter;

      const createJob =
        queueAdapter.createJob ?? queueAdapter.create ?? queueAdapter.enqueue;

      if (!createJob) {
        throw new Error("Job queue create method is not available");
      }

      const job = createJob.call(jobQueue, {
        tenantId: schedule.tenantId,
        type: schedule.jobType,
        priority: schedule.priority,
        payload: {
          ...schedule.payload,
          scheduleId: schedule.id,
        },
      });

      if (schedule.frequency === "once") {
        this.updateSchedule(schedule.id, {
          status: "disabled",
          lastRunAt: now.toISOString(),
        });
      } else {
        this.updateSchedule(schedule.id, {
          lastRunAt: now.toISOString(),
          nextRunAt: addFrequencyDate(now, schedule.frequency).toISOString(),
        });
      }

      return job;
    });

    return createdJobs;
  }

  getStatus() {
    const schedules = this.listSchedules();
    const dueNow = this.getDueSchedules();

    return {
      schedules,
      total: schedules.length,
      active: schedules.filter((schedule) => schedule.status === "active")
        .length,
      paused: schedules.filter((schedule) => schedule.status === "paused")
        .length,
      disabled: schedules.filter((schedule) => schedule.status === "disabled")
        .length,
      dueNow: dueNow.length,
    };
  }
}

export const schedulerService = new SchedulerService();