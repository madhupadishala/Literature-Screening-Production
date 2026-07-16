export interface PubMedSearchRequest {
  tenantId: string;
  query: string;
  maxResults?: number;
}

export interface PubMedArticle {
  pmid: string;
  title: string;
  journal?: string;
  publicationDate?: string;
  authors: string[];
}

export interface PubMedSearchResponse {
  query: string;
  totalResults: number;
  articles: PubMedArticle[];
  searchedAt: string;
}

export interface PubMedStatus {
  provider: string;
  totalSearches: number;
}