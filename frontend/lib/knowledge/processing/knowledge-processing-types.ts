import type {
  KnowledgeFileCategory,
  KnowledgeLayer,
  RegulatoryAuthority,
} from "@/lib/knowledge/ingestion/knowledge-ingestion-types";

import type { NormalizedKnowledgeDocument } from "@/lib/knowledge/document-intelligence/document-intelligence-types";

export type KnowledgeProcessingStatus =
  | "processed"
  | "unchanged"
  | "unsupported"
  | "failed";

export interface ProcessedKnowledgeDocumentRecord {
  id: string;
  relativePath: string;
  checksum: string;
  layer: KnowledgeLayer;
  category: KnowledgeFileCategory;
  authority: RegulatoryAuthority;
  tenantId?: string;
  fileName: string;
  extension: string;
  sizeBytes: number;
  modifiedAt: string;
  status: "processed";
  document: NormalizedKnowledgeDocument;
  processedAt: string;
}

export interface ProcessedKnowledgeDocumentSummary {
  id: string;
  relativePath: string;
  checksum: string;
  layer: KnowledgeLayer;
  category: KnowledgeFileCategory;
  authority: RegulatoryAuthority;
  tenantId?: string;
  fileName: string;
  extension: string;
  sizeBytes: number;
  modifiedAt: string;
  title: string;
  format: string;
  pageCount: number;
  blockCount: number;
  sectionCount: number;
  warningCount: number;
  parserName: string;
  parserVersion: string;
  processedAt: string;
}

export interface KnowledgeProcessingFileResult {
  relativePath: string;
  fileName: string;
  extension: string;
  status: KnowledgeProcessingStatus;
  checksum?: string;
  documentId?: string;
  title?: string;
  pageCount?: number;
  blockCount?: number;
  sectionCount?: number;
  warnings: string[];
  errorCode?: string;
  error?: string;
  processedAt: string;
}

export interface KnowledgeProcessingRunResult {
  runId: string;
  rootPath: string;
  startedAt: string;
  completedAt: string;
  discovered: number;
  processed: number;
  unchanged: number;
  unsupported: number;
  failed: number;
  results: KnowledgeProcessingFileResult[];
}

export interface ProcessedKnowledgeIndex {
  schemaVersion: "1.0";
  updatedAt: string;
  documents: Record<string, ProcessedKnowledgeDocumentSummary>;
}