export interface RAGSource {
  id: string;
  sourceType:
    | "knowledge"
    | "sop"
    | "product_master"
    | "evidence_package"
    | "prompt"
    | "vector_match";
  title: string;
  content: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface RAGContext {
  tenantId: string;
  query: string;
  sources: RAGSource[];
  mergedContext: string;
  createdAt: string;
}

export interface RAGRequest {
  tenantId: string;
  query: string;
  topK?: number;
}

export interface RAGResponse {
  context: RAGContext;
  prompt: string;
}

export interface RAGStatus {
  contextsBuilt: number;
  averageSourcesPerContext: number;
}