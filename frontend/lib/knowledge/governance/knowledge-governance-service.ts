import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";
import { resolveNextStatus } from "./knowledge-approval-workflow";
import type {
  CreateGovernanceRecordInput,
  GovernanceActionInput,
  KnowledgeGovernanceAuditEvent,
  KnowledgeGovernanceRecord,
  KnowledgeGovernanceStatus,
} from "./knowledge-governance-types";

interface GovernanceRow {
  id: string;
  knowledge_document_id: string;
  tenant_id: string;
  status: KnowledgeGovernanceRecord["status"];
  version_label: string;
  effective_date: string | null;
  review_due_date: string | null;
  training_required: boolean;
  reviewer: string | null;
  approver: string | null;
  record_version: number;
  created_at: Date;
  updated_at: Date;
}

interface GovernanceEventRow {
  id: string;
  tenant_id: string;
  governance_record_id: string;
  action: KnowledgeGovernanceAuditEvent["action"];
  actor_name: string;
  comment: string | null;
  created_at: Date;
}

function toRecord(row: GovernanceRow): KnowledgeGovernanceRecord {
  return {
    id: row.id,
    knowledgeDocumentId: row.knowledge_document_id,
    tenantId: row.tenant_id,
    status: row.status,
    version: row.version_label,
    effectiveDate: row.effective_date ?? undefined,
    reviewDueDate: row.review_due_date ?? undefined,
    trainingRequired: row.training_required,
    reviewer: row.reviewer ?? undefined,
    approver: row.approver ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toEvent(row: GovernanceEventRow): KnowledgeGovernanceAuditEvent {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    governanceRecordId: row.governance_record_id,
    action: row.action,
    actor: row.actor_name,
    comment: row.comment ?? undefined,
    createdAt: row.created_at.toISOString(),
  };
}

class KnowledgeGovernanceService {
  async createRecord(
    input: CreateGovernanceRecordInput,
    actorId?: string,
    requestId?: string | null,
  ): Promise<KnowledgeGovernanceRecord> {
    const client = await getPostgresPool().connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<GovernanceRow>(
        `INSERT INTO knowledge_governance_records (
           tenant_id, knowledge_document_id, version_label, effective_date,
           review_due_date, training_required, reviewer, approver, created_by, updated_by
         ) SELECT $1, document.id, $3, $4, $5, $6, $7, $8, $9, $9
             FROM knowledge_documents document
            WHERE document.id = $2 AND document.tenant_id = $1
         ON CONFLICT (tenant_id, knowledge_document_id, version_label)
         DO UPDATE SET updated_at = now()
         RETURNING *`,
        [input.tenantId, input.knowledgeDocumentId, input.version,
          input.effectiveDate ?? null, input.reviewDueDate ?? null,
          input.trainingRequired ?? false, input.reviewer ?? null,
          input.approver ?? null, actorId ?? null],
      );
      if (!result.rows[0]) throw new Error("Knowledge document not found.");
      await client.query(
        `INSERT INTO audit_events (
           tenant_id, actor_id, event_type, event_category, outcome, request_id, details
         ) VALUES ($1, $2, 'KNOWLEDGE_GOVERNANCE_CREATED', 'KNOWLEDGE_GOVERNANCE',
           'success', $3, $4::jsonb)`,
        [input.tenantId, actorId ?? null, requestId ?? null,
          JSON.stringify({ governanceRecordId: result.rows[0].id,
            knowledgeDocumentId: input.knowledgeDocumentId, version: input.version })],
      );
      await client.query("COMMIT");
      return toRecord(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async applyAction(
    input: GovernanceActionInput,
    actorId?: string,
    requestId?: string | null,
  ): Promise<{ record: KnowledgeGovernanceRecord; auditEvent: KnowledgeGovernanceAuditEvent }> {
    const client = await getPostgresPool().connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<GovernanceRow>(
        `SELECT * FROM knowledge_governance_records
          WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [input.tenantId, input.governanceRecordId],
      );
      if (!current.rows[0]) throw new Error("Knowledge governance record not found");
      const fromStatus = current.rows[0].status;
      const nextStatus = resolveNextStatus(fromStatus, input.action);
      const updated = await client.query<GovernanceRow>(
        `UPDATE knowledge_governance_records SET status = $3,
           record_version = record_version + 1, updated_by = $4, updated_at = now()
         WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        [input.tenantId, input.governanceRecordId, nextStatus, actorId ?? null],
      );
      const event = await client.query<GovernanceEventRow>(
        `INSERT INTO knowledge_governance_events (
           tenant_id, governance_record_id, action, actor_id, actor_name,
           comment, from_status, to_status, record_version
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [input.tenantId, input.governanceRecordId, input.action, actorId ?? null,
          input.actor, input.comment ?? null, fromStatus, nextStatus,
          updated.rows[0].record_version],
      );
      await client.query(
        `INSERT INTO audit_events (
           tenant_id, actor_id, event_type, event_category, outcome, request_id, details
         ) VALUES ($1, $2, 'KNOWLEDGE_GOVERNANCE_TRANSITION', 'KNOWLEDGE_GOVERNANCE',
           'success', $3, $4::jsonb)`,
        [input.tenantId, actorId ?? null, requestId ?? null,
          JSON.stringify({ governanceRecordId: input.governanceRecordId,
            action: input.action, fromStatus, toStatus: nextStatus,
            recordVersion: updated.rows[0].record_version })],
      );
      await client.query("COMMIT");
      return { record: toRecord(updated.rows[0]), auditEvent: toEvent(event.rows[0]) };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listRecords(tenantId: string): Promise<KnowledgeGovernanceRecord[]> {
    const result = await getPostgresPool().query<GovernanceRow>(
      `SELECT * FROM knowledge_governance_records WHERE tenant_id = $1 ORDER BY updated_at DESC`,
      [tenantId],
    );
    return result.rows.map(toRecord);
  }

  async listAuditEvents(tenantId: string, limit = 50): Promise<KnowledgeGovernanceAuditEvent[]> {
    const result = await getPostgresPool().query<GovernanceEventRow>(
      `SELECT * FROM knowledge_governance_events
        WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [tenantId, Math.min(200, Math.max(1, limit))],
    );
    return result.rows.map(toEvent);
  }

  async getStatus(tenantId: string): Promise<KnowledgeGovernanceStatus> {
    const result = await getPostgresPool().query<{
      total: string; in_review: string; approved: string; effective: string; training_required: string;
    }>(
      `SELECT count(*) AS total,
         count(*) FILTER (WHERE status = 'in_review') AS in_review,
         count(*) FILTER (WHERE status = 'approved') AS approved,
         count(*) FILTER (WHERE status = 'effective') AS effective,
         count(*) FILTER (WHERE training_required) AS training_required
       FROM knowledge_governance_records WHERE tenant_id = $1`,
      [tenantId],
    );
    const row = result.rows[0];
    return { totalRecords: Number(row.total), inReview: Number(row.in_review),
      approved: Number(row.approved), effective: Number(row.effective),
      trainingRequired: Number(row.training_required) };
  }
}

export const knowledgeGovernanceService = new KnowledgeGovernanceService();
