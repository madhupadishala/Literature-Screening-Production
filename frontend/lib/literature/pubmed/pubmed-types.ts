export interface PubMedSearchRequest {
  tenantId: string;

  query: string;

  maxResults?: number;

  includeAbstract?: boolean;

  includeMetadata?: boolean;

  includeFullTextLinks?: boolean;
}

export interface PubMedArticle {
  pmid: string;

  title: string;

  abstract?: string;

  journal?: string;

  publicationDate?: string;

  doi?: string;

  authors: string[];

  keywords?: string[];

  meshTerms?: string[];

  language?: string;

  country?: string;

  fullTextAvailable?: boolean;

  source: "PubMed";
}

export interface PubMedSearchResponse {
  tenantId: string;

  query: string;

  totalResults: number;

  retrievedResults: number;

  articles: PubMedArticle[];

  searchedAt: string;

  executionTimeMs: number;

  source: "PubMed";

  workflowStage:
    | "SEARCH_COMPLETED"
    | "ARTICLE_FETCH_COMPLETED";
}

export interface PubMedStatus {
  provider: string;

  totalSearches: number;

  lastSearchAt?: string;

  lastQuery?: string;
}