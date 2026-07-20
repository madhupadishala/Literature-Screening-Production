import OpenAI from "openai";

import { BaseAIProvider } from "../ai-provider";
import { AIProviderError, normalizeAIError } from "../ai-error";
import { createAIRequestId, sleep, withTimeout } from "../ai-runtime";
import { getAISettings } from "../ai-settings";

import type {
  AICompletionRequest,
  AICompletionResponse,
  AIProviderType,
} from "../ai-types";

export class OpenAIProvider extends BaseAIProvider {
  readonly provider = "openai" as const;

  private client: OpenAI | null = null;

  private clientSignature = "";

  private resolveApiKey(
    runtimeProvider: AIProviderType,
  ): string {
    const apiKey =
      runtimeProvider === "groq"
        ? process.env.GROQ_API_KEY ??
          process.env.AI_API_KEY
        : process.env.OPENAI_API_KEY ??
          process.env.AI_API_KEY;

    if (!apiKey) {
      throw new AIProviderError({
        message:
          runtimeProvider === "groq"
            ? "GROQ_API_KEY or AI_API_KEY environment variable is missing."
            : "OPENAI_API_KEY or AI_API_KEY environment variable is missing.",
        code: "CONFIGURATION_ERROR",
        provider: runtimeProvider,
        requestId: createAIRequestId("config"),
        retryable: false,
      });
    }

    return apiKey;
  }

  private getClient(): OpenAI {
    const settings = getAISettings();

    const runtimeProvider = settings.provider;

    const apiKey =
      this.resolveApiKey(runtimeProvider);

    const signature = [
      runtimeProvider,
      settings.baseURL ?? "default",
      apiKey,
    ].join("|");

    if (
      this.client &&
      this.clientSignature === signature
    ) {
      return this.client;
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: settings.baseURL,
      maxRetries: 0,
    });

    this.clientSignature = signature;

    return this.client;
  }

  async complete(
    request: AICompletionRequest,
  ): Promise<AICompletionResponse> {
    const settings = getAISettings();

    const runtimeProvider =
      settings.provider;

    const requestId =
      request.requestId ??
      createAIRequestId("completion");

    const startedAt = Date.now();

    let lastError:
      | AIProviderError
      | undefined;

    for (
      let attempt = 1;
      attempt <= settings.maxAttempts;
      attempt += 1
    ) {
      try {
        const client = this.getClient();

        const response =
          await withTimeout({
            operation:
              client.chat.completions.create({
                model: settings.model,

                temperature:
                  request.temperature ??
                  settings.temperature,

                max_tokens:
                  request.maxTokens ??
                  settings.maxTokens,

                response_format:
                  request.responseFormat ===
                  "json"
                    ? {
                        type: "json_object",
                      }
                    : undefined,

                messages: [
                  ...(request.systemPrompt
                    ? [
                        {
                          role:
                            "system" as const,
                          content:
                            request.systemPrompt,
                        },
                      ]
                    : []),

                  {
                    role:
                      "user" as const,
                    content:
                      request.userPrompt,
                  },
                ],
              }),

            timeoutMs:
              settings.timeoutMs,

            provider:
              runtimeProvider,

            requestId,
          });

        const content =
          response.choices[0]
            ?.message?.content
            ?.trim() ?? "";

        if (!content) {
          throw new AIProviderError({
            message:
              "AI provider returned an empty response.",
            code: "EMPTY_RESPONSE",
            provider:
              runtimeProvider,
            requestId,
            retryable: true,
          });
        }

        return {
          provider:
            runtimeProvider,

          model:
            response.model,

          content,

          promptTokens:
            response.usage
              ?.prompt_tokens,

          completionTokens:
            response.usage
              ?.completion_tokens,

          totalTokens:
            response.usage
              ?.total_tokens,

          finishReason:
            response.choices[0]
              ?.finish_reason ??
            undefined,

          latencyMs:
            Date.now() -
            startedAt,

          generatedAt:
            new Date().toISOString(),

          requestId,

          attempts:
            attempt,
        };
      } catch (error) {
        lastError =
          normalizeAIError({
            error,
            provider:
              runtimeProvider,
            requestId,
          });

        const shouldRetry =
          lastError.retryable &&
          attempt <
            settings.maxAttempts;

        if (!shouldRetry) {
          throw lastError;
        }

        await sleep(
          settings.retryDelayMs *
            attempt,
        );
      }
    }

    throw (
      lastError ??
      new AIProviderError({
        message:
          "AI provider request failed.",
        code: "PROVIDER_ERROR",
        provider:
          runtimeProvider,
        requestId,
        retryable: false,
      })
    );
  }
}

export const openAIProvider =
  new OpenAIProvider();