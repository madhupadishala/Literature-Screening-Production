export interface ArticleFetchRequest {
  tenantId: string;
  pmid: string;
}

export interface ArticleMetadata {
  pmid: string;
  title: string;
  abstract?: string;
  journal?: string;
  publicationDate?: string;
  doi?: string;
  authors: string[];
  fullTextAvailable: boolean;
}

export interface ArticleFetchResponse {
  metadata: ArticleMetadata;
  fetchedAt: string;
}

export interface ArticleFetchStatus {
  totalArticlesFetched: number;
}