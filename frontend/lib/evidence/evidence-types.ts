import type { RAGMergedContext } from "@/lib/rag/rag-types";
import type { ReviewRecord } from "@/lib/review/review-types";

export type EvidencePackageStatus =
  | "draft"
  | "reviewed"
  | "approved"
  | "archived";

export interface EvidencePackageMetadata {
  packageId: string;
  tenantId: string;

  articleId?: string;

  packageVersion: number;

  packageHash: string;

  createdAt: string;

  generatedBy: string;

  status: EvidencePackageStatus;
}

export interface EvidenceArticleInformation {
  title?: string;
  abstract?: string;
  journal?: string;
  pmid?: string;
  doi?: string;
  publicationDate?: string;

  authors: string[];

  country?: string;

  hasFullText: boolean;
}

export interface EvidenceAIRuntime {
  agentName: string;

  agentVersion: string;

  modelName: string;

  modelVersion: string;

  promptVersion: string;

  confidence: number;

  executedAt: string;
}

export interface EvidencePackage {
  metadata: EvidencePackageMetadata;

  article: EvidenceArticleInformation;

  ragContext: RAGMergedContext;

  aiExecution: EvidenceAIRuntime;

  aiResult: unknown;

  review?: ReviewRecord;

  auditReferences: string[];

  notes: string[];
}