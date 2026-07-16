export type KnowledgeDocumentType =
  | "SOP"
  | "WORK_INSTRUCTION"
  | "PRODUCT_MASTER"
  | "CLIENT_GUIDANCE"
  | "REGULATORY"
  | "PROMPT"
  | "LITERATURE_RULE"
  | "OTHER";

export interface KnowledgeChunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  text: string;
  score?: number;
}

export interface KnowledgeDocument {
  id: string;
  tenantId: string;
  title: string;
  fileName: string;
  type: KnowledgeDocumentType;
  version: string;
  effectiveDate?: string;
  tags: string[];
  chunks: KnowledgeChunk[];
}

export interface KnowledgeSearchRequest {
  tenantId: string;
  query: string;
  topK?: number;
}

export interface KnowledgeSearchResult {
  document: KnowledgeDocument;
  chunk: KnowledgeChunk;
  score: number;
}