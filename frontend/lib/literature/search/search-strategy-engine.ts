import { pubMedService } from "@/lib/literature/pubmed/pubmed-service";

import { SearchQueryBuilder } from "./search-query-builder";

import type {
  SearchStrategyRequest,
  SearchStrategyResult,
  SearchStrategyStatus,
} from "./search-strategy-types";

export interface SearchWorkflowResult
  extends SearchStrategyResult {
  searchExecuted: boolean;
  workflowStage: "SEARCH_STRATEGY_COMPLETED";
  pubmedResult?: unknown;
}

function createStrategyId(): string {
  return `strategy_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

class SearchStrategyEngine {
  private builder = new SearchQueryBuilder();

  private history: SearchWorkflowResult[] = [];

  async build(
    request: SearchStrategyRequest,
  ): Promise<SearchWorkflowResult> {
    // Step 1 — Build logical search groups
    const groups =
      this.builder.buildGroups(request);

    // Step 2 — Build PubMed query
    const query =
      this.builder.buildQuery(groups);

    // Step 3 — Store strategy
    const result: SearchWorkflowResult = {
      id: createStrategyId(),

      strategyName:
        request.strategyName,

      query,

      groups,

      createdAt:
        new Date().toISOString(),

      searchExecuted: false,

      workflowStage:
        "SEARCH_STRATEGY_COMPLETED",
    };

    // Step 4 — Execute PubMed automatically
    try {
      const pubmedResult =
        await pubMedService.search({
          tenantId: request.tenantId,
          query,
        });

      result.searchExecuted = true;
      result.pubmedResult = pubmedResult;
    } catch (error) {
      console.error(
        "PubMed Search Execution Failed",
        error,
      );
    }

    this.history.unshift(result);

    return result;
  }

  list(
    limit = 20,
  ): SearchWorkflowResult[] {
    return this.history.slice(0, limit);
  }

  clear(): void {
    this.history = [];
  }

  getStatus(): SearchStrategyStatus {
    return {
      totalStrategies:
        this.history.length,
    };
  }
}

export const searchStrategyEngine =
  new SearchStrategyEngine();