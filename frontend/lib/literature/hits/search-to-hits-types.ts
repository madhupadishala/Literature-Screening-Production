import type { HitsAIResult } from "@/lib/ai/hits-result-parser";

export type SearchToHitsItemStatus = "completed" | "manual_review" | "failed";

export interface SearchToHitsPackageResult {
  packageId: string;
  packageKey: string;
  title: string;
  mergedSources: string[];
  duplicateMerged: boolean;
  duplicateSignals: string[];
  status: SearchToHitsItemStatus;
  workflowState: "HITS_REVIEW";
  hitsResult?: HitsAIResult;
  hitsResultVersion?: number;
  error?: string;
}

export interface SearchToHitsExecution {
  status: "completed" | "partial" | "failed";
  requestedResultCount: number;
  createdCount: number;
  hitsCompletedCount: number;
  manualReviewCount: number;
  failedCount: number;
  duplicateMergedCount: number;
  durationMs: number;
  packages: SearchToHitsPackageResult[];
}
