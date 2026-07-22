import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";
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

export async function recordAIAudit(
  input: Omit<AIAuditRecord, "id" | "createdAt">,
): Promise<AIAuditRecord> {
  if (!input.tenantId) throw new Error("AI audit requires tenantId.");

  const persisted = await getPostgresPool().query<{ id: string; occurred_at: Date }>(
    `INSERT INTO audit_events (
       tenant_id, event_type, event_category, outcome, request_id, correlation_id, details
     ) VALUES ($1, $2, 'AI_GOVERNANCE', $3, $4, $5, $6::jsonb)
     RETURNING id, occurred_at`,
    [
      input.tenantId,
      `AI_${input.operation.toUpperCase()}_${input.status}`,
      input.status === "FAILED" ? "failure" : "success",
      input.requestId,
      input.correlationId || null,
      JSON.stringify({
        operation: input.operation,
        articleId: input.articleId || null,
        pmid: input.pmid || null,
        provider: input.provider || null,
        model: input.model || null,
        attempts: input.attempts || null,
        latencyMs: input.latencyMs || null,
        decision: input.decision || null,
        confidence: input.confidence ?? null,
        errorCode: input.errorCode || null,
        errorMessage: input.errorMessage || null,
        ...input.metadata,
      }),
    ],
  );

  const record: AIAuditRecord = {
    ...input,
    id: persisted.rows[0].id,
    createdAt: persisted.rows[0].occurred_at.toISOString(),
  };
  auditRecords.unshift(record);
  if (auditRecords.length > MAX_RECORDS) auditRecords.length = MAX_RECORDS;
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
