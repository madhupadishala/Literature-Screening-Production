export type AIProvider =
  | "openai"
  | "openrouter"
  | "azure_openai"
  | "anthropic"
  | "gemini"
  | "local";

export type AIRequestStatus = "queued" | "completed" | "failed";

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIModelConfig {
  provider: AIProvider;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AICompletionRequest {
  tenantId: string;
  useCase: string;
  messages: AIMessage[];
  modelConfig?: Partial<AIModelConfig>;
  metadata?: Record<string, unknown>;
}

export interface AICompletionResponse {
  id: string;
  status: AIRequestStatus;
  provider: AIProvider;
  model: string;
  content: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface AIProviderAdapter {
  provider: AIProvider;
  complete(request: AICompletionRequest): Promise<AICompletionResponse>;
}

export interface AIGatewayStatus {
  providers: AIProvider[];
  defaultProvider: AIProvider;
  defaultModel: string;
  requestsHandled: number;
}