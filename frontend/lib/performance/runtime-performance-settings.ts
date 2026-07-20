export interface RuntimePerformanceSettings {
  articleConcurrency: number;
  workflowCacheTtlMs: number;
  workflowCacheMaxEntries: number;
  maximumWorkflowResults: number;
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  maximum: number,
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, maximum);
}

export function getRuntimePerformanceSettings(): RuntimePerformanceSettings {
  return {
    articleConcurrency: parsePositiveInteger(
      process.env.LITERATURE_ARTICLE_CONCURRENCY,
      4,
      20,
    ),
    workflowCacheTtlMs: parsePositiveInteger(
      process.env.LITERATURE_WORKFLOW_CACHE_TTL_MS,
      300_000,
      86_400_000,
    ),
    workflowCacheMaxEntries: parsePositiveInteger(
      process.env.LITERATURE_WORKFLOW_CACHE_MAX_ENTRIES,
      100,
      5_000,
    ),
    maximumWorkflowResults: parsePositiveInteger(
      process.env.LITERATURE_MAX_WORKFLOW_RESULTS,
      500,
      10_000,
    ),
  };
}
