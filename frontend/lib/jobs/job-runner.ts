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
  async runNext(tenantId: string): Promise<JobRecord | undefined> {
    const job = await jobQueue.claimNext(tenantId);

    if (!job) {
      return undefined;
    }

    try {
      await Promise.resolve();
      return await jobQueue.complete(tenantId, job.id, mockResult(job));
    } catch (error) {
      return await jobQueue.fail(tenantId, job.id,
        error instanceof Error ? error.message : "Unknown job execution error");
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
