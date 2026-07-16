export type ExportJobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed";

export type ExportFormat =
  | "csv"
  | "excel"
  | "json"
  | "pdf"
  | "zip";

export type ExportScope =
  | "hits"
  | "screening"
  | "intake"
  | "qc"
  | "evidence"
  | "audit"
  | "reports"
  | "all";

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
}

const exportJobs = new Map<string, ExportJob>();

function createExportJobId(): string {
  return `export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class ExportStore {
  create(input: CreateExportJobInput): ExportJob {
    const now = new Date().toISOString();

    const job: ExportJob = {
      id: createExportJobId(),
      tenantId: input.tenantId,
      scope: input.scope,
      format: input.format,
      status: "queued",
      totalRecords: input.totalRecords ?? 0,
      exportedRecords: 0,
      errors: [],
      metadata: input.metadata,
      requestedBy: input.requestedBy,
      createdAt: now,
      updatedAt: now,
    };

    exportJobs.set(job.id, job);

    return job;
  }

  update(jobId: string, patch: Partial<ExportJob>): ExportJob | undefined {
    const existing = exportJobs.get(jobId);

    if (!existing) {
      return undefined;
    }

    const updated: ExportJob = {
      ...existing,
      ...patch,
      id: existing.id,
      tenantId: existing.tenantId,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    exportJobs.set(jobId, updated);

    return updated;
  }

  get(jobId: string): ExportJob | undefined {
    return exportJobs.get(jobId);
  }

  list(tenantId: string): ExportJob[] {
    return Array.from(exportJobs.values())
      .filter((job) => job.tenantId === tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  clearTenant(tenantId: string): number {
    let deleted = 0;

    for (const [id, job] of exportJobs.entries()) {
      if (job.tenantId === tenantId) {
        exportJobs.delete(id);
        deleted += 1;
      }
    }

    return deleted;
  }
}

export const exportStore = new ExportStore();