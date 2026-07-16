export type KnowledgeDocumentFormat =
  | "pdf"
  | "docx"
  | "html"
  | "xml"
  | "csv"
  | "xlsx"
  | "json"
  | "markdown"
  | "text";

export type KnowledgeBlockType =
  | "heading"
  | "paragraph"
  | "list_item"
  | "table"
  | "reference"
  | "page_break"
  | "unknown";

export interface KnowledgeParserInput {
  absolutePath: string;
  relativePath: string;
  fileName: string;
  extension: string;
  checksum?: string;
  tenantId?: string;
}

export interface KnowledgeTextPosition {
  pageNumber?: number;
  order: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface KnowledgeDocumentBlock {
  id: string;
  type: KnowledgeBlockType;
  text: string;
  level?: number;
  sectionNumber?: string;
  position: KnowledgeTextPosition;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface KnowledgeDocumentPage {
  pageNumber: number;
  width?: number;
  height?: number;
  text: string;
  blocks: KnowledgeDocumentBlock[];
}

export interface ParsedKnowledgeDocument {
  documentId: string;
  sourcePath: string;
  relativePath: string;
  fileName: string;
  format: KnowledgeDocumentFormat;
  title: string;
  language: string;
  pageCount: number;
  pages: KnowledgeDocumentPage[];
  blocks: KnowledgeDocumentBlock[];
  fullText: string;
  metadata: Record<string, string | number | boolean | null>;
  warnings: string[];
  parsedAt: string;
  parserName: string;
  parserVersion: string;
}

export interface KnowledgeParserSupport {
  extensions: string[];
  formats: KnowledgeDocumentFormat[];
}

export class KnowledgeParserError extends Error {
  constructor(
    message: string,
    readonly code:
      | "FILE_NOT_FOUND"
      | "UNSUPPORTED_FORMAT"
      | "EMPTY_DOCUMENT"
      | "INVALID_DOCUMENT"
      | "PARSER_FAILURE",
    readonly filePath: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "KnowledgeParserError";
  }
}