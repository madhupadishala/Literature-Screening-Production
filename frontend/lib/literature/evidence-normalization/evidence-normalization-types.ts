export type EvidenceSourceType =
  | "pubmed_metadata"
  | "abstract"
  | "full_text_pdf"
  | "html"
  | "xml"
  | "ocr_output"
  | "translation"
  | "manual_upload";

export interface RawEvidenceInput {
  tenantId: string;
  sourceId: string;
  sourceType: EvidenceSourceType;
  title?: string;
  originalLanguage?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface NormalizedEvidencePackage {
  id: string;
  tenantId: string;
  sourceId: string;
  sourceType: EvidenceSourceType;
  title: string;
  language: string;
  normalizedText: string;
  metadata: Record<string, unknown>;
  normalizedAt: string;
}

export interface EvidenceNormalizationResult {
  package: NormalizedEvidencePackage;
  warnings: string[];
}

export interface EvidenceNormalizationStatus {
  totalPackages: number;
  warningCount: number;
}