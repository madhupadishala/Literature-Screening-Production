import type {
  PubMedArticle,
  PubMedSearchRequest,
  PubMedSearchResponse,
} from "./pubmed-types";

class PubMedClient {
  async search(
    request: PubMedSearchRequest,
  ): Promise<PubMedSearchResponse> {
    const mockArticle: PubMedArticle = {
      pmid: "00000001",
      title: `Mock result for: ${request.query}`,
      journal: "ClinixAI Demo Journal",
      publicationDate: new Date().toISOString().split("T")[0],
      authors: ["ClinixAI"],
    };

    return {
      query: request.query,
      totalResults: 1,
      articles: [mockArticle],
      searchedAt: new Date().toISOString(),
    };
  }
}

export const pubMedClient = new PubMedClient();