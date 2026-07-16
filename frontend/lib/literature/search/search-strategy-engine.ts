import { SearchQueryBuilder } from "./search-query-builder";
import type {
  SearchStrategyRequest,
  SearchStrategyResult,
  SearchStrategyStatus,
} from "./search-strategy-types";

function createStrategyId() {
  return `strategy_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

class SearchStrategyEngine {
  private builder = new SearchQueryBuilder();

  private history: SearchStrategyResult[] = [];

  build(request: SearchStrategyRequest): SearchStrategyResult {
    const groups = this.builder.buildGroups(request);

    const result: SearchStrategyResult = {
      id: createStrategyId(),
      strategyName: request.strategyName,
      query: this.builder.buildQuery(groups),
      groups,
      createdAt: new Date().toISOString(),
    };

    this.history.unshift(result);

    return result;
  }

  list(limit = 20) {
    return this.history.slice(0, limit);
  }

  getStatus(): SearchStrategyStatus {
    return {
      totalStrategies: this.history.length,
    };
  }
}

export const searchStrategyEngine = new SearchStrategyEngine();