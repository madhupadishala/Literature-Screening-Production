export interface ArticleFetchRequest {
  tenantId: string;

  pmid: string;

  source?: "PubMed";
}

export interface ArticleMetadata {
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

  fullTextAvailable: boolean;

  fullTextPdf?: string;

  fullTextXml?: string;
}

export interface EvidenceManifest {
  evidencePackageId: string;

  tenantId: string;

  pmid: string;

  source: "PubMed";

  retrievalStatus:
    | "SUCCESS"
    | "PARTIAL"
    | "FAILED";

  createdAt: string;
}

export interface ArticleFetchResponse {
  metadata: ArticleMetadata;

  evidenceManifest?: EvidenceManifest;

  fetchedAt: string;

  workflowStage:
    | "ARTICLE_FETCH_COMPLETED"
    | "EVIDENCE_PACKAGE_CREATED";

  success: boolean;

  warnings?: string[];

  errors?: string[];
}

export interface ArticleFetchStatus {
  totalArticlesFetched: number;

  successfulFetches: number;

  failedFetches: number;

  lastFetchAt?: string;
}