import { duplicateService } from "@/lib/literature/duplicates/duplicate-service";
import { pubMedService } from "@/lib/literature/pubmed/pubmed-service";
import { screeningService } from "@/lib/literature/screening/screening-service";
import { runAsyncBatch } from "@/lib/performance/async-batch-runner";
import {
  getPerformanceSummary,
  recordPerformanceMetric,
} from "@/lib/performance/performance-metrics";
import { getRuntimePerformanceSettings } from "@/lib/performance/runtime-performance-settings";
import { TTLCache } from "@/lib/performance/ttl-cache";

import type { ArticleFetchWorkflowResponse } from "@/lib/literature/article-fetch/article-fetch-service";

import type {
  LiteratureWorkflowArticle,
  LiteratureWorkflowRequest,
  LiteratureWorkflowResponse,
  LiteratureWorkflowStatus,
} from "./literature-workflow-types";

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isArticleFetchWorkflowResponse(
  value: unknown,
): value is ArticleFetchWorkflowResponse {
  if (!isRecord(value)) {
    return false;
  }

  const metadata = value.metadata;

  return (
    isRecord(metadata) &&
    typeof metadata.pmid === "string" &&
    metadata.pmid.trim().length > 0
  );
}

function normalizeStringArray(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is string =>
        typeof item === "string",
    )
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function findFetchedArticle(
  fetchedArticles: unknown,
  pmid: string,
): ArticleFetchWorkflowResponse | undefined {
  if (!Array.isArray(fetchedArticles)) {
    return undefined;
  }

  return fetchedArticles.find(
    (
      item: unknown,
    ): item is ArticleFetchWorkflowResponse =>
      isArticleFetchWorkflowResponse(item) &&
      item.metadata.pmid === pmid,
  );
}

function buildWorkflowCacheKey(
  request: LiteratureWorkflowRequest,
): string {
  return JSON.stringify({
    tenantId: request.tenantId.trim(),
    query: request.query.trim(),
    maxResults: request.maxResults ?? null,
  });
}

class LiteratureWorkflowService {
  private history: LiteratureWorkflowResponse[] = [];

  private readonly workflowCache: TTLCache<
    string,
    LiteratureWorkflowResponse
  >;

  constructor() {
    const settings = getRuntimePerformanceSettings();

    this.workflowCache = new TTLCache({
      defaultTtlMs: settings.workflowCacheTtlMs,
      maxEntries: settings.workflowCacheMaxEntries,
    });
  }

  async execute(
    request: LiteratureWorkflowRequest,
  ): Promise<LiteratureWorkflowResponse> {
    const workflowStartedAt = Date.now();
    const startedAt = new Date(workflowStartedAt).toISOString();
    const settings = getRuntimePerformanceSettings();

    if (!request.tenantId?.trim()) {
      throw new Error("tenantId is required.");
    }

    if (!request.query?.trim()) {
      throw new Error("query is required.");
    }

    const requestedMaxResults = request.maxResults ?? 20;
    const boundedMaxResults = Math.min(
      Math.max(1, Math.floor(requestedMaxResults)),
      settings.maximumWorkflowResults,
    );

    const normalizedRequest: LiteratureWorkflowRequest = {
      ...request,
      tenantId: request.tenantId.trim(),
      query: request.query.trim(),
      maxResults: boundedMaxResults,
    };

    const cacheKey = buildWorkflowCacheKey(normalizedRequest);
    const cachedWorkflow = this.workflowCache.get(cacheKey);

    if (cachedWorkflow) {
      recordPerformanceMetric({
        operation: "cache",
        success: true,
        durationMs: Date.now() - workflowStartedAt,
        tenantId: normalizedRequest.tenantId,
        itemCount: cachedWorkflow.articles.length,
        metadata: {
          cacheHit: true,
          query: normalizedRequest.query,
        },
      });

      return cachedWorkflow;
    }

    try {
      const search = await pubMedService.search({
        tenantId: normalizedRequest.tenantId,
        query: normalizedRequest.query,
        maxResults: normalizedRequest.maxResults,
      });

      const batchResult = await runAsyncBatch({
        items: search.articles,
        concurrency: settings.articleConcurrency,
        worker: async (
          article,
        ): Promise<LiteratureWorkflowArticle> => {
          const articleStartedAt = Date.now();
          const articleId = article.pmid;

          const duplicateStartedAt = Date.now();
          const duplicateResult =
            await duplicateService.check({
              tenantId: normalizedRequest.tenantId,
              article: {
                id: articleId,
                articleId,
                pmid: article.pmid,
                doi: article.doi,
                title: article.title,
                source: "PubMed",
              },
              existingArticles: [],
            });

          recordPerformanceMetric({
            operation: "duplicate_check",
            success: true,
            durationMs: Date.now() - duplicateStartedAt,
            tenantId: normalizedRequest.tenantId,
            itemCount: 1,
            metadata: {
              pmid: article.pmid,
            },
          });

          const screeningStartedAt = Date.now();
          const screeningResult =
            await screeningService.screenArticle({
              tenantId: normalizedRequest.tenantId,
              article: {
                pmid: article.pmid,
                title: article.title,
                abstract: article.abstract ?? "",
                authors: normalizeStringArray(
                  article.authors,
                ),
                doi: article.doi,
                journal: article.journal,
              },
            });

          recordPerformanceMetric({
            operation: "screening",
            success: true,
            durationMs: Date.now() - screeningStartedAt,
            tenantId: normalizedRequest.tenantId,
            itemCount: 1,
            metadata: {
              pmid: article.pmid,
              decision: screeningResult.decision,
            },
          });

          const fetchResult = findFetchedArticle(
            search.fetchedArticles,
            article.pmid,
          );

          const workflowArticle: LiteratureWorkflowArticle = {
            searchResult: article,
            fetchResult,
            duplicateResult,
            screeningResult,
          };

          recordPerformanceMetric({
            operation: "article_processing",
            success: true,
            durationMs: Date.now() - articleStartedAt,
            tenantId: normalizedRequest.tenantId,
            itemCount: 1,
            concurrency: settings.articleConcurrency,
            metadata: {
              pmid: article.pmid,
            },
          });

          return workflowArticle;
        },
      });

      const articles = batchResult.results
        .filter(
          (
            result,
          ): result is Extract<
            (typeof batchResult.results)[number],
            { status: "fulfilled" }
          > => result.status === "fulfilled",
        )
        .sort(
          (left, right) =>
            left.index - right.index,
        )
        .map((result) => result.value);

      const completedAt = new Date().toISOString();

      const workflow: LiteratureWorkflowResponse = {
        tenantId: normalizedRequest.tenantId,
        query: normalizedRequest.query,
        search,
        articles,
        workflowStage: "WORKFLOW_COMPLETED",
        startedAt,
        completedAt,
      };

      this.history.unshift(workflow);

      if (this.history.length > 100) {
        this.history.length = 100;
      }

      this.workflowCache.set(cacheKey, workflow);

      recordPerformanceMetric({
        operation: "batch",
        success: batchResult.failed === 0,
        durationMs: batchResult.durationMs,
        tenantId: normalizedRequest.tenantId,
        itemCount: batchResult.total,
        concurrency: settings.articleConcurrency,
        metadata: {
          succeeded: batchResult.succeeded,
          failed: batchResult.failed,
        },
      });

      recordPerformanceMetric({
        operation: "literature_workflow",
        success: true,
        durationMs: Date.now() - workflowStartedAt,
        tenantId: normalizedRequest.tenantId,
        itemCount: articles.length,
        concurrency: settings.articleConcurrency,
        metadata: {
          requestedResults: boundedMaxResults,
          searchResults: search.articles.length,
          processedResults: articles.length,
          failedResults: batchResult.failed,
          cacheHit: false,
        },
      });

      return workflow;
    } catch (error) {
      recordPerformanceMetric({
        operation: "literature_workflow",
        success: false,
        durationMs: Date.now() - workflowStartedAt,
        tenantId: normalizedRequest.tenantId,
        itemCount: 0,
        concurrency: settings.articleConcurrency,
        metadata: {
          query: normalizedRequest.query,
          error:
            error instanceof Error
              ? error.message
              : "Unknown workflow error.",
        },
      });

      throw error;
    }
  }

  list(
    limit = 20,
  ): LiteratureWorkflowResponse[] {
    const safeLimit =
      Number.isFinite(limit) && limit > 0
        ? Math.min(Math.floor(limit), 100)
        : 20;

    return this.history.slice(0, safeLimit);
  }

  clear(): void {
    this.history = [];
    this.workflowCache.clear();
  }

  getStatus(): LiteratureWorkflowStatus {
    return {
      totalRuns: this.history.length,
      completedRuns: this.history.length,
      failedRuns:
        getPerformanceSummary().byOperation[
          "literature_workflow"
        ] === undefined
          ? 0
          : getPerformanceSummary().failedOperations,
      lastRunAt:
        this.history[0]?.completedAt,
    };
  }

  getPerformanceStatus() {
    return {
      settings: getRuntimePerformanceSettings(),
      cache: this.workflowCache.getStatus(),
      metrics: getPerformanceSummary(),
    };
  }
}

export const literatureWorkflowService =
  new LiteratureWorkflowService();
