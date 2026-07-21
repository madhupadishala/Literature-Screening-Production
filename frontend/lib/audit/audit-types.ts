export type AuditSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface AuditUser {
  id?: string;
  name: string;
  role: string;
}

export interface AuditRecord {
  id: string;
  eventType: string;
  eventCategory: string;
  outcome: string;
  severity: AuditSeverity;
  packageId?: string;
  packageKey?: string;
  performedBy: AuditUser;
  performedAt: string;
  requestId?: string;
  correlationId?: string;
  ipAddress?: string;
  details: Record<string, unknown>;
}

export interface AuditSearchFilters {
  packageId?: string;
  actorId?: string;
  eventType?: string;
  eventCategory?: string;
  outcome?: string;
  severity?: AuditSeverity | "ALL";
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface AuditSearchResult {
  total: number;
  page: number;
  pageSize: number;
  records: AuditRecord[];
}
