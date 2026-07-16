import type {
  CreateJobInput,
  JobRecord,
  JobStatus,
  JobSummary,
} from "./job-types";

const jobs = new Map<string, JobRecord>();

function createJobId(): string {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class JobQueue {
  enqueue(input: CreateJobInput): JobRecord {
    const now = new Date().toISOString();

    const job: JobRecord = {
      id: createJobId(),
      tenantId: input.tenantId,
      type: input.type,
      status: "queued",
      priority: input.priority ?? "normal",
      payload: input.payload ?? {},
      attempts: 0,
      maxAttempts: input.maxAttempts ?? 3,
      progress: 0,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };

    jobs.set(job.id, job);

    return job;
  }

  get(jobId: string): JobRecord | undefined {
    return jobs.get(jobId);
  }

  list(tenantId: string): JobRecord[] {
    return Array.from(jobs.values())
      .filter((job) => job.tenantId === tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  listByStatus(tenantId: string, status: JobStatus): JobRecord[] {
    return this.list(tenantId).filter((job) => job.status === status);
  }

  next(tenantId?: string): JobRecord | undefined {
    const queued = Array.from(jobs.values())
      .filter((job) => job.status === "queued")
      .filter((job) => !tenantId || job.tenantId === tenantId)
      .sort((left, right) => {
        const priorityOrder = {
          critical: 4,
          high: 3,
          normal: 2,
          low: 1,
        };

        return (
          priorityOrder[right.priority] - priorityOrder[left.priority] ||
          left.createdAt.localeCompare(right.createdAt)
        );
      });

    return queued[0];
  }

  update(jobId: string, patch: Partial<JobRecord>): JobRecord | undefined {
    const existing = jobs.get(jobId);

    if (!existing) {
      return undefined;
    }

    const updated: JobRecord = {
      ...existing,
      ...patch,
      id: existing.id,
      tenantId: existing.tenantId,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    jobs.set(jobId, updated);

    return updated;
  }

  cancel(jobId: string): boolean {
    const existing = jobs.get(jobId);

    if (!existing) {
      return false;
    }

    this.update(jobId, {
      status: "cancelled",
      progress: existing.progress,
    });

    return true;
  }

  summary(tenantId: string): JobSummary {
    const list = this.list(tenantId);

    return {
      total: list.length,
      queued: list.filter((job) => job.status === "queued").length,
      processing: list.filter((job) => job.status === "processing").length,
      completed: list.filter((job) => job.status === "completed").length,
      failed: list.filter((job) => job.status === "failed").length,
      cancelled: list.filter((job) => job.status === "cancelled").length,
    };
  }

  seedDemoJobs(tenantId: string): void {
    if (this.list(tenantId).length > 0) {
      return;
    }

    this.enqueue({
      tenantId,
      type: "article_fetch",
      priority: "high",
      payload: {
        pmid: "demo-001",
      },
      createdBy: "scheduler",
    });

    this.enqueue({
      tenantId,
      type: "ocr",
      priority: "normal",
      payload: {
        documentId: "doc-demo-001",
      },
      createdBy: "document-manager",
    });

    this.enqueue({
      tenantId,
      type: "hits_ai",
      priority: "critical",
      payload: {
        articleId: "article-demo-001",
      },
      createdBy: "ai-orchestrator",
    });
  }
}

export const jobQueue = new JobQueue();