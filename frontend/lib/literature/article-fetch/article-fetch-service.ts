import { articleFetchClient } from "./article-fetch-client";

import type {
  ArticleFetchRequest,
  ArticleFetchResponse,
  ArticleFetchStatus,
} from "./article-fetch-types";

class ArticleFetchService {
  private history: ArticleFetchResponse[] = [];

  async fetch(request: ArticleFetchRequest) {
    const response = await articleFetchClient.fetchArticle(request);

    this.history.unshift(response);

    return response;
  }

  list(limit = 20) {
    return this.history.slice(0, limit);
  }

  getStatus(): ArticleFetchStatus {
    return {
      totalArticlesFetched: this.history.length,
    };
  }
}

export const articleFetchService = new ArticleFetchService();