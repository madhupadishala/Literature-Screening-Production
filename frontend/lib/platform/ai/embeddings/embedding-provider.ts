import type {
  EmbeddingModelConfig,
  EmbeddingProvider,
  EmbeddingProviderAdapter,
  EmbeddingRequest,
  EmbeddingResponse,
} from "./embedding-types";

function createEmbeddingId() {
  return `emb_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function simpleHash(text: string) {
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash).toString(16);
}

function createMockVector(text: string, dimensions: number) {
  const seed = simpleHash(text);
  const values: number[] = [];

  for (let index = 0; index < dimensions; index += 1) {
    const charCode = seed.charCodeAt(index % seed.length);
    values.push(Number(((charCode % 100) / 100).toFixed(4)));
  }

  return values;
}

class MockEmbeddingProvider implements EmbeddingProviderAdapter {
  provider: EmbeddingProvider;

  constructor(provider: EmbeddingProvider) {
    this.provider = provider;
  }

  async embed(
    request: EmbeddingRequest,
    config: EmbeddingModelConfig,
  ): Promise<EmbeddingResponse> {
    const startedAt = Date.now();
    const vector = createMockVector(request.text, config.dimensions);

    return {
      id: createEmbeddingId(),
      status: "completed",
      provider: this.provider,
      model: config.model,
      vector: {
        values: vector,
        dimensions: config.dimensions,
      },
      textHash: simpleHash(request.text),
      inputCharacters: request.text.length,
      latencyMs: Date.now() - startedAt,
      createdAt: new Date().toISOString(),
      metadata: {
        tenantId: request.tenantId,
        ...request.metadata,
      },
    };
  }
}

class EmbeddingProviderRegistry {
  private providers = new Map<EmbeddingProvider, EmbeddingProviderAdapter>();

  constructor() {
    this.register(new MockEmbeddingProvider("mock"));
    this.register(new MockEmbeddingProvider("openai"));
    this.register(new MockEmbeddingProvider("azure_openai"));
    this.register(new MockEmbeddingProvider("gemini"));
    this.register(new MockEmbeddingProvider("voyage"));
    this.register(new MockEmbeddingProvider("local"));
  }

  register(adapter: EmbeddingProviderAdapter) {
    this.providers.set(adapter.provider, adapter);
  }

  get(provider: EmbeddingProvider) {
    return this.providers.get(provider) ?? null;
  }

  listProviders() {
    return Array.from(this.providers.keys());
  }
}

export const embeddingProviderRegistry = new EmbeddingProviderRegistry();