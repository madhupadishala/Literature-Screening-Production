import type { HistogramSnapshot, MetricsSnapshot } from "./types";

interface HistogramState {
  count: number;
  sum: number;
  min: number;
  max: number;
}

export class MetricsRegistry {
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();
  private readonly histograms = new Map<string, HistogramState>();

  increment(name: string, amount = 1): void {
    const key = normalizeMetricName(name);
    this.counters.set(key, (this.counters.get(key) ?? 0) + amount);
  }

  setGauge(name: string, value: number): void {
    if (!Number.isFinite(value)) return;
    this.gauges.set(normalizeMetricName(name), value);
  }

  observe(name: string, value: number): void {
    if (!Number.isFinite(value)) return;

    const key = normalizeMetricName(name);
    const current = this.histograms.get(key);
    if (!current) {
      this.histograms.set(key, {
        count: 1,
        sum: value,
        min: value,
        max: value,
      });
      return;
    }

    current.count += 1;
    current.sum += value;
    current.min = Math.min(current.min, value);
    current.max = Math.max(current.max, value);
  }

  snapshot(): MetricsSnapshot {
    const histograms: Record<string, HistogramSnapshot> = {};
    for (const [name, state] of this.histograms.entries()) {
      histograms[name] = {
        ...state,
        average: state.count === 0 ? 0 : state.sum / state.count,
      };
    }

    return {
      generatedAt: new Date().toISOString(),
      counters: Object.fromEntries(this.counters.entries()),
      gauges: Object.fromEntries(this.gauges.entries()),
      histograms,
    };
  }

  toPrometheus(): string {
    const snapshot = this.snapshot();
    const lines: string[] = [];

    for (const [name, value] of Object.entries(snapshot.counters)) {
      lines.push(`# TYPE ${name} counter`, `${name} ${value}`);
    }

    for (const [name, value] of Object.entries(snapshot.gauges)) {
      lines.push(`# TYPE ${name} gauge`, `${name} ${value}`);
    }

    for (const [name, value] of Object.entries(snapshot.histograms)) {
      lines.push(
        `# TYPE ${name} summary`,
        `${name}_count ${value.count}`,
        `${name}_sum ${value.sum}`,
        `${name}_min ${value.min}`,
        `${name}_max ${value.max}`,
        `${name}_average ${value.average}`,
      );
    }

    return `${lines.join("\n")}\n`;
  }

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}

function normalizeMetricName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_:]/g, "_")
    .replace(/_+/g, "_");

  return normalized.startsWith("clinixai_")
    ? normalized
    : `clinixai_${normalized || "metric"}`;
}

declare global {
  var __clinixMetricsRegistry: MetricsRegistry | undefined;
}

export const metrics =
  globalThis.__clinixMetricsRegistry ??
  (globalThis.__clinixMetricsRegistry = new MetricsRegistry());
