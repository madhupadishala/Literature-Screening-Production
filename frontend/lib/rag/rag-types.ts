import type {
  VectorSearchMode,
  VectorSearchResult,
  VectorSourceType,
} from "@/lib/vector/vector-types";

export type RAGContextSource =
  | VectorSourceType
  | "workflow"
  | "assignment"
  | "audit"
  | "version_history";

export type RAGContextPriority = "critical" | "high" | "medium" | "low";

export interface RAGContextRequest {
  tenantId: string;
  query: string;
  productName?: string;
  country?: string;
  processArea?: string;
  caseType?: string;
  evidencePackageId?: string;
  sourceTypes?: VectorSourceType[];
  searchMode?: VectorSearchMode;
  topK?: number;
  minScore?: number;
}

export interface RAGContextChunk {
  id: string;
  source: RAGContextSource;
  sourceId: string;
  sourceName?: string;
  content: string;
  score: number;
  priority: RAGContextPriority;
  retrievalReason: string;
  metadata: {
    tenantId: string;
    versionId?: string;
    productName?: string;
    country?: string;
    processArea?: string;
    caseType?: string;
    evidencePackageId?: string;
    tags?: string[];
    createdAt?: string;
    updatedAt?: string;
  };
}

export interface RAGMergedContext {
  tenantId: string;
  query: string;
  summary: string;
  chunks: RAGContextChunk[];
  sourceBreakdown: Record<string, number>;
  warnings: string[];
  generatedAt: string;
}

export interface RAGEngineResponse {
  success: boolean;
  context: RAGMergedContext;
}

export interface RAGMergeOptions {
  maxChunks?: number;
  includeLowPriority?: boolean;
  deduplicate?: boolean;
}

export interface RAGRetrievalResult {
  request: RAGContextRequest;
  vectorResults: VectorSearchResult[];
  generatedAt: string;
}