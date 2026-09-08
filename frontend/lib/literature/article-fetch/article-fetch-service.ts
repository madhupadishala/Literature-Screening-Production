import { evidencePackageGenerator } from "@/lib/evidence/evidence-package-generator";

import { articleFetchClient } from "./article-fetch-client";

import type {
  ArticleFetchRequest,
  ArticleFetchResponse,
  ArticleFetchStatus,
} from "./article-fetch-types";

export interface ArticleFetchWorkflowResponse
  extends ArticleFetchResponse {
  tenantId: string;
  evidencePackageId?: string;
  workflowStage: "ARTICLE_FETCH_COMPLETED";
}

class ArticleFetchService {
  private history: ArticleFetchWorkflowResponse[] = [];

  async fetch(
    request: ArticleFetchRequest,
  ): Promise<ArticleFetchWorkflowResponse> {
    const response =
      await articleFetchClient.fetchArticle(request);

    let evidencePackageId: string | undefined;

    try {
      const metadata = response.metadata;

      const evidencePackage =
        await evidencePackageGenerator.build({
          tenantId: request.tenantId,

          articleId: metadata.pmid,

          article: {
            title: metadata.title,
            abstract: metadata.abstract,
            journal: metadata.journal,
            pmid: metadata.pmid,
            doi: metadata.doi,
            publicationDate: metadata.publicationDate,
            authors: metadata.authors ?? [],
            country: metadata.country,
            hasFullText: metadata.fullTextAvailable,
          },

          ragContext: {
            tenantId: request.tenantId,

            query: `PMID:${request.pmid}`,

            summary:
              "No RAG context generated during Article Fetch.",

            chunks: [],

            sourceBreakdown: {},

            warnings: [
              "RAG retrieval has not yet been executed.",
            ],

            generatedAt:
              new Date().toISOString(),
          },

          aiExecution: {
            agentName:
              "Article Fetch Engine",

            agentVersion: "1.0.0",

            modelName: "N/A",

            modelVersion: "N/A",

            promptVersion: "N/A",

            confidence: 1,

            executedAt:
              new Date().toISOString(),
          },

          aiResult: null,

          generatedBy:
            "ClinixAI Literature Search Engine",
        });

      evidencePackageId =
        evidencePackage.metadata.packageId;
    } catch (error) {
      console.error(
        "Evidence Package generation failed",
        error,
      );
    }

    const workflowResponse: ArticleFetchWorkflowResponse =
      {
        ...response,

        tenantId: request.tenantId,

        evidencePackageId,

        workflowStage:
          "ARTICLE_FETCH_COMPLETED",
      };

    this.history.unshift(workflowResponse);

    return workflowResponse;
  }

  list(
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

  getStatus(tenantId: string): ArticleFetchStatus {
    const tenantHistory = this.history.filter(
      (item) => item.tenantId === tenantId,
    );
    const successfulFetches =
      tenantHistory.filter(
        (item) => item.success,
      ).length;

    const failedFetches =
      tenantHistory.length -
      successfulFetches;

    return {
      totalArticlesFetched:
        tenantHistory.length,

      successfulFetches,

      failedFetches,

      lastFetchAt:
        tenantHistory[0]?.fetchedAt,
    };
  }
}

export const articleFetchService =
  new ArticleFetchService();
