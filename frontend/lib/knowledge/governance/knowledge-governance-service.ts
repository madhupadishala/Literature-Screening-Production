import { resolveNextStatus } from "./knowledge-approval-workflow";

import type {
  CreateGovernanceRecordInput,
  GovernanceActionInput,
  KnowledgeGovernanceAuditEvent,
  KnowledgeGovernanceRecord,
  KnowledgeGovernanceStatus,
} from "./knowledge-governance-types";

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

class KnowledgeGovernanceService {
  private records = new Map<string, KnowledgeGovernanceRecord>();
  private auditEvents: KnowledgeGovernanceAuditEvent[] = [];

  createRecord(input: CreateGovernanceRecordInput): KnowledgeGovernanceRecord {
    const now = new Date().toISOString();

    const record: KnowledgeGovernanceRecord = {
      id: createId("kgov"),
      knowledgeDocumentId: input.knowledgeDocumentId,
      tenantId: input.tenantId,
      status: "draft",
      version: input.version,
      effectiveDate: input.effectiveDate,
      reviewDueDate: input.reviewDueDate,
      trainingRequired: input.trainingRequired ?? false,
      reviewer: input.reviewer,
      approver: input.approver,
      createdAt: now,
      updatedAt: now,
    };

    this.records.set(record.id, record);
    return record;
  }

  applyAction(input: GovernanceActionInput) {
    const existing = this.records.get(input.governanceRecordId);

    if (!existing) {
      throw new Error("Knowledge governance record not found");
    }

    const nextStatus = resolveNextStatus(existing.status, input.action);

    const updated: KnowledgeGovernanceRecord = {
      ...existing,
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    };

    this.records.set(updated.id, updated);

    const auditEvent: KnowledgeGovernanceAuditEvent = {
      id: createId("kgov_audit"),
      governanceRecordId: updated.id,
      action: input.action,
      actor: input.actor,
      comment: input.comment,
      createdAt: new Date().toISOString(),
    };

    this.auditEvents.unshift(auditEvent);

    return {
      record: updated,
      auditEvent,
    };
  }

  listRecords() {
    return Array.from(this.records.values()).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }

  listAuditEvents(limit = 50) {
    return this.auditEvents.slice(0, limit);
  }

  getStatus(): KnowledgeGovernanceStatus {
    const records = this.listRecords();

    return {
      totalRecords: records.length,
      inReview: records.filter((item) => item.status === "in_review").length,
      approved: records.filter((item) => item.status === "approved").length,
      effective: records.filter((item) => item.status === "effective").length,
      trainingRequired: records.filter((item) => item.trainingRequired).length,
    };
  }
}

export const knowledgeGovernanceService = new KnowledgeGovernanceService();