import { DependencyError } from "./errors";
import { metrics } from "./metrics";

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  recoveryTimeoutMs?: number;
  successThreshold?: number;
}

export interface CircuitBreakerStatus {
  name: string;
  state: CircuitState;
  consecutiveFailures: number;
  halfOpenSuccesses: number;
  openedAt?: string;
}

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private consecutiveFailures = 0;
  private halfOpenSuccesses = 0;
  private openedAt?: number;

  private readonly failureThreshold: number;
  private readonly recoveryTimeoutMs: number;
  private readonly successThreshold: number;

  constructor(
    readonly name: string,
    options: CircuitBreakerOptions = {},
  ) {
    this.failureThreshold = Math.max(1, options.failureThreshold ?? 5);
    this.recoveryTimeoutMs = Math.max(100, options.recoveryTimeoutMs ?? 30_000);
    this.successThreshold = Math.max(1, options.successThreshold ?? 2);
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.refreshState();

    if (this.state === "open") {
      metrics.increment(`circuit_${this.name}_rejected_total`);
      throw new DependencyError(`Circuit ${this.name} is open.`, this.status());
    }

    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  status(): CircuitBreakerStatus {
    this.refreshState();
    return {
      name: this.name,
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      halfOpenSuccesses: this.halfOpenSuccesses,
      openedAt: this.openedAt ? new Date(this.openedAt).toISOString() : undefined,
    };
  }

  reset(): void {
    this.state = "closed";
    this.consecutiveFailures = 0;
    this.halfOpenSuccesses = 0;
    this.openedAt = undefined;
  }

  private refreshState(): void {
    if (
      this.state === "open" &&
      this.openedAt !== undefined &&
      Date.now() - this.openedAt >= this.recoveryTimeoutMs
    ) {
      this.state = "half_open";
      this.halfOpenSuccesses = 0;
      metrics.increment(`circuit_${this.name}_half_open_total`);
    }
  }

  private recordSuccess(): void {
    if (this.state === "half_open") {
      this.halfOpenSuccesses += 1;
      if (this.halfOpenSuccesses >= this.successThreshold) this.reset();
      return;
    }

    this.consecutiveFailures = 0;
  }

  private recordFailure(): void {
    this.consecutiveFailures += 1;
    metrics.increment(`circuit_${this.name}_failures_total`);

    if (
      this.state === "half_open" ||
      this.consecutiveFailures >= this.failureThreshold
    ) {
      this.state = "open";
      this.openedAt = Date.now();
      this.halfOpenSuccesses = 0;
      metrics.increment(`circuit_${this.name}_opened_total`);
    }
  }
}

declare global {
  var __clinixCircuitBreakers: Map<string, CircuitBreaker> | undefined;
}

const breakers =
  globalThis.__clinixCircuitBreakers ??
  (globalThis.__clinixCircuitBreakers = new Map<string, CircuitBreaker>());

export function getCircuitBreaker(
  name: string,
  options?: CircuitBreakerOptions,
): CircuitBreaker {
  const existing = breakers.get(name);
  if (existing) return existing;

  const breaker = new CircuitBreaker(name, options);
  breakers.set(name, breaker);
  return breaker;
}

export function listCircuitBreakers(): CircuitBreakerStatus[] {
  return [...breakers.values()].map((breaker) => breaker.status());
}
