import type {
  KnowledgeFileCategory,
  KnowledgeLayer,
  RegulatoryAuthority,
} from "@/lib/knowledge/ingestion/knowledge-ingestion-types";

import type {
  NormalizedKnowledgeDocument,
  NormalizedKnowledgeSection,
} from "@/lib/knowledge/document-intelligence/document-intelligence-types";

export interface KnowledgeChunkingContext {
  layer: KnowledgeLayer;
  category: KnowledgeFileCategory;
  authority: RegulatoryAuthority;
  tenantId?: string;
  documentVersion?: string;
  effectiveDate?: string;
  jurisdiction?: string;
}

export interface KnowledgeChunkingOptions {
  maxTokens: number;
  targetTokens: number;
  overlapTokens: number;
  minimumTokens: number;
  tokenizer: "cl100k_base";
}

export interface KnowledgeChunkCitation {
  documentId: string;
  documentTitle: string;
  relativePath: string;
  sectionId?: string;
  sectionTitle?: string;
  sectionNumber?: string;
  pageStart?: number;
  pageEnd?: number;
  citationText: string;
}

export interface KnowledgeChunkMetadata {
  tenantId?: string;
  layer: KnowledgeLayer;
  category: KnowledgeFileCategory;
  authority: RegulatoryAuthority;
  jurisdiction?: string;
  documentVersion?: string;
  effectiveDate?: string;
  language: string;
  sourceFormat: string;
  parserName: string;
  parserVersion: string;
  normalizerName: string;
  normalizerVersion: string;
}

export interface KnowledgeChunk {
  id: string;
  documentId: string;
  sectionId?: string;
  index: number;
  text: string;
  tokenCount: number;
  contentHash: string;
  blockIds: string[];
  citation: KnowledgeChunkCitation;
  metadata: KnowledgeChunkMetadata;
  createdAt: string;
}

export interface KnowledgeChunkValidationIssue {
  code:
    | "EMPTY_TEXT"
    | "TOKEN_LIMIT_EXCEEDED"
    | "BELOW_MINIMUM_SIZE"
    | "MISSING_CITATION"
    | "MISSING_DOCUMENT_ID"
    | "DUPLICATE_CONTENT";
  severity: "warning" | "error";
  message: string;
  chunkId: string;
}

export interface KnowledgeChunkValidationResult {
  valid: boolean;
  issues: KnowledgeChunkValidationIssue[];
}

export interface KnowledgeChunkingRequest {
  document: NormalizedKnowledgeDocument;
  context: KnowledgeChunkingContext;
  options?: Partial<KnowledgeChunkingOptions>;
}

export interface KnowledgeChunkingResult {
  documentId: string;
  documentTitle: string;
  chunks: KnowledgeChunk[];
  sourceSections: NormalizedKnowledgeSection[];
  totalTokens: number;
  validation: KnowledgeChunkValidationResult;
  chunkedAt: string;
  chunkerName: string;
  chunkerVersion: string;
}