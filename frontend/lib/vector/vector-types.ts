export type VectorSourceType =
  | "knowledge_base"
  | "product_master"
  | "sop"
  | "calendar"
  | "evidence_package"
  | "prompt_configuration"
  | "manual_upload";

export type VectorEmbeddingProvider =
  | "mock"
  | "openai"
  | "azure_openai"
  | "local";

export type VectorDocumentStatus = "active" | "archived" | "deleted";

export type VectorSearchMode = "semantic" | "keyword" | "hybrid";

export interface VectorMetadata {
  tenantId: string;
  sourceType: VectorSourceType;
  sourceId: string;
  sourceName?: string;
  versionId?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt?: string;
  tags?: string[];
  status?: VectorDocumentStatus;
  regulatoryContext?: {
    productName?: string;
    country?: string;
    processArea?: string;
    caseType?: string;
  };
}

export interface VectorDocument {
  id: string;
  tenantId: string;
  content: string;
  normalizedContent: string;
  embedding: number[];
  metadata: VectorMetadata;
}

export interface VectorUpsertInput {
  tenantId: string;
  content: string;
  sourceType: VectorSourceType;
  sourceId: string;
  sourceName?: string;
  versionId?: string;
  createdBy?: string;
  tags?: string[];
  regulatoryContext?: VectorMetadata["regulatoryContext"];
}

export interface VectorSearchRequest {
  tenantId: string;
  query: string;
  mode?: VectorSearchMode;
  sourceTypes?: VectorSourceType[];
  topK?: number;
  minScore?: number;
  tags?: string[];
}

export interface VectorSearchResult {
  document: VectorDocument;
  score: number;
  matchedBy: VectorSearchMode;
  explanation: string;
}

export interface VectorSearchResponse {
  tenantId: string;
  query: string;
  mode: VectorSearchMode;
  results: VectorSearchResult[];
  totalResults: number;
  generatedAt: string;
}

export interface EmbeddingRequest {
  text: string;
  tenantId?: string;
  provider?: VectorEmbeddingProvider;
}

export interface EmbeddingResponse {
  embedding: number[];
  provider: VectorEmbeddingProvider;
  dimensions: number;
  generatedAt: string;
}