export interface ConcurrencyLimiterOptions {
  concurrency: number;
}

interface QueuedTask<T> {
  execute: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

export class ConcurrencyLimiter {
  private readonly concurrency: number;
  private activeCount = 0;
  private readonly queue: Array<QueuedTask<unknown>> = [];

  constructor(options: ConcurrencyLimiterOptions) {
    if (
      !Number.isFinite(options.concurrency) ||
      options.concurrency < 1
    ) {
      throw new Error(
        "Concurrency must be a finite number greater than or equal to 1.",
      );
    }

    this.concurrency = Math.floor(options.concurrency);
  }

  run<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        execute: operation,
        resolve: resolve as QueuedTask<unknown>["resolve"],
        reject,
      });

      this.processQueue();
    });
  }

  getStatus(): {
    concurrency: number;
    activeCount: number;
    queuedCount: number;
  } {
    return {
      concurrency: this.concurrency,
      activeCount: this.activeCount,
      queuedCount: this.queue.length,
    };
  }

  private processQueue(): void {
    while (
      this.activeCount < this.concurrency &&
      this.queue.length > 0
    ) {
      const task = this.queue.shift();

      if (!task) {
        return;
      }

      this.activeCount += 1;

      void task
        .execute()
        .then(task.resolve)
        .catch(task.reject)
        .finally(() => {
          this.activeCount -= 1;
          this.processQueue();
        });
    }
  }
}
