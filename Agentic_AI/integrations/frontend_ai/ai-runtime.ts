import { AIProviderError } from "./ai-error";
import type { AIProviderType } from "./ai-types";

export function createAIRequestId(prefix = "ai"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withTimeout<T>(input: {
  operation: Promise<T>;
  timeoutMs: number;
  provider: AIProviderType;
  requestId: string;
}): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      input.operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new AIProviderError({
              message: `AI provider timed out after ${input.timeoutMs} ms.`,
              code: "TIMEOUT_ERROR",
              provider: input.provider,
              requestId: input.requestId,
              retryable: true,
            }),
          );
        }, input.timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
