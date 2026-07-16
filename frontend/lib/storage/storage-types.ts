export type StorageProvider =
  | "memory-development"
  | "aws-s3"
  | "cloudflare-r2"
  | "supabase-storage"
  | "azure-blob"
  | "minio";

export type DocumentCategory =
  | "source"
  | "ai"
  | "evidence"
  | "output"
  | "knowledge"
  | "prompt"
  | "audit"
  | "integration";

export type DocumentType =
  | "line_listing"
  | "source_pdf"
  | "html"
  | "xml"
  | "ocr_output"
  | "image"
  | "evidence_package"
  | "export_package"
  | "sop"
  | "knowledge_document"
  | "prompt_template"
  | "audit_attachment"
  | "argus_attachment";

export type DocumentStatus =
  | "active"
  | "archived"
  | "deleted";

export type RetentionPolicy =
  | "retain"
  | "temporary"
  | "selective"
  | "regenerable";

export interface StorageObject {
  key: string;
  bucket: string;
  provider: StorageProvider;
  contentType: string;
  sizeBytes: number;
  checksum?: string;
  createdAt: string;
  metadata?: Record<string, string>;
}

export interface UploadDocumentInput {
  tenantId: string;
  category: DocumentCategory;
  documentType: DocumentType;
  fileName: string;
  contentType: string;
  content: string;
  module?: string;
  sourceId?: string;
  pmid?: string;
  doi?: string;
  evidencePackageId?: string;
  createdBy?: string;
  retentionPolicy?: RetentionPolicy;
  metadata?: Record<string, string>;
}

export interface DocumentRegistryRecord {
  id: string;
  tenantId: string;
  category: DocumentCategory;
  documentType: DocumentType;
  fileName: string;
  contentType: string;
  storageKey: string;
  storageBucket: string;
  storageProvider: StorageProvider;
  sizeBytes: number;
  checksum?: string;
  version: number;
  status: DocumentStatus;
  module?: string;
  sourceId?: string;
  pmid?: string;
  doi?: string;
  evidencePackageId?: string;
  createdBy?: string;
  retentionPolicy: RetentionPolicy;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, string>;
}

export interface StorageHealth {
  provider: StorageProvider;
  bucket: string;
  connected: boolean;
  checkedAt: string;
}