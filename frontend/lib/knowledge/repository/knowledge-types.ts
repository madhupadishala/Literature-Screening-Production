export type KnowledgeCategory =
  | "regulatory_guidance"
  | "sop"
  | "work_instruction"
  | "business_rule"
  | "product_master"
  | "template"
  | "prompt_document"
  | "training_material"
  | "operational_knowledge";

export type KnowledgeStatus =
  | "draft"
  | "active"
  | "superseded"
  | "retired";

export interface KnowledgeDocument {
  id: string;
  tenantId?: string;
  title: string;
  category: KnowledgeCategory;
  version: string;
  status: KnowledgeStatus;
  sourceAuthority?: string;
  country?: string;
  language?: string;
  effectiveDate?: string;
  expiryDate?: string;
  tags: string[];
  summary?: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateKnowledgeDocumentInput {
  tenantId?: string;
  title: string;
  category: KnowledgeCategory;
  version: string;
  sourceAuthority?: string;
  country?: string;
  language?: string;
  effectiveDate?: string;
  tags?: string[];
  summary?: string;
  content: string;
}

export interface KnowledgeRepositoryStatus {
  totalDocuments: number;
  activeDocuments: number;
  globalDocuments: number;
  tenantDocuments: number;
}