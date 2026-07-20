import { articleFetchService } from "@/lib/literature/article-fetch/article-fetch-service";

import { pubMedClient } from "./pubmed-client";

import type {
  PubMedArticle,
  PubMedSearchRequest,
  PubMedSearchResponse,
  PubMedStatus,
} from "./pubmed-types";

export interface PubMedWorkflowResult extends PubMedSearchResponse {
  fetchedArticles: unknown[];
  workflowStage: "SEARCH_COMPLETED";
}

class PubMedService {
  private history: PubMedWorkflowResult[] = [];

  async search(
    request: PubMedSearchRequest,
  ): Promise<PubMedWorkflowResult> {
    // Execute PubMed search
    const response = await pubMedClient.search(request);

    // Automatically fetch every returned article
    const fetchedArticles = await Promise.all(
      response.articles.map(async (article: PubMedArticle) => {
        try {
          return await articleFetchService.fetch({
            tenantId: request.tenantId,
            pmid: article.pmid,
          });
        } catch (error) {
          console.error(
            `Article Fetch failed for PMID ${article.pmid}`,
            error,
          );

          return {
            pmid: article.pmid,
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Unknown Article Fetch error",
          };
        }
      }),
    );

    const workflowResult: PubMedWorkflowResult = {
      ...response,
      fetchedArticles,
      workflowStage: "SEARCH_COMPLETED",
    };

    this.history.unshift(workflowResult);

    return workflowResult;
  }

  list(limit = 20): PubMedWorkflowResult[] {
    return this.history.slice(0, limit);
  }

  clear(): void {
    this.history = [];
  }

  getStatus(): PubMedStatus {
    return {
      provider: "PubMed",
      totalSearches: this.history.length,
    };
  }
}

export const pubMedService = new PubMedService();