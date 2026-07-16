import { jobQueue } from "./job-queue";
import type { JobRecord } from "./job-types";

function mockResult(job: JobRecord): Record<string, unknown> {
  return {
    message: `${job.type} completed successfully.`,
    processedAt: new Date().toISOString(),
    payload: job.payload,
  };
}

export class JobRunner {
  async runNext(tenantId?: string): Promise<JobRecord | undefined> {
    const job = jobQueue.next(tenantId);

    if (!job) {
      return undefined;
    }

    jobQueue.update(job.id, {
      status: "processing",
      attempts: job.attempts + 1,
      progress: 25,
      startedAt: new Date().toISOString(),
    });

    try {
      await Promise.resolve();

      const completed = jobQueue.update(job.id, {
        status: "completed",
        progress: 100,
        result: mockResult(job),
        completedAt: new Date().toISOString(),
      });

      return completed;
    } catch (error) {
      const canRetry = job.attempts + 1 < job.maxAttempts;

      return jobQueue.update(job.id, {
        status: canRetry ? "queued" : "failed",
        progress: canRetry ? 0 : job.progress,
        error:
          error instanceof Error
            ? error.message
            : "Unknown job execution error",
      });
    }
  }

  async runMany(tenantId: string, limit = 5): Promise<JobRecord[]> {
    const completed: JobRecord[] = [];

    for (let index = 0; index < limit; index += 1) {
      const job = await this.runNext(tenantId);

      if (!job) {
        break;
      }

      completed.push(job);
    }

    return completed;
  }
}

export const jobRunner = new JobRunner();