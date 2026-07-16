import "server-only";

import type {
  KnowledgeEmbeddingBatchRequest,
  KnowledgeEmbeddingBatchResult,
  KnowledgeEmbeddingHealth,
  KnowledgeEmbeddingProviderConfig,
} from "./embedding-types";

export interface KnowledgeEmbeddingProvider {
  readonly name: KnowledgeEmbeddingProviderConfig["provider"];
  readonly model: string;
  readonly dimensions: number;

  embed(
    request: KnowledgeEmbeddingBatchRequest,
  ): Promise<KnowledgeEmbeddingBatchResult>;

  healthCheck(): Promise<KnowledgeEmbeddingHealth>;
}