export type DatabaseTableName =
  | "tenants"
  | "users"
  | "roles"
  | "permissions"
  | "workflow_items"
  | "assignments"
  | "audit_logs"
  | "versions"
  | "knowledge_items"
  | "vector_documents"
  | "rag_contexts"
  | "ai_results"
  | "reviews"
  | "evidence_packages"
  | "notifications"
  | "report_metrics"
  | "import_jobs"
  | "export_jobs"
  | "feature_flags"
  | "system_configurations";

export interface DatabaseEntity {
  id: string;
  tenantId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseRecord extends DatabaseEntity {
  [key: string]: unknown;
}

export interface DatabaseQuery {
  table: DatabaseTableName;
  tenantId?: string;
  filters?: Record<string, unknown>;
  limit?: number;
  offset?: number;
}

export interface DatabaseMutationResult<T extends DatabaseRecord> {
  success: boolean;
  record?: T;
  records?: T[];
  message?: string;
}

export interface DatabaseHealth {
  provider: string;
  connected: boolean;
  latencyMs: number;
  checkedAt: string;
}