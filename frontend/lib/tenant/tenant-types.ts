export type TenantStatus = "active" | "inactive" | "sandbox";

export type LiteratureRunMode = "manual" | "scheduled" | "hybrid";

export type KnowledgeSourceType =
  | "sop"
  | "work_instruction"
  | "product_rules"
  | "calendar_rules"
  | "prompt_rules"
  | "client_guidance"
  | "regulatory_reference";

export type PromptArea =
  | "hit_generation"
  | "screening"
  | "intake"
  | "qc"
  | "narrative"
  | "assessment"
  | "audit";

export interface TenantProduct {
  id: string;
  productName: string;
  genericName?: string;
  brandNames?: string[];
  synonyms?: string[];
  companySuspect: boolean;
  active: boolean;
}

export interface TenantCalendarEntry {
  id: string;
  productId: string;
  productName: string;
  searchDay: string;
  frequency: "daily" | "weekly" | "monthly" | "ad_hoc";
  runMode: LiteratureRunMode;
  active: boolean;
}

export interface TenantKnowledgeSource {
  id: string;
  title: string;
  type: KnowledgeSourceType;
  fileName?: string;
  version?: string;
  effectiveDate?: string;
  active: boolean;
}

export interface TenantPromptConfiguration {
  id: string;
  area: PromptArea;
  name: string;
  instruction: string;
  version: string;
  active: boolean;
}

export interface TenantFeatureFlags {
  enableKnowledgeRouting: boolean;
  enableBulkOperations: boolean;
  enableVersioning: boolean;
  enableAuditReview: boolean;
  enableQcWorkflow: boolean;
}

export interface TenantConfiguration {
  id: string;
  tenantName: string;
  displayName: string;
  status: TenantStatus;
  environment: "TEST" | "PROD";
  productMaster: TenantProduct[];
  literatureCalendar: TenantCalendarEntry[];
  knowledgeSources: TenantKnowledgeSource[];
  promptConfigurations: TenantPromptConfiguration[];
  featureFlags: TenantFeatureFlags;
  createdAt: string;
  updatedAt: string;
}

export interface TenantConfigResponse {
  tenants: TenantConfiguration[];
  activeTenantId: string | null;
}

export interface TenantConfigUpdateRequest {
  tenant: TenantConfiguration;
}