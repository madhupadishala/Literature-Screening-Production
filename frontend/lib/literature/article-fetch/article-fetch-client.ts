import type {
  ArticleFetchRequest,
  ArticleFetchResponse,
} from "./article-fetch-types";

export interface ArticleEvidenceManifest {
  evidencePackageId: string;
  tenantId: string;
  pmid: string;
  source: "PubMed";
  retrievalStatus: "SUCCESS";
  createdAt: string;
}

class ArticleFetchClient {
  async fetchArticle(
    request: ArticleFetchRequest,
  ): Promise<ArticleFetchResponse> {
    const now = new Date().toISOString();

    const evidenceManifest: ArticleEvidenceManifest = {
      evidencePackageId: `${request.tenantId}_${request.pmid}`,
      tenantId: request.tenantId,
      pmid: request.pmid,
      source: "PubMed",
      retrievalStatus: "SUCCESS",
      createdAt: now,
    };

    return {
      metadata: {
        pmid: request.pmid,
        title: `Mock Article ${request.pmid}`,
        abstract:
          "This is a mock abstract generated during Production Alpha.",
        journal: "ClinixAI Demo Journal",
        publicationDate: now.split("T")[0],
        doi: `10.0000/${request.pmid}`,
        authors: ["ClinixAI"],
        fullTextAvailable: true,
      },

      fetchedAt: now,

      evidenceManifest,
    } as ArticleFetchResponse;
  }
}

export const articleFetchClient =
  new ArticleFetchClient();