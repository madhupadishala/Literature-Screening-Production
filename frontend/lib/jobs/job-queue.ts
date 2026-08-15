import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";
import type { CreateJobInput, JobRecord, JobStatus, JobSummary } from "./job-types";

interface JobRow {
  id: string;
  tenant_id: string;
  job_type: JobRecord["type"];
  status: JobStatus;
  priority: JobRecord["priority"];
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  progress: number;
  error_message: string | null;
  result: Record<string, unknown> | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}

function toJob(row: JobRow): JobRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    type: row.job_type,
    status: row.status,
    priority: row.priority,
    payload: row.payload,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    progress: row.progress,
    error: row.error_message ?? undefined,
    result: row.result ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    startedAt: row.started_at?.toISOString(),
    completedAt: row.completed_at?.toISOString(),
  };
}

async function audit(
  client: { query: (text: string, values?: unknown[]) => Promise<unknown> },
  tenantId: string,
  actorId: string | undefined,
  requestId: string | null | undefined,
  eventType: string,
  details: Record<string, unknown>,
) {
  await client.query(
    `INSERT INTO audit_events (
       tenant_id, actor_id, event_type, event_category, outcome, request_id, details
     ) VALUES ($1, $2, $3, 'BACKGROUND_JOBS', 'success', $4, $5::jsonb)`,
    [tenantId, actorId ?? null, eventType, requestId ?? null,
      JSON.stringify(details)],
  );
}

export class JobQueue {
  async enqueue(input: CreateJobInput): Promise<JobRecord> {
    const client = await getPostgresPool().connect();
    try {
      await client.query("BEGIN");
      if (input.idempotencyKey) {
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`,
          [`${input.tenantId}:${input.idempotencyKey}`]);
        const existing = await client.query<JobRow>(
          `SELECT * FROM background_jobs WHERE tenant_id = $1 AND idempotency_key = $2`,
          [input.tenantId, input.idempotencyKey],
        );
        if (existing.rows[0]) {
          await client.query("COMMIT");
          return toJob(existing.rows[0]);
        }
      }
      const inserted = await client.query<JobRow>(
        `INSERT INTO background_jobs (
           tenant_id, idempotency_key, job_type, priority, payload, max_attempts, created_by
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7) RETURNING *`,
        [input.tenantId, input.idempotencyKey ?? null, input.type,
          input.priority ?? "normal", JSON.stringify(input.payload ?? {}),
          input.maxAttempts ?? 3, input.createdBy ?? null],
      );
      await audit(client, input.tenantId, input.createdBy, input.requestId,
        "BACKGROUND_JOB_ENQUEUED", {
        jobId: inserted.rows[0].id,
        jobType: input.type,
        idempotencyKey: input.idempotencyKey ?? null,
        });
      await client.query("COMMIT");
      return toJob(inserted.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async get(tenantId: string, id: string): Promise<JobRecord | undefined> {
    const result = await getPostgresPool().query<JobRow>(
      `SELECT * FROM background_jobs WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    return result.rows[0] ? toJob(result.rows[0]) : undefined;
  }

  async list(tenantId: string): Promise<JobRecord[]> {
    const result = await getPostgresPool().query<JobRow>(
      `SELECT * FROM background_jobs WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId],
    );
    return result.rows.map(toJob);
  }

  async summary(tenantId: string): Promise<JobSummary> {
    const result = await getPostgresPool().query<{ status: JobStatus; count: string }>(
      `SELECT status, count(*)::text AS count FROM background_jobs
        WHERE tenant_id = $1 GROUP BY status`,
      [tenantId],
    );
    const counts = new Map(result.rows.map((row) => [row.status, Number(row.count)]));
    const summary: JobSummary = {
      total: 0,
      queued: counts.get("queued") ?? 0,
      processing: counts.get("processing") ?? 0,
      completed: counts.get("completed") ?? 0,
      failed: counts.get("failed") ?? 0,
      cancelled: counts.get("cancelled") ?? 0,
    };
    summary.total = summary.queued + summary.processing + summary.completed +
      summary.failed + summary.cancelled;
    return summary;
  }

  async claimNext(tenantId: string, leaseSeconds = 60): Promise<JobRecord | undefined> {
    const result = await getPostgresPool().query<JobRow>(
      `WITH candidate AS (
         SELECT id FROM background_jobs
          WHERE tenant_id = $1 AND status = 'queued' AND next_attempt_at <= now()
          ORDER BY CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2
                   WHEN 'normal' THEN 3 ELSE 4 END, created_at
          FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE background_jobs job SET status = 'processing', attempts = attempts + 1,
         progress = 1, claim_token = gen_random_uuid(),
         locked_until = now() + ($2 * interval '1 second'),
         started_at = COALESCE(started_at, now()), updated_at = now()
       FROM candidate WHERE job.id = candidate.id RETURNING job.*`,
      [tenantId, Math.max(1, Math.min(leaseSeconds, 3600))],
    );
    return result.rows[0] ? toJob(result.rows[0]) : undefined;
  }

  async complete(
    tenantId: string,
    id: string,
    resultPayload: Record<string, unknown>,
  ): Promise<JobRecord | undefined> {
    const result = await getPostgresPool().query<JobRow>(
      `UPDATE background_jobs SET status = 'completed', progress = 100,
         result = $3::jsonb, completed_at = now(), locked_until = NULL,
         claim_token = NULL, updated_at = now()
       WHERE tenant_id = $1 AND id = $2 AND status = 'processing' RETURNING *`,
      [tenantId, id, JSON.stringify(resultPayload)],
    );
    return result.rows[0] ? toJob(result.rows[0]) : undefined;
  }

  async fail(tenantId: string, id: string, message: string): Promise<JobRecord | undefined> {
    const result = await getPostgresPool().query<JobRow>(
      `UPDATE background_jobs SET
         status = CASE WHEN attempts < max_attempts THEN 'queued' ELSE 'failed' END,
         progress = CASE WHEN attempts < max_attempts THEN 0 ELSE progress END,
         error_message = $3, claim_token = NULL, locked_until = NULL,
         next_attempt_at = CASE WHEN attempts < max_attempts
           THEN now() + (LEAST(300, power(2, attempts)::integer) * interval '1 second')
           ELSE next_attempt_at END,
         completed_at = CASE WHEN attempts >= max_attempts THEN now() ELSE completed_at END,
         updated_at = now()
       WHERE tenant_id = $1 AND id = $2 AND status = 'processing' RETURNING *`,
      [tenantId, id, message.slice(0, 2000)],
    );
    return result.rows[0] ? toJob(result.rows[0]) : undefined;
  }

  async recoverStaleClaims(tenantId: string): Promise<number> {
    const result = await getPostgresPool().query(
      `UPDATE background_jobs SET
         status = CASE WHEN attempts < max_attempts THEN 'queued' ELSE 'failed' END,
         error_message = 'Worker lease expired', claim_token = NULL, locked_until = NULL,
         next_attempt_at = now(),
         completed_at = CASE WHEN attempts >= max_attempts THEN now() ELSE completed_at END,
         updated_at = now()
       WHERE tenant_id = $1 AND status = 'processing' AND locked_until < now()`,
      [tenantId],
    );
    return result.rowCount ?? 0;
  }
}

export const jobQueue = new JobQueue();
