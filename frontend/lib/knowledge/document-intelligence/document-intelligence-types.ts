import type {
  KnowledgeDocumentBlock,
  KnowledgeDocumentFormat,
  ParsedKnowledgeDocument,
} from "@/lib/knowledge/parsers/parser-types";

export interface HeadingDetectionResult {
  isHeading: boolean;
  level?: number;
  sectionNumber?: string;
  confidence: number;
  reason: string;
}

export interface ReferenceDetectionResult {
  isReference: boolean;
  confidence: number;
  reason: string;
}

export interface NormalizedKnowledgeBlock extends KnowledgeDocumentBlock {
  normalizedText: string;
  headingConfidence?: number;
  referenceConfidence?: number;
  parentHeadingId?: string;
  sectionId?: string;
}

export interface NormalizedKnowledgeSection {
  id: string;
  documentId: string;
  title: string;
  sectionNumber?: string;
  level: number;
  order: number;
  pageStart?: number;
  pageEnd?: number;
  parentSectionId?: string;
  blockIds: string[];
  text: string;
}

export interface NormalizedKnowledgeDocument {
  documentId: string;
  sourcePath: string;
  relativePath: string;
  fileName: string;
  format: KnowledgeDocumentFormat;
  title: string;
  language: string;
  pageCount: number;
  blocks: NormalizedKnowledgeBlock[];
  sections: NormalizedKnowledgeSection[];
  fullText: string;
  metadata: Record<string, string | number | boolean | null>;
  warnings: string[];
  parsedAt: string;
  normalizedAt: string;
  parserName: string;
  parserVersion: string;
  normalizerName: string;
  normalizerVersion: string;
}

export interface DocumentNormalizationResult {
  source: ParsedKnowledgeDocument;
  document: NormalizedKnowledgeDocument;
}