import type { AIProviderType } from "./ai-types";

export type AIAuditStatus = "SUCCESS" | "FAILED" | "FALLBACK";

export interface AIAuditRecord {
  id: string;
  operation: "hits" | "screening" | "health" | "self_test";
  status: AIAuditStatus;
  tenantId?: string;
  articleId?: string;
  pmid?: string;
  provider?: AIProviderType;
  model?: string;
  requestId: string;
  correlationId?: string;
  attempts?: number;
  latencyMs?: number;
  decision?: string;
  confidence?: number;
  errorCode?: string;
  errorMessage?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

const MAX_RECORDS = 1_000;
const auditRecords: AIAuditRecord[] = [];

function createAuditId(): string {
  return `ai-audit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function recordAIAudit(
  input: Omit<AIAuditRecord, "id" | "createdAt">,
): AIAuditRecord {
  const record: AIAuditRecord = {
    ...input,
    id: createAuditId(),
    createdAt: new Date().toISOString(),
  };

  auditRecords.unshift(record);

  if (auditRecords.length > MAX_RECORDS) {
    auditRecords.length = MAX_RECORDS;
  }

  return record;
}

export function listAIAuditRecords(limit = 100): AIAuditRecord[] {
  const safeLimit = Number.isFinite(limit) && limit > 0
    ? Math.min(Math.floor(limit), MAX_RECORDS)
    : 100;

  return auditRecords.slice(0, safeLimit);
}

export function clearAIAuditRecords(): void {
  auditRecords.length = 0;
}
