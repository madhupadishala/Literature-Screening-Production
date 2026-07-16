export interface QdrantCollectionConfig {
  name: string;
  vectorSize: number;
  distance: "Cosine" | "Dot" | "Euclid" | "Manhattan";
}

export interface KnowledgeVectorPayload {
  chunkId: string;

  documentId: string;
  documentName: string;
  documentType: string;

  source: string;

  regulation?: string;

  version?: string;

  effectiveDate?: string;

  tenantId: string;

  category: string;

  section?: string;

  subsection?: string;

  page?: number;

  chunkNumber: number;

  totalChunks: number;

  language: string;

  tags: string[];

  checksum: string;

  confidence?: number;

  createdAt: string;

  updatedAt: string;

  text: string;
}

export interface KnowledgeVectorPoint {
  id: string;

  vector: number[];

  payload: KnowledgeVectorPayload;
}

export interface KnowledgeSearchRequest {
  queryEmbedding: number[];

  tenantId: string;

  limit: number;

  scoreThreshold?: number;

  category?: string;

  regulation?: string;

  tags?: string[];
}

export interface KnowledgeSearchResult {
  id: string;

  score: number;

  payload: KnowledgeVectorPayload;
}

export interface VectorCollectionStatistics {
  collectionName: string;

  vectors: number;

  indexedVectors: number;

  status: string;
}

export interface VectorHealthStatus {
  healthy: boolean;

  qdrantConnected: boolean;

  collectionExists: boolean;

  collectionName: string;

  vectorsIndexed: number;

  embeddingModel: string;
}