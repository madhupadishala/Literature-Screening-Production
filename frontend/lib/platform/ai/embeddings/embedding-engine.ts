import { embeddingProviderRegistry } from "./embedding-provider";
import type {
  EmbeddingEngineStatus,
  EmbeddingModelConfig,
  EmbeddingRequest,
  EmbeddingResponse,
} from "./embedding-types";

const defaultEmbeddingConfig: EmbeddingModelConfig = {
  provider: "mock",
  model: "mock-embedding-production-alpha",
  dimensions: 64,
};

class EmbeddingEngine {
  private history: EmbeddingResponse[] = [];

  async embed(request: EmbeddingRequest) {
    const config: EmbeddingModelConfig = {
      ...defaultEmbeddingConfig,
      ...request.modelConfig,
    };

    const provider = embeddingProviderRegistry.get(config.provider);

    if (!provider) {
      throw new Error(`Embedding provider not registered: ${config.provider}`);
    }

    const response = await provider.embed(request, config);

    this.history.unshift(response);

    return response;
  }

  async embedBatch(requests: EmbeddingRequest[]) {
    return Promise.all(requests.map((request) => this.embed(request)));
  }

  listHistory(limit = 20) {
    return this.history.slice(0, limit);
  }

  getStatus(): EmbeddingEngineStatus {
    const totalLatency = this.history.reduce(
      (sum, item) => sum + item.latencyMs,
      0,
    );

    return {
      providers: embeddingProviderRegistry.listProviders(),
      defaultProvider: defaultEmbeddingConfig.provider,
      defaultModel: defaultEmbeddingConfig.model,
      defaultDimensions: defaultEmbeddingConfig.dimensions,
      totalEmbeddings: this.history.length,
      averageLatencyMs:
        this.history.length === 0
          ? 0
          : Math.round(totalLatency / this.history.length),
    };
  }
}

export const embeddingEngine = new EmbeddingEngine();