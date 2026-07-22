import type {
  VectorSearchMode,
  VectorSourceType,
} from "@/lib/vector/vector-types";
import type {
  AgentContextPack,
  GovernedKnowledgeCitation,
} from "@/lib/knowledge/retrieval/controlled-knowledge-types";

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
  actorId?: string;
  requestId?: string;
  correlationId?: string;
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
  citation?: GovernedKnowledgeCitation;
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
  contextPackId?: string;
  repositoryId?: string;
  repositoryVersion?: string;
  repositoryManifestSha256?: string;
  citations?: GovernedKnowledgeCitation[];
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
  contextPack: AgentContextPack;
  generatedAt: string;
}
