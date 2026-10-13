import type { AIProviderType } from "./ai-types";

export type AIErrorCode =
  | "CONFIGURATION_ERROR"
  | "AUTHENTICATION_ERROR"
  | "RATE_LIMIT_ERROR"
  | "TIMEOUT_ERROR"
  | "PROVIDER_ERROR"
  | "EMPTY_RESPONSE"
  | "INVALID_RESPONSE";

export class AIProviderError extends Error {
  readonly code: AIErrorCode;
  readonly provider: AIProviderType;
  readonly requestId: string;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(input: {
    message: string;
    code: AIErrorCode;
    provider: AIProviderType;
    requestId: string;
    retryable: boolean;
    cause?: unknown;
  }) {
    super(input.message);
    this.name = "AIProviderError";
    this.code = input.code;
    this.provider = input.provider;
    this.requestId = input.requestId;
    this.retryable = input.retryable;
    this.cause = input.cause;
  }
}

export function normalizeAIError(input: {
  error: unknown;
  provider: AIProviderType;
  requestId: string;
}): AIProviderError {
  if (input.error instanceof AIProviderError) {
    return input.error;
  }

  const candidate = input.error as {
    status?: unknown;
    code?: unknown;
    message?: unknown;
  };
  const status = typeof candidate?.status === "number" ? candidate.status : undefined;
  const code = typeof candidate?.code === "string" ? candidate.code : "";
  const message =
    typeof candidate?.message === "string"
      ? candidate.message
      : "AI provider request failed.";

  if (status === 401 || status === 403) {
    return new AIProviderError({
      message,
      code: "AUTHENTICATION_ERROR",
      provider: input.provider,
      requestId: input.requestId,
      retryable: false,
      cause: input.error,
    });
  }

  if (status === 429 || code.toLowerCase().includes("rate_limit")) {
    return new AIProviderError({
      message,
      code: "RATE_LIMIT_ERROR",
      provider: input.provider,
      requestId: input.requestId,
      retryable: true,
      cause: input.error,
    });
  }

  if (status !== undefined && status >= 500) {
    return new AIProviderError({
      message,
      code: "PROVIDER_ERROR",
      provider: input.provider,
      requestId: input.requestId,
      retryable: true,
      cause: input.error,
    });
  }

  return new AIProviderError({
    message,
    code: "PROVIDER_ERROR",
    provider: input.provider,
    requestId: input.requestId,
    retryable: false,
    cause: input.error,
  });
}
