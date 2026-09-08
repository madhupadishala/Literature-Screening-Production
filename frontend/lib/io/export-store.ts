import "server-only";

import { createHash } from "node:crypto";
import { getPostgresPool } from "@/lib/database/postgres";

export type ExportJobStatus = "queued" | "processing" | "completed" | "failed";
export type ExportFormat = "csv" | "excel" | "json" | "pdf" | "zip";
export type ExportScope = "hits" | "screening" | "intake" | "qc" | "evidence" | "audit" | "reports" | "all";

export interface ExportJob {
  id: string;
  tenantId: string;
  scope: ExportScope;
  format: ExportFormat;
  status: ExportJobStatus;
  totalRecords: number;
  exportedRecords: number;
  downloadUrl?: string;
  errors: string[];
  metadata?: Record<string, unknown>;
  requestedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExportJobInput {
  tenantId: string;
  scope: ExportScope;
  format: ExportFormat;
  totalRecords?: number;
  metadata?: Record<string, unknown>;
  requestedBy?: string;
  idempotencyKey?: string;
  requestId?: string | null;
}

interface ExportRow {
  id: string;
  tenant_id: string;
  scope: ExportScope;
  format: ExportFormat;
  status: ExportJobStatus;
  total_records: number;
  exported_records: number;
  errors: string[];
  metadata: Record<string, unknown>;
  requested_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ExportContent {
  content: Buffer;
  media_type: string;
  file_name: string;
  sha256: string;
}

function toJob(row: ExportRow): ExportJob {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    scope: row.scope,
    format: row.format,
    status: row.status,
    totalRecords: row.total_records,
    exportedRecords: row.exported_records,
    downloadUrl: row.status === "completed" ? `/api/io/export/${row.id}` : undefined,
    errors: row.errors,
    metadata: row.metadata,
    requestedBy: row.requested_by ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class ExportStore {
  async create(input: CreateExportJobInput): Promise<ExportJob> {
    const client = await getPostgresPool().connect();
    try {
      await client.query("BEGIN");
      if (input.idempotencyKey) {
        const existing = await client.query<ExportRow>(
          `SELECT * FROM export_jobs WHERE tenant_id = $1 AND idempotency_key = $2`,
          [input.tenantId, input.idempotencyKey],
        );
        if (existing.rows[0]) {
          await client.query("COMMIT");
          return toJob(existing.rows[0]);
        }
      }
      const result = await client.query<ExportRow>(
        `INSERT INTO export_jobs (
           tenant_id, idempotency_key, scope, format, total_records, metadata, requested_by
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) RETURNING *`,
        [input.tenantId, input.idempotencyKey ?? null, input.scope, input.format,
          input.totalRecords ?? 0, JSON.stringify(input.metadata ?? {}), input.requestedBy ?? null],
      );
      await client.query(
        `INSERT INTO audit_events (
           tenant_id, actor_id, event_type, event_category, outcome, request_id, details
         ) VALUES ($1, $2, 'EXPORT_JOB_CREATED', 'DATA_EXPORT', 'success', $3, $4::jsonb)`,
        [input.tenantId, input.requestedBy ?? null, input.requestId ?? null,
          JSON.stringify({ jobId: result.rows[0].id, scope: input.scope, format: input.format,
            idempotencyKey: input.idempotencyKey ?? null })],
      );
      await client.query("COMMIT");
      return toJob(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async attachContent(input: {
    tenantId: string;
    jobId: string;
    bytes: Buffer;
    mediaType: string;
    fileName: string;
    actorId?: string;
    requestId?: string | null;
  }): Promise<ExportJob | undefined> {
    const client = await getPostgresPool().connect();
    try {
      await client.query("BEGIN");
      const digest = createHash("sha256").update(input.bytes).digest("hex");
      const updated = await client.query<ExportRow>(
        `UPDATE export_jobs SET status = 'completed', updated_at = now()
          WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        [input.tenantId, input.jobId],
      );
      if (!updated.rows[0]) {
        await client.query("ROLLBACK");
        return undefined;
      }
      await client.query(
        `INSERT INTO export_job_contents (
           export_job_id, tenant_id, content, media_type, file_name, sha256, size_bytes
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (export_job_id) DO UPDATE SET content = EXCLUDED.content,
           media_type = EXCLUDED.media_type, file_name = EXCLUDED.file_name,
           sha256 = EXCLUDED.sha256, size_bytes = EXCLUDED.size_bytes`,
        [input.jobId, input.tenantId, input.bytes, input.mediaType,
          input.fileName, digest, input.bytes.length],
      );
      await client.query(
        `INSERT INTO audit_events (
           tenant_id, actor_id, event_type, event_category, outcome, request_id, details
         ) VALUES ($1, $2, 'EXPORT_CONTENT_ATTACHED', 'DATA_EXPORT', 'success', $3, $4::jsonb)`,
        [input.tenantId, input.actorId ?? null, input.requestId ?? null,
          JSON.stringify({ jobId: input.jobId, sha256: digest,
            sizeBytes: input.bytes.length, mediaType: input.mediaType, fileName: input.fileName })],
      );
      await client.query("COMMIT");
      return toJob(updated.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async get(tenantId: string, jobId: string): Promise<ExportJob | undefined> {
    const result = await getPostgresPool().query<ExportRow>(
      `SELECT * FROM export_jobs WHERE tenant_id = $1 AND id = $2`,
      [tenantId, jobId],
    );
    return result.rows[0] ? toJob(result.rows[0]) : undefined;
  }

  async getContent(tenantId: string, jobId: string): Promise<ExportContent | undefined> {
    const result = await getPostgresPool().query<ExportContent>(
      `SELECT content, media_type, file_name, sha256 FROM export_job_contents
        WHERE tenant_id = $1 AND export_job_id = $2`,
      [tenantId, jobId],
    );
    return result.rows[0];
  }

  async list(tenantId: string): Promise<ExportJob[]> {
    const result = await getPostgresPool().query<ExportRow>(
      `SELECT * FROM export_jobs WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId],
    );
    return result.rows.map(toJob);
  }
}

export const exportStore = new ExportStore();
