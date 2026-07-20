import type {
  PubMedArticle,
  PubMedSearchRequest,
  PubMedSearchResponse,
} from "./pubmed-types";

class PubMedClient {
  async search(
    request: PubMedSearchRequest,
  ): Promise<PubMedSearchResponse> {
    const startedAt = Date.now();

    const mockArticle: PubMedArticle = {
      pmid: "00000001",

      title: `Mock result for: ${request.query}`,

      abstract:
        request.includeAbstract
          ? "Mock PubMed abstract generated for development."
          : undefined,

      journal: "ClinixAI Demo Journal",

      publicationDate:
        new Date()
          .toISOString()
          .split("T")[0],

      doi: "10.0000/clinixai.demo",

      authors: ["ClinixAI"],

      keywords: [],

      meshTerms: [],

      language: "English",

      country: "Unknown",

      fullTextAvailable: false,

      source: "PubMed",
    };

    return {
      tenantId: request.tenantId,

      query: request.query,

      totalResults: 1,

      retrievedResults: 1,

      articles: [mockArticle],

      searchedAt: new Date().toISOString(),

      executionTimeMs:
        Date.now() - startedAt,

      source: "PubMed",

      workflowStage:
        "SEARCH_COMPLETED",
    };
  }
}

export const pubMedClient =
  new PubMedClient();