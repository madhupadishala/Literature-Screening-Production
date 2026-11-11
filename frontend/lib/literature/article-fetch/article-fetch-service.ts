import { articleFetchClient } from "./article-fetch-client";

import type {
  ArticleFetchRequest,
  ArticleFetchResponse,
  ArticleFetchStatus,
} from "./article-fetch-types";

export interface ArticleFetchWorkflowResponse
  extends ArticleFetchResponse {
  tenantId: string;
  workflowStage: "ARTICLE_FETCH_COMPLETED";
}

class ArticleFetchService {
  private history: ArticleFetchWorkflowResponse[] = [];

  async fetch(
    request: ArticleFetchRequest,
  ): Promise<ArticleFetchWorkflowResponse> {
    const response =
      await articleFetchClient.fetchArticle(request);

    const workflowResponse: ArticleFetchWorkflowResponse =
      {
        tenantId: request.tenantId,
        ...response,
        workflowStage: "ARTICLE_FETCH_COMPLETED",
      };

    this.history.unshift(workflowResponse);

    return workflowResponse;
  }

  listForTenant(
    tenantId: string,
    limit = 20,
  ): ArticleFetchWorkflowResponse[] {
    return this.history
      .filter((item) => item.tenantId === tenantId)
      .slice(0, limit);
  }

  clear(): void {
    this.history = [];
  }

  getStatus(): ArticleFetchStatus {
    const successfulFetches =
      this.history.filter(
        (item) => item.success,
      ).length;

    const failedFetches =
      this.history.length -
      successfulFetches;

    return {
      totalArticlesFetched:
        this.history.length,

      successfulFetches,

      failedFetches,

      lastFetchAt:
        this.history[0]?.fetchedAt,
    };
  }
}

export const articleFetchService =
  new ArticleFetchService();