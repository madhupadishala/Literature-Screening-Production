import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";

export type ImportJobStatus = "queued" | "processing" | "completed" | "failed";
export type ImportSourceType = "csv" | "excel" | "json" | "pdf" | "zip" | "api";

export interface ImportJob {
  id: string;
  tenantId: string;
  sourceType: ImportSourceType;
  fileName?: string;
  status: ImportJobStatus;
  totalRecords: number;
  processedRecords: number;
  failedRecords: number;
  errors: string[];
  metadata?: Record<string, unknown>;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateImportJobInput {
  tenantId: string;
  sourceType: ImportSourceType;
  fileName?: string;
  totalRecords?: number;
  metadata?: Record<string, unknown>;
  createdBy?: string;
  idempotencyKey?: string;
  requestId?: string | null;
}

interface ImportRow {
  id: string;
  tenant_id: string;
  source_type: ImportSourceType;
  file_name: string | null;
  status: ImportJobStatus;
  total_records: number;
  processed_records: number;
  failed_records: number;
  errors: string[];
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

function toJob(row: ImportRow): ImportJob {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    sourceType: row.source_type,
    fileName: row.file_name ?? undefined,
    status: row.status,
    totalRecords: row.total_records,
    processedRecords: row.processed_records,
    failedRecords: row.failed_records,
    errors: row.errors,
    metadata: row.metadata,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class ImportStore {
  async create(input: CreateImportJobInput): Promise<ImportJob> {
    const client = await getPostgresPool().connect();
    try {
      await client.query("BEGIN");
      if (input.idempotencyKey) {
        const existing = await client.query<ImportRow>(
          `SELECT * FROM import_jobs WHERE tenant_id = $1 AND idempotency_key = $2`,
          [input.tenantId, input.idempotencyKey],
        );
        if (existing.rows[0]) {
          await client.query("COMMIT");
          return toJob(existing.rows[0]);
        }
      }
      const result = await client.query<ImportRow>(
        `INSERT INTO import_jobs (
           tenant_id, idempotency_key, source_type, file_name, total_records, metadata, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) RETURNING *`,
        [input.tenantId, input.idempotencyKey ?? null, input.sourceType,
          input.fileName ?? null, input.totalRecords ?? 0,
          JSON.stringify(input.metadata ?? {}), input.createdBy ?? null],
      );
      await client.query(
        `INSERT INTO audit_events (
           tenant_id, actor_id, event_type, event_category, outcome, request_id, details
         ) VALUES ($1, $2, 'IMPORT_JOB_CREATED', 'DATA_IMPORT', 'success', $3, $4::jsonb)`,
        [input.tenantId, input.createdBy ?? null, input.requestId ?? null,
          JSON.stringify({ jobId: result.rows[0].id, sourceType: input.sourceType,
            fileName: input.fileName ?? null, idempotencyKey: input.idempotencyKey ?? null })],
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

  async get(tenantId: string, jobId: string): Promise<ImportJob | undefined> {
    const result = await getPostgresPool().query<ImportRow>(
      `SELECT * FROM import_jobs WHERE tenant_id = $1 AND id = $2`,
      [tenantId, jobId],
    );
    return result.rows[0] ? toJob(result.rows[0]) : undefined;
  }

  async list(tenantId: string): Promise<ImportJob[]> {
    const result = await getPostgresPool().query<ImportRow>(
      `SELECT * FROM import_jobs WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId],
    );
    return result.rows.map(toJob);
  }
}

export const importStore = new ImportStore();
