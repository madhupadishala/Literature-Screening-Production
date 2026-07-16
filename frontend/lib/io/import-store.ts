export type ImportJobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed";

export type ImportSourceType =
  | "csv"
  | "excel"
  | "json"
  | "pdf"
  | "zip"
  | "api";

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
}

const importJobs = new Map<string, ImportJob>();

function createImportJobId(): string {
  return `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class ImportStore {
  create(input: CreateImportJobInput): ImportJob {
    const now = new Date().toISOString();

    const job: ImportJob = {
      id: createImportJobId(),
      tenantId: input.tenantId,
      sourceType: input.sourceType,
      fileName: input.fileName,
      status: "queued",
      totalRecords: input.totalRecords ?? 0,
      processedRecords: 0,
      failedRecords: 0,
      errors: [],
      metadata: input.metadata,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };

    importJobs.set(job.id, job);

    return job;
  }

  update(jobId: string, patch: Partial<ImportJob>): ImportJob | undefined {
    const existing = importJobs.get(jobId);

    if (!existing) {
      return undefined;
    }

    const updated: ImportJob = {
      ...existing,
      ...patch,
      id: existing.id,
      tenantId: existing.tenantId,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    importJobs.set(jobId, updated);

    return updated;
  }

  get(jobId: string): ImportJob | undefined {
    return importJobs.get(jobId);
  }

  list(tenantId: string): ImportJob[] {
    return Array.from(importJobs.values())
      .filter((job) => job.tenantId === tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  clearTenant(tenantId: string): number {
    let deleted = 0;

    for (const [id, job] of importJobs.entries()) {
      if (job.tenantId === tenantId) {
        importJobs.delete(id);
        deleted += 1;
      }
    }

    return deleted;
  }
}

export const importStore = new ImportStore();