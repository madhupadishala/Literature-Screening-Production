import { aiProviderRegistry } from "./provider-registry";
import type {
  AICompletionRequest,
  AICompletionResponse,
  AIGatewayStatus,
  AIModelConfig,
} from "./ai-gateway-types";

const defaultModelConfig: AIModelConfig = {
  provider: "openrouter",
  model: "production-alpha-router",
  temperature: 0.2,
  maxTokens: 1200,
};

class AIGateway {
  private requestsHandled = 0;
  private history: AICompletionResponse[] = [];

  async complete(request: AICompletionRequest) {
    const modelConfig = {
      ...defaultModelConfig,
      ...request.modelConfig,
    };

    const provider = aiProviderRegistry.get(modelConfig.provider);

    if (!provider) {
      throw new Error(`AI provider not registered: ${modelConfig.provider}`);
    }

    const response = await provider.complete({
      ...request,
      modelConfig,
    });

    this.requestsHandled += 1;
    this.history.unshift(response);

    return response;
  }

  listHistory(limit = 20) {
    return this.history.slice(0, limit);
  }

  getStatus(): AIGatewayStatus {
    return {
      providers: aiProviderRegistry.listProviders(),
      defaultProvider: defaultModelConfig.provider,
      defaultModel: defaultModelConfig.model,
      requestsHandled: this.requestsHandled,
    };
  }
}

export const aiGateway = new AIGateway();