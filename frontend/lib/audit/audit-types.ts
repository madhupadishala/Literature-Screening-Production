export type AuditModule =
  | "LITERATURE"
  | "MICC"
  | "REGULATORY"
  | "CLINICAL_TRIAL"
  | "LEGAL"
  | "SOCIAL_MEDIA"
  | "ADMIN"
  | "SYSTEM";

export type AuditEntityType =
  | "PACKAGE"
  | "ARTICLE"
  | "USER"
  | "TENANT"
  | "WORKFLOW"
  | "PRODUCT"
  | "KNOWLEDGE"
  | "SESSION"
  | "CONFIGURATION";

export type AuditSeverity = "INFO" | "WARNING" | "CRITICAL";

export type AuditAction =
  | "CREATED"
  | "UPDATED"
  | "DELETED"
  | "VIEWED"
  | "ASSIGNED"
  | "REASSIGNED"
  | "LOCKED"
  | "UNLOCKED"
  | "ROUTED"
  | "ROUTED_BACK"
  | "OVERRIDDEN"
  | "APPROVED"
  | "REJECTED"
  | "EXPORTED"
  | "LOGIN"
  | "LOGOUT"
  | "SYSTEM_EVENT";

export type AuditUser = {
  id: string;
  name: string;
  role: string;
  tenantId: string;
};

export type AuditRecord = {
  id: string;
  module: AuditModule;
  entityType: AuditEntityType;
  entityId: string;
  packageId?: string;
  action: AuditAction;
  severity: AuditSeverity;
  title: string;
  description: string;
  performedBy: AuditUser;
  performedAt: string;
  workflowStage?: string;
  previousValue?: string;
  newValue?: string;
  ipAddress?: string;
  userAgent?: string;
};

export type AuditSearchFilters = {
  packageId?: string;
  userId?: string;
  tenantId?: string;
  module?: AuditModule | "ALL";
  action?: AuditAction | "ALL";
  severity?: AuditSeverity | "ALL";
  workflowStage?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
};

export type AuditSearchResult = {
  total: number;
  page: number;
  pageSize: number;
  records: AuditRecord[];
};