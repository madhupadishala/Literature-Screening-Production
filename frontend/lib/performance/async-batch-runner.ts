import { ConcurrencyLimiter } from "./concurrency-limiter";

export interface BatchItemSuccess<TInput, TOutput> {
  index: number;
  input: TInput;
  status: "fulfilled";
  value: TOutput;
  durationMs: number;
}

export interface BatchItemFailure<TInput> {
  index: number;
  input: TInput;
  status: "rejected";
  error: string;
  durationMs: number;
}

export type BatchItemResult<TInput, TOutput> =
  | BatchItemSuccess<TInput, TOutput>
  | BatchItemFailure<TInput>;

export interface AsyncBatchResult<TInput, TOutput> {
  total: number;
  succeeded: number;
  failed: number;
  durationMs: number;
  results: Array<BatchItemResult<TInput, TOutput>>;
}

export async function runAsyncBatch<TInput, TOutput>(options: {
  items: readonly TInput[];
  concurrency: number;
  stopOnError?: boolean;
  worker: (
    item: TInput,
    index: number,
  ) => Promise<TOutput>;
}): Promise<AsyncBatchResult<TInput, TOutput>> {
  const startedAt = Date.now();
  const limiter = new ConcurrencyLimiter({
    concurrency: options.concurrency,
  });

  let firstFailure: Error | undefined;

  const tasks = options.items.map((item, index) =>
    limiter.run(async (): Promise<BatchItemResult<TInput, TOutput>> => {
      if (firstFailure && options.stopOnError) {
        return {
          index,
          input: item,
          status: "rejected",
          error: "Skipped because a previous batch item failed.",
          durationMs: 0,
        };
      }

      const itemStartedAt = Date.now();

      try {
        const value = await options.worker(item, index);

        return {
          index,
          input: item,
          status: "fulfilled",
          value,
          durationMs: Date.now() - itemStartedAt,
        };
      } catch (error) {
        const normalizedError =
          error instanceof Error
            ? error
            : new Error("Unknown batch-processing error.");

        firstFailure ??= normalizedError;

        return {
          index,
          input: item,
          status: "rejected",
          error: normalizedError.message,
          durationMs: Date.now() - itemStartedAt,
        };
      }
    }),
  );

  const results = await Promise.all(tasks);
  const succeeded = results.filter(
    (result) => result.status === "fulfilled",
  ).length;

  return {
    total: results.length,
    succeeded,
    failed: results.length - succeeded,
    durationMs: Date.now() - startedAt,
    results,
  };
}
