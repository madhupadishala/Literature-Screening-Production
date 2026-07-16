export type KnowledgeEmbeddingProviderName = "ollama";

export type KnowledgeEmbeddingStatus =
  | "completed"
  | "failed";

export interface KnowledgeEmbeddingProviderConfig {
  provider: KnowledgeEmbeddingProviderName;
  baseUrl: string;
  model: string;
  expectedDimensions: number;
  timeoutMs: number;
}

export interface KnowledgeEmbeddingInput {
  id: string;
  text: string;
  contentHash?: string;
}

export interface KnowledgeEmbeddingVector {
  inputId: string;
  vector: number[];
  dimensions: number;
  magnitude: number;
}

export interface KnowledgeEmbeddingBatchRequest {
  inputs: KnowledgeEmbeddingInput[];
}

export interface KnowledgeEmbeddingBatchResult {
  provider: KnowledgeEmbeddingProviderName;
  model: string;
  vectors: KnowledgeEmbeddingVector[];
  inputCount: number;
  dimensions: number;
  durationMs: number;
  generatedAt: string;
}

export interface KnowledgeEmbeddingHealth {
  healthy: boolean;
  provider: KnowledgeEmbeddingProviderName;
  model: string;
  baseUrl: string;
  expectedDimensions: number;
  actualDimensions?: number;
  checkedAt: string;
  error?: string;
}

export interface OllamaEmbedResponse {
  model: string;
  embeddings: number[][];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
}

export class KnowledgeEmbeddingError extends Error {
  constructor(
    message: string,
    readonly code:
      | "EMPTY_INPUT"
      | "PROVIDER_UNAVAILABLE"
      | "PROVIDER_TIMEOUT"
      | "INVALID_RESPONSE"
      | "DIMENSION_MISMATCH"
      | "EMBEDDING_FAILURE",
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "KnowledgeEmbeddingError";
  }
}