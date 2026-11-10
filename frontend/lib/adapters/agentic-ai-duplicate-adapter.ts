import "server-only";

import {
  DuplicateDetectionService,
  type DuplicateInput,
  type DuplicateRecord,
  type DuplicateMatch,
  type DuplicateDetectionResult,
} from "@/lib/contracts/duplicate-detection";

// Re-export contract types for consumers
export type {
  DuplicateDetectionService,
  DuplicateInput,
  DuplicateRecord,
  DuplicateMatch,
  DuplicateDetectionResult,
} from "@/lib/contracts/duplicate-detection";

/**
 * Agentic_AI Duplicate Detection Adapter
 *
 * Bridges Frontend TypeScript code to Agentic_AI Python agents:
 * - AG18: Literature Duplicate Detection
 * - AG19: ICSR Duplicate Detection
 *
 * Calls via HTTP to `/api/ai/duplicate-detection` endpoint
 * which proxies to the Agentic_AI execution layer.
 */

const AI_API_BASE = process.env.AGENTIC_AI_API_URL || "http://localhost:8001";

interface AgenticAIDuplicateRequest {
  input: DuplicateInput;
  type: "literature" | "icsr";
}

interface AgenticAIDuplicateResponse {
  duplicates: Array<{
    record: DuplicateRecord;
    score: number;
    match_type: string;
    matched_fields: string[];
  }>;
  total_checked: number;
  processing_time_ms: number;
}

interface AgenticAIBatchRequest {
  candidates: DuplicateInput[];
  existing: DuplicateRecord[];
  type: "literature" | "icsr";
}

interface AgenticAIBatchResponse {
  matches: Array<{
    candidate_index: number;
    record: DuplicateRecord;
    score: number;
    match_type: string;
    matched_fields: string[];
  } | null>;
}

export class AgenticAIDuplicateAdapter implements DuplicateDetectionService {
  private async callAgent<T>(endpoint: string, payload: unknown): Promise<T> {
    const response = await fetch(`${AI_API_BASE}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Source": "nexus-frontend",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(`Agentic_AI duplicate detection failed: ${error.error || response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  async findDuplicates(input: DuplicateInput): Promise<DuplicateDetectionResult> {
    // Try literature first, then ICSR
    const [litResult, icsrResult] = await Promise.allSettled([
      this.callAgent<AgenticAIDuplicateResponse>("/duplicate-detection/literature", { input, type: "literature" }),
      this.callAgent<AgenticAIDuplicateResponse>("/duplicate-detection/icsr", { input, type: "icsr" }),
    ]);

    const allDuplicates: DuplicateMatch[] = [];

    if (litResult.status === "fulfilled") {
      allDuplicates.push(...litResult.value.duplicates.map(d => ({
        record: d.record,
        score: d.score,
        matchType: d.match_type as "exact" | "high" | "medium" | "low",
        matchedFields: d.matched_fields,
      })));
    }

    if (icsrResult.status === "fulfilled") {
      allDuplicates.push(...icsrResult.value.duplicates.map(d => ({
        record: d.record,
        score: d.score,
        matchType: d.match_type as "exact" | "high" | "medium" | "low",
        matchedFields: d.matched_fields,
      })));
    }

    // Sort by score descending
    allDuplicates.sort((a, b) => b.score - a.score);

    return {
      duplicates: allDuplicates,
      totalChecked: (litResult.status === "fulfilled" ? litResult.value.total_checked : 0) +
                    (icsrResult.status === "fulfilled" ? icsrResult.value.total_checked : 0),
      processingTimeMs: (litResult.status === "fulfilled" ? litResult.value.processing_time_ms : 0) +
                        (icsrResult.status === "fulfilled" ? icsrResult.value.processing_time_ms : 0),
    };
  }

  async checkDuplicate(candidate: DuplicateInput, existing: DuplicateRecord[]): Promise<DuplicateMatch | null> {
    if (existing.length === 0) return null;

    const response = await this.callAgent<AgenticAIBatchResponse>("/duplicate-detection/check", {
      candidates: [candidate],
      existing,
      type: "literature", // Default to literature for single check
    });

    const match = response.matches[0];
    if (!match) return null;

    return {
      record: match.record,
      score: match.score,
      matchType: match.match_type as "exact" | "high" | "medium" | "low",
      matchedFields: match.matched_fields,
    };
  }

  async batchCheckDuplicates(candidates: DuplicateInput[], existing: DuplicateRecord[]): Promise<DuplicateMatch[]> {
    if (candidates.length === 0 || existing.length === 0) return [];

    const response = await this.callAgent<AgenticAIBatchResponse>("/duplicate-detection/batch-check", {
      candidates,
      existing,
      type: "literature",
    });

    return response.matches
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .map(m => ({
        record: m.record,
        score: m.score,
        matchType: m.match_type as "exact" | "high" | "medium" | "low",
        matchedFields: m.matched_fields,
      }));
  }

  async getStats(): Promise<{ totalRecords: number; totalDuplicatesFound: number; lastRun: string }> {
    const response = await fetch(`${AI_API_BASE}/duplicate-detection/stats`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return { totalRecords: 0, totalDuplicatesFound: 0, lastRun: new Date().toISOString() };
    }

    return response.json();
  }
}

/**
 * Factory for creating duplicate detection service
 * Allows switching between Agentic_AI and mock implementations
 */
export function createDuplicateDetectionService(): DuplicateDetectionService {
  return new AgenticAIDuplicateAdapter();
}