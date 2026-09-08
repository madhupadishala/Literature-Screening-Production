import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";
import type { CreateScheduleInput, ScheduleDefinition, SchedulerStatusResponse } from "./scheduler-types";

interface ScheduleRow {
  id: string; tenant_id: string; name: string; description: string | null;
  job_type: ScheduleDefinition["jobType"]; priority: ScheduleDefinition["priority"];
  frequency: ScheduleDefinition["frequency"]; status: ScheduleDefinition["status"];
  payload: Record<string, unknown>; next_run_at: Date; last_run_at: Date | null;
  created_at: Date; updated_at: Date;
}

function toSchedule(row: ScheduleRow): ScheduleDefinition {
  return { id: row.id, tenantId: row.tenant_id, name: row.name,
    description: row.description ?? undefined, jobType: row.job_type,
    priority: row.priority, frequency: row.frequency, status: row.status,
    payload: row.payload, nextRunAt: row.next_run_at.toISOString(),
    lastRunAt: row.last_run_at?.toISOString(), createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString() };
}

function nextRun(date: Date, frequency: ScheduleDefinition["frequency"]): Date {
  const next = new Date(date);
  if (frequency === "hourly") next.setUTCHours(next.getUTCHours() + 1);
  if (frequency === "daily") next.setUTCDate(next.getUTCDate() + 1);
  if (frequency === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  if (frequency === "monthly") next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

export class SchedulerService {
  async createSchedule(input: CreateScheduleInput & {
    actorId?: string; idempotencyKey?: string; requestId?: string | null;
  }): Promise<ScheduleDefinition> {
    const client = await getPostgresPool().connect();
    try {
      await client.query("BEGIN");
      if (input.idempotencyKey) {
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`,
          [`${input.tenantId}:${input.idempotencyKey}`]);
        const existing = await client.query<ScheduleRow>(
          `SELECT * FROM durable_schedules WHERE tenant_id = $1 AND idempotency_key = $2`,
          [input.tenantId, input.idempotencyKey]);
        if (existing.rows[0]) { await client.query("COMMIT"); return toSchedule(existing.rows[0]); }
      }
      const created = await client.query<ScheduleRow>(
        `INSERT INTO durable_schedules (tenant_id, idempotency_key, name, description,
           job_type, priority, frequency, payload, next_run_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10) RETURNING *`,
        [input.tenantId, input.idempotencyKey ?? null, input.name, input.description ?? null,
          input.jobType, input.priority ?? "normal", input.frequency,
          JSON.stringify(input.payload ?? {}), input.nextRunAt, input.actorId ?? null]);
      await client.query(
        `INSERT INTO audit_events (tenant_id, actor_id, event_type, event_category,
           outcome, request_id, details)
         VALUES ($1,$2,'DURABLE_SCHEDULE_CREATED','BACKGROUND_JOBS','success',$3,$4::jsonb)`,
        [input.tenantId, input.actorId ?? null, input.requestId ?? null,
          JSON.stringify({ scheduleId: created.rows[0].id,
            idempotencyKey: input.idempotencyKey ?? null })]);
      await client.query("COMMIT");
      return toSchedule(created.rows[0]);
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  async listSchedules(tenantId: string): Promise<ScheduleDefinition[]> {
    const result = await getPostgresPool().query<ScheduleRow>(
      `SELECT * FROM durable_schedules WHERE tenant_id = $1 ORDER BY next_run_at`, [tenantId]);
    return result.rows.map(toSchedule);
  }

  async runDueSchedules(tenantId: string, actorId?: string, requestId?: string | null) {
    const client = await getPostgresPool().connect();
    try {
      await client.query("BEGIN");
      const due = await client.query<ScheduleRow>(
        `SELECT * FROM durable_schedules WHERE tenant_id = $1 AND status = 'active'
           AND next_run_at <= now() ORDER BY next_run_at FOR UPDATE SKIP LOCKED`, [tenantId]);
      const jobIds: string[] = [];
      for (const schedule of due.rows) {
        const idempotencyKey = `${schedule.id}:${schedule.next_run_at.toISOString()}`;
        const job = await client.query<{ id: string }>(
          `INSERT INTO background_jobs (tenant_id, idempotency_key, job_type, priority,
             payload, created_by) VALUES ($1,$2,$3,$4,$5::jsonb,$6)
           ON CONFLICT (tenant_id, idempotency_key) DO UPDATE
             SET updated_at = background_jobs.updated_at RETURNING id`,
          [tenantId, idempotencyKey, schedule.job_type, schedule.priority,
            JSON.stringify({ ...schedule.payload, scheduleId: schedule.id }), actorId ?? null]);
        jobIds.push(job.rows[0].id);
        await client.query(
          `UPDATE durable_schedules SET last_run_at = now(), updated_at = now(),
             status = CASE WHEN frequency = 'once' THEN 'disabled' ELSE status END,
             next_run_at = CASE WHEN frequency = 'once' THEN next_run_at ELSE $3 END
           WHERE tenant_id = $1 AND id = $2`,
          [tenantId, schedule.id, nextRun(new Date(), schedule.frequency)]);
        await client.query(
          `INSERT INTO audit_events (tenant_id, actor_id, event_type, event_category,
             outcome, request_id, details)
           VALUES ($1,$2,'DURABLE_SCHEDULE_DISPATCHED','BACKGROUND_JOBS','success',$3,$4::jsonb)`,
          [tenantId, actorId ?? null, requestId ?? null,
            JSON.stringify({ scheduleId: schedule.id, jobId: job.rows[0].id })]);
      }
      await client.query("COMMIT");
      return jobIds;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  async getStatus(tenantId: string): Promise<SchedulerStatusResponse> {
    const schedules = await this.listSchedules(tenantId);
    const now = Date.now();
    return { schedules, total: schedules.length,
      active: schedules.filter((item) => item.status === "active").length,
      paused: schedules.filter((item) => item.status === "paused").length,
      disabled: schedules.filter((item) => item.status === "disabled").length,
      dueNow: schedules.filter((item) => item.status === "active" &&
        new Date(item.nextRunAt).getTime() <= now).length };
  }
}

export const schedulerService = new SchedulerService();
