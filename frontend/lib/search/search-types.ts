export type SearchResultType =
  | "hit"
  | "screening"
  | "intake"
  | "qc"
  | "evidence"
  | "knowledge"
  | "product"
  | "calendar"
  | "notification"
  | "audit"
  | "workflow"
  | "system";

export type SearchMode = "keyword" | "semantic" | "hybrid";

export interface SearchIndexRecord {
  id: string;
  tenantId: string;
  type: SearchResultType;
  sourceModule: string;
  sourceId: string;
  title: string;
  summary: string;
  content: string;
  tags?: string[];
  productName?: string;
  country?: string;
  workflowStage?: string;
  createdAt: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
  href?: string;
}

export interface SearchRequest {
  tenantId: string;
  query: string;
  mode?: SearchMode;
  types?: SearchResultType[];
  productName?: string;
  country?: string;
  workflowStage?: string;
  tags?: string[];
  topK?: number;
  minScore?: number;
}

export interface SearchResult {
  record: SearchIndexRecord;
  score: number;
  matchedBy: SearchMode;
  explanation: string;
}

export interface SearchResponse {
  tenantId: string;
  query: string;
  mode: SearchMode;
  results: SearchResult[];
  totalResults: number;
  generatedAt: string;
}