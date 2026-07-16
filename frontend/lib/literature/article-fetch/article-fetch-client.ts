import type {
  ArticleFetchRequest,
  ArticleFetchResponse,
} from "./article-fetch-types";

class ArticleFetchClient {
  async fetchArticle(
    request: ArticleFetchRequest,
  ): Promise<ArticleFetchResponse> {
    return {
      metadata: {
        pmid: request.pmid,
        title: `Mock Article ${request.pmid}`,
        abstract:
          "This is a mock abstract generated during Production Alpha.",
        journal: "ClinixAI Demo Journal",
        publicationDate: new Date().toISOString().split("T")[0],
        doi: "10.0000/mock.doi",
        authors: ["ClinixAI"],
        fullTextAvailable: true,
      },
      fetchedAt: new Date().toISOString(),
    };
  }
}

export const articleFetchClient = new ArticleFetchClient();