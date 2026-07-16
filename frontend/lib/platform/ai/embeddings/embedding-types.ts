export type EmbeddingProvider =
  | "openai"
  | "azure_openai"
  | "gemini"
  | "voyage"
  | "local"
  | "mock";

export type EmbeddingStatus = "completed" | "failed";

export interface EmbeddingModelConfig {
  provider: EmbeddingProvider;
  model: string;
  dimensions: number;
}

export interface ChunkMetadata {
  tenantId: string;
  sourceType?: string;
  sourceId?: string;
  documentId?: string;
  chunkIndex?: number;
  tags?: string[];
  extra?: Record<string, unknown>;
}

export interface EmbeddingRequest {
  tenantId: string;
  text: string;
  modelConfig?: Partial<EmbeddingModelConfig>;
  metadata?: Omit<ChunkMetadata, "tenantId">;
}

export interface EmbeddingVector {
  values: number[];
  dimensions: number;
}

export interface EmbeddingResponse {
  id: string;
  status: EmbeddingStatus;
  provider: EmbeddingProvider;
  model: string;
  vector: EmbeddingVector;
  textHash: string;
  inputCharacters: number;
  latencyMs: number;
  createdAt: string;
  metadata: ChunkMetadata;
}

export interface EmbeddingProviderAdapter {
  provider: EmbeddingProvider;

  embed(
    request: EmbeddingRequest,
    config: EmbeddingModelConfig,
  ): Promise<EmbeddingResponse>;
}

export interface EmbeddingEngineStatus {
  providers: EmbeddingProvider[];
  defaultProvider: EmbeddingProvider;
  defaultModel: string;
  defaultDimensions: number;
  totalEmbeddings: number;
  averageLatencyMs: number;
}