export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: string;
  retryAfterSeconds: number;
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

export class InMemoryRateLimiter {
  private readonly entries = new Map<string, WindowEntry>();
  private operations = 0;

  check(key: string, limit: number, windowMs: number): RateLimitDecision {
    const now = Date.now();
    const safeLimit = Math.max(1, limit);
    const safeWindow = Math.max(1_000, windowMs);

    this.operations += 1;
    if (this.operations % 250 === 0) this.cleanup(now);

    const current = this.entries.get(key);
    const entry =
      !current || current.resetAt <= now
        ? { count: 0, resetAt: now + safeWindow }
        : current;

    entry.count += 1;
    this.entries.set(key, entry);

    const allowed = entry.count <= safeLimit;
    const remaining = Math.max(0, safeLimit - entry.count);
    const retryAfterSeconds = Math.max(0, Math.ceil((entry.resetAt - now) / 1_000));

    return {
      allowed,
      limit: safeLimit,
      remaining,
      resetAt: new Date(entry.resetAt).toISOString(),
      retryAfterSeconds,
    };
  }

  reset(): void {
    this.entries.clear();
    this.operations = 0;
  }

  private cleanup(now: number): void {
    for (const [key, entry] of this.entries.entries()) {
      if (entry.resetAt <= now) this.entries.delete(key);
    }
  }
}

declare global {
  var __clinixRateLimiter: InMemoryRateLimiter | undefined;
}

export const rateLimiter =
  globalThis.__clinixRateLimiter ??
  (globalThis.__clinixRateLimiter = new InMemoryRateLimiter());
