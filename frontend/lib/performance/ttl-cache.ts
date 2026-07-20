export interface TTLCacheOptions {
  defaultTtlMs: number;
  maxEntries: number;
}

interface CacheEntry<TValue> {
  value: TValue;
  expiresAt: number;
  createdAt: number;
  lastAccessedAt: number;
}

export interface TTLCacheStatus {
  size: number;
  maxEntries: number;
  defaultTtlMs: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
}

export class TTLCache<TKey, TValue> {
  private readonly entries = new Map<TKey, CacheEntry<TValue>>();
  private readonly defaultTtlMs: number;
  private readonly maxEntries: number;

  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(options: TTLCacheOptions) {
    if (
      !Number.isFinite(options.defaultTtlMs) ||
      options.defaultTtlMs <= 0
    ) {
      throw new Error("defaultTtlMs must be greater than zero.");
    }

    if (
      !Number.isFinite(options.maxEntries) ||
      options.maxEntries < 1
    ) {
      throw new Error("maxEntries must be at least 1.");
    }

    this.defaultTtlMs = Math.floor(options.defaultTtlMs);
    this.maxEntries = Math.floor(options.maxEntries);
  }

  get(key: TKey): TValue | undefined {
    const entry = this.entries.get(key);

    if (!entry) {
      this.misses += 1;
      return undefined;
    }

    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      this.misses += 1;
      return undefined;
    }

    entry.lastAccessedAt = Date.now();
    this.hits += 1;

    return entry.value;
  }

  set(
    key: TKey,
    value: TValue,
    ttlMs = this.defaultTtlMs,
  ): void {
    this.deleteExpired();

    if (!this.entries.has(key) && this.entries.size >= this.maxEntries) {
      this.evictLeastRecentlyUsed();
    }

    const now = Date.now();

    this.entries.set(key, {
      value,
      createdAt: now,
      lastAccessedAt: now,
      expiresAt: now + Math.max(1, Math.floor(ttlMs)),
    });
  }

  has(key: TKey): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: TKey): boolean {
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  getStatus(): TTLCacheStatus {
    const requests = this.hits + this.misses;

    return {
      size: this.entries.size,
      maxEntries: this.maxEntries,
      defaultTtlMs: this.defaultTtlMs,
      hits: this.hits,
      misses: this.misses,
      hitRate: requests === 0 ? 0 : this.hits / requests,
      evictions: this.evictions,
    };
  }

  private deleteExpired(): void {
    const now = Date.now();

    for (const [key, entry] of this.entries.entries()) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }

  private evictLeastRecentlyUsed(): void {
    let oldestKey: TKey | undefined;
    let oldestAccess = Number.POSITIVE_INFINITY;

    for (const [key, entry] of this.entries.entries()) {
      if (entry.lastAccessedAt < oldestAccess) {
        oldestAccess = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey !== undefined) {
      this.entries.delete(oldestKey);
      this.evictions += 1;
    }
  }
}
