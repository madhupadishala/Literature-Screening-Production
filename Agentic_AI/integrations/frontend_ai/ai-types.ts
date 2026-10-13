export type AIProviderType =
  | "openai"
  | "groq"
  | "azure-openai"
  | "ollama"
  | "claude"
  | "gemini";

export interface AICompletionRequest {
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "json" | "text";
  requestId?: string;
}

export interface AICompletionResponse {
  provider: AIProviderType;
  model: string;
  content: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  finishReason?: string;
  latencyMs: number;
  generatedAt: string;
  requestId: string;
  attempts: number;
}

export interface AIProvider {
  readonly provider: AIProviderType;
  complete(request: AICompletionRequest): Promise<AICompletionResponse>;
}
