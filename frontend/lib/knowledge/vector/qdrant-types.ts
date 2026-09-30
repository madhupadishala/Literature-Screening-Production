export interface QdrantCollectionConfig {
  name: string;
  vectorSize: number;
  distance: "Cosine" | "Dot" | "Euclid" | "Manhattan";
}

export type RegulatoryLifecycleStatus =
  | "DRAFT"
  | "FUTURE_EFFECTIVE"
  | "EFFECTIVE"
  | "SUPERSEDED"
  | "RETIRED"
  | "REJECTED";

export type RegulatoryApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED";

export interface KnowledgeVectorPayload {
  chunkId: string;

  documentId: string;
  documentName: string;
  documentType: string;

  source: string;

  regulation?: string;
  authority?: string;
  regulatorySourceId?: string;
  canonicalSourceUrl?: string;
  jurisdiction?: string;

  version?: string;
  publicationDate?: string;
  effectiveDate?: string;
  lifecycleStatus?: RegulatoryLifecycleStatus;
  approvalStatus?: RegulatoryApprovalStatus;
  supersedesSourceId?: string;
  supersededBySourceId?: string;
  supersededAt?: string;

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

  /**
   * Regulatory retrieval is governance-filtered whenever category is
   * regulatory_guidance or regulation is supplied. Historical retrieval must
   * be explicit and date-scoped.
   */
  asOf?: string;
  includeSuperseded?: boolean;

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