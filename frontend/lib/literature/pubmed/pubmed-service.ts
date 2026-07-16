import { pubMedClient } from "./pubmed-client";

import type {
  PubMedSearchRequest,
  PubMedSearchResponse,
  PubMedStatus,
} from "./pubmed-types";

class PubMedService {
  private history: PubMedSearchResponse[] = [];

  async search(request: PubMedSearchRequest) {
    const response = await pubMedClient.search(request);

    this.history.unshift(response);

    return response;
  }

  list(limit = 20) {
    return this.history.slice(0, limit);
  }

  getStatus(): PubMedStatus {
    return {
      provider: "PubMed",
      totalSearches: this.history.length,
    };
  }
}

export const pubMedService = new PubMedService();