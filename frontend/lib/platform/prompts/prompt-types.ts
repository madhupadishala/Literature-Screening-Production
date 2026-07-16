export type PromptCategory =
  | "hits"
  | "screening"
  | "intake"
  | "rag"
  | "embedding"
  | "coding"
  | "narrative"
  | "assessment"
  | "system";

export interface PromptTemplate {
  id: string;
  name: string;
  category: PromptCategory;
  version: string;
  description?: string;
  systemPrompt: string;
  userPrompt: string;
  variables: string[];
  tenantId?: string;
  active: boolean;
  createdAt: string;
}

export interface PromptRequest {
  category: PromptCategory;
  tenantId?: string;
}

export interface PromptStatus {
  totalPrompts: number;
  activePrompts: number;
  tenantOverrides: number;
}