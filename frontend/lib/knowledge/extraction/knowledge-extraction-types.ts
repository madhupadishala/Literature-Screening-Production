export type KnowledgeObjectType =
  | "definition"
  | "rule"
  | "timeline"
  | "decision"
  | "exception"
  | "reference"
  | "relationship"
  | "warning";

export interface KnowledgeExtractionRequest {
  tenantId?: string;
  documentId: string;
  title: string;
  content: string;
}

export interface KnowledgeObject {
  id: string;
  documentId: string;
  type: KnowledgeObjectType;
  title: string;
  description: string;
  sourceSection?: string;
  keywords: string[];
}

export interface KnowledgeExtractionResult {
  documentId: string;
  objects: KnowledgeObject[];
  extractedAt: string;
}

export interface KnowledgeExtractionStatus {
  processedDocuments: number;
  extractedObjects: number;
}