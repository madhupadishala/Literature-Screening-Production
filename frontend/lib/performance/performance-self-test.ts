import { runAsyncBatch } from "./async-batch-runner";
import { ConcurrencyLimiter } from "./concurrency-limiter";
import { TTLCache } from "./ttl-cache";

export interface PerformanceSelfTestResult {
  passed: boolean;
  checkedAt: string;
  checks: Array<{
    name: string;
    passed: boolean;
    details: Record<string, unknown>;
  }>;
}

export async function runPerformanceSelfTest(): Promise<PerformanceSelfTestResult> {
  const limiter = new ConcurrencyLimiter({
    concurrency: 2,
  });

  const limiterResults = await Promise.all([
    limiter.run(async () => "one"),
    limiter.run(async () => "two"),
    limiter.run(async () => "three"),
  ]);

  const batch = await runAsyncBatch({
    items: [1, 2, 3, 4],
    concurrency: 2,
    worker: async (item) => item * 2,
  });

  const cache = new TTLCache<string, number>({
    defaultTtlMs: 60_000,
    maxEntries: 2,
  });

  cache.set("alpha", 1);

  const cacheValue = cache.get("alpha");

  const cacheStatus = cache.getStatus();

  const checks: PerformanceSelfTestResult["checks"] = [
    {
      name: "concurrency_limiter",
      passed:
        limiterResults.join(",") ===
        "one,two,three",
      details: {
        results: [...limiterResults],
        status: {
          concurrency:
            limiter.getStatus().concurrency,
          activeCount:
            limiter.getStatus().activeCount,
          queuedCount:
            limiter.getStatus().queuedCount,
        },
      },
    },

    {
      name: "async_batch_runner",
      passed:
        batch.total === 4 &&
        batch.succeeded === 4 &&
        batch.failed === 0,
      details: {
        total: batch.total,
        succeeded: batch.succeeded,
        failed: batch.failed,
        durationMs: batch.durationMs,
      },
    },

    {
      name: "ttl_cache",
      passed:
        cacheValue === 1 &&
        cacheStatus.hits === 1,
      details: {
        size: cacheStatus.size,
        maxEntries: cacheStatus.maxEntries,
        defaultTtlMs:
          cacheStatus.defaultTtlMs,
        hits: cacheStatus.hits,
        misses: cacheStatus.misses,
        hitRate: cacheStatus.hitRate,
        evictions: cacheStatus.evictions,
      },
    },
  ];

  return {
    passed: checks.every(
      (check) => check.passed,
    ),
    checkedAt: new Date().toISOString(),
    checks,
  };
}