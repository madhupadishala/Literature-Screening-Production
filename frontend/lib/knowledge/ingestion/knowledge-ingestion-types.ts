export type KnowledgeLayer =
  | "clinixai"
  | "regulatory"
  | "customer";

export type KnowledgeFileCategory =
  | "sop"
  | "work_instruction"
  | "business_rule"
  | "product_rule"
  | "search_rule"
  | "translation_rule"
  | "prompt_rule"
  | "template"
  | "regulatory_guidance"
  | "product_master"
  | "dictionary"
  | "literature_calendar"
  | "customer_rule"
  | "unknown";

export type RegulatoryAuthority =
  | "EMA"
  | "FDA"
  | "MHRA"
  | "PMDA"
  | "ICH"
  | "CIOMS"
  | "UNKNOWN";

export type KnowledgeIngestionFileStatus =
  | "discovered"
  | "processed"
  | "unchanged"
  | "unsupported"
  | "failed";

export interface DiscoveredKnowledgeFile {
  absolutePath: string;
  relativePath: string;
  fileName: string;
  extension: string;
  sizeBytes: number;
  modifiedAt: string;
  layer: KnowledgeLayer;
  category: KnowledgeFileCategory;
  authority: RegulatoryAuthority;
  tenantId?: string;
}

export interface ReadKnowledgeContent {
  text: string;
  detectedFormat: string;
  warnings: string[];
}

export interface KnowledgeIngestionRecord {
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
  contentLength: number;
  status: KnowledgeIngestionFileStatus;
  warnings: string[];
  error?: string;
  processedAt: string;
}

export interface KnowledgeIngestionManifest {
  schemaVersion: "1.0";
  updatedAt: string;
  records: Record<string, KnowledgeIngestionRecord>;
}

export interface KnowledgeIngestionRunResult {
  runId: string;
  rootPath: string;
  startedAt: string;
  completedAt: string;
  discovered: number;
  processed: number;
  unchanged: number;
  unsupported: number;
  failed: number;
  records: KnowledgeIngestionRecord[];
}