export type VectorProvider =
  | "memory"
  | "pgvector"
  | "pinecone"
  | "qdrant"
  | "milvus"
  | "weaviate"
  | "azure_ai_search";

export interface VectorMetadata {
  tenantId: string;
  documentId: string;
  chunkId: string;
  sourceType?: string;
  tags?: string[];
  extra?: Record<string, unknown>;
}

export interface VectorRecord {
  id: string;
  vector: number[];
  metadata: VectorMetadata;
  createdAt: string;
}

export interface VectorSearchRequest {
  tenantId: string;
  queryVector: number[];
  topK?: number;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata: VectorMetadata;
}

export interface VectorStoreStatus {
  provider: VectorProvider;
  totalVectors: number;
  namespaces: number;
}