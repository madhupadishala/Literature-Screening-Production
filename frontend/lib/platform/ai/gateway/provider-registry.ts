import type {
  AICompletionRequest,
  AICompletionResponse,
  AIProvider,
  AIProviderAdapter,
} from "./ai-gateway-types";

function createRequestId() {
  return `ai_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

class MockAIProviderAdapter implements AIProviderAdapter {
  provider: AIProvider;

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const startedAt = Date.now();

    const inputText = request.messages
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n");

    const inputTokens = estimateTokens(inputText);

    const content = [
      `Mock ${this.provider} response for use case: ${request.useCase}.`,
      "This placeholder will later be replaced by a production LLM provider.",
    ].join(" ");

    const outputTokens = estimateTokens(content);

    return {
      id: createRequestId(),
      status: "completed",
      provider: this.provider,
      model: request.modelConfig?.model ?? "mock-production-alpha",
      content,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      latencyMs: Date.now() - startedAt,
      createdAt: new Date().toISOString(),
      metadata: request.metadata,
    };
  }
}

class AIProviderRegistry {
  private providers = new Map<AIProvider, AIProviderAdapter>();

  constructor() {
    this.register(new MockAIProviderAdapter("openrouter"));
    this.register(new MockAIProviderAdapter("openai"));
    this.register(new MockAIProviderAdapter("azure_openai"));
    this.register(new MockAIProviderAdapter("anthropic"));
    this.register(new MockAIProviderAdapter("gemini"));
    this.register(new MockAIProviderAdapter("local"));
  }

  register(adapter: AIProviderAdapter) {
    this.providers.set(adapter.provider, adapter);
  }

  get(provider: AIProvider) {
    return this.providers.get(provider) ?? null;
  }

  listProviders() {
    return Array.from(this.providers.keys());
  }
}

export const aiProviderRegistry = new AIProviderRegistry();