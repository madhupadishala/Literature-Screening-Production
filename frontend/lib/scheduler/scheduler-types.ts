import type { JobPriority, JobType } from "@/lib/jobs/job-types";

export type ScheduleStatus = "active" | "paused" | "disabled";

export type ScheduleFrequency =
  | "once"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly";

export interface ScheduleDefinition {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  jobType: JobType;
  priority: JobPriority;
  frequency: ScheduleFrequency;
  status: ScheduleStatus;
  payload: Record<string, unknown>;
  nextRunAt: string;
  lastRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScheduleInput {
  tenantId: string;
  name: string;
  description?: string;
  jobType: JobType;
  priority?: JobPriority;
  frequency: ScheduleFrequency;
  payload?: Record<string, unknown>;
  nextRunAt: string;
}

export interface SchedulerStatusResponse {
  schedules: ScheduleDefinition[];
  total: number;
  active: number;
  paused: number;
  disabled: number;
  dueNow: number;
}