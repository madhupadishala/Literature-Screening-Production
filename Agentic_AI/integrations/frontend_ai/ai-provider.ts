import type {
  AICompletionRequest,
  AICompletionResponse,
  AIProvider,
} from "./ai-types";

export abstract class BaseAIProvider
  implements AIProvider
{
  abstract readonly provider:
    | "openai"
    | "azure-openai"
    | "ollama"
    | "claude"
    | "gemini";

  abstract complete(
    request: AICompletionRequest,
  ): Promise<AICompletionResponse>;
}