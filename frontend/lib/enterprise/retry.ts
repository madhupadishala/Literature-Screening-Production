export interface RetryOptions {
  attempts?: number;
  initialDelayMs?: number;
  maximumDelayMs?: number;
  multiplier?: number;
  jitterRatio?: number;
  signal?: AbortSignal;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

export async function retry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const initialDelayMs = Math.max(0, options.initialDelayMs ?? 150);
  const maximumDelayMs = Math.max(initialDelayMs, options.maximumDelayMs ?? 2_000);
  const multiplier = Math.max(1, options.multiplier ?? 2);
  const jitterRatio = Math.min(1, Math.max(0, options.jitterRatio ?? 0.2));

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (options.signal?.aborted) throw abortError();

    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      const canRetry =
        attempt < attempts && (options.shouldRetry?.(error, attempt) ?? true);

      if (!canRetry) throw error;

      const baseDelay = Math.min(
        maximumDelayMs,
        initialDelayMs * multiplier ** (attempt - 1),
      );
      const jitter = baseDelay * jitterRatio * (Math.random() * 2 - 1);
      const delayMs = Math.max(0, Math.round(baseDelay + jitter));

      options.onRetry?.(error, attempt, delayMs);
      await sleep(delayMs, options.signal);
    }
  }

  throw lastError;
}

function sleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    const timer = setTimeout(resolve, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function abortError(): Error {
  const error = new Error("Operation aborted.");
  error.name = "AbortError";
  return error;
}
