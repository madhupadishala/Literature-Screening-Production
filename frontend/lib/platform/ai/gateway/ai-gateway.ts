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
  private history: Array<{
    tenantId: string;
    response: AICompletionResponse;
  }> = [];

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

    this.history.unshift({ tenantId: request.tenantId, response });

    return response;
  }

  listHistory(tenantId: string, limit = 20) {
    return this.history
      .filter((item) => item.tenantId === tenantId)
      .slice(0, limit)
      .map((item) => item.response);
  }

  getStatus(tenantId: string): AIGatewayStatus {
    return {
      providers: aiProviderRegistry.listProviders(),
      defaultProvider: defaultModelConfig.provider,
      defaultModel: defaultModelConfig.model,
      requestsHandled: this.history.filter((item) => item.tenantId === tenantId).length,
    };
  }
}

export const aiGateway = new AIGateway();