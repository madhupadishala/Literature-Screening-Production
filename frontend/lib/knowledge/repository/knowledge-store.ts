import "server-only";

import { createHash } from "node:crypto";
import { getPostgresPool } from "@/lib/database/postgres";
import type {
  CreateKnowledgeDocumentInput,
  KnowledgeDocument,
  KnowledgeRepositoryStatus,
  KnowledgeStatus,
} from "./knowledge-types";

interface KnowledgeRow {
  id: string;
  tenant_id: string;
  title: string;
  source_type: KnowledgeDocument["category"];
  source_reference: string | null;
  effective_from: string | null;
  effective_to: string | null;
  version_label: string;
  governance_status: "draft" | "approved" | "effective" | "superseded" | "retired";
  metadata: Record<string, unknown>;
  content_sha256: string;
  content: string;
  created_at: Date;
  updated_at: Date;
}

function apiStatus(status: KnowledgeRow["governance_status"]): KnowledgeStatus {
  return status === "effective" || status === "approved" ? "active" : status;
}

function toDocument(row: KnowledgeRow): KnowledgeDocument {
  const metadata = row.metadata ?? {};
  return {
    id: row.id,
    tenantId: row.tenant_id,
    title: row.title,
    category: row.source_type,
    version: row.version_label,
    status: apiStatus(row.governance_status),
    sourceAuthority: row.source_reference ?? undefined,
    country: typeof metadata.country === "string" ? metadata.country : undefined,
    language: typeof metadata.language === "string" ? metadata.language : "en",
    effectiveDate: row.effective_from ?? undefined,
    expiryDate: row.effective_to ?? undefined,
    tags: Array.isArray(metadata.tags) ? metadata.tags.map(String) : [],
    summary: typeof metadata.summary === "string" ? metadata.summary : undefined,
    content: row.content,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const selectDocument = `
  SELECT document.*, chunk.content
    FROM knowledge_documents document
    JOIN knowledge_chunks chunk ON chunk.document_id = document.id AND chunk.chunk_index = 0
`;

class KnowledgeStore {
  async create(
    input: CreateKnowledgeDocumentInput,
    actorId?: string,
    requestId?: string | null,
  ): Promise<KnowledgeDocument> {
    if (!input.tenantId) throw new Error("tenantId is required.");
    const client = await getPostgresPool().connect();
    const contentSha256 = createHash("sha256").update(input.content).digest("hex");
    const documentKey = createHash("sha256")
      .update(`${input.category}:${input.title.trim().toLowerCase()}`)
      .digest("hex").slice(0, 32);
    try {
      await client.query("BEGIN");
      const document = await client.query<{ id: string }>(
        `INSERT INTO knowledge_documents (
           tenant_id, document_key, title, source_type, source_reference,
           effective_from, version_label, governance_status, metadata,
           content_sha256, created_by, updated_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8::jsonb, $9, $10, $10)
         ON CONFLICT (tenant_id, document_key, version_label) DO NOTHING
         RETURNING id`,
        [input.tenantId, documentKey, input.title, input.category,
          input.sourceAuthority ?? null, input.effectiveDate ?? null, input.version,
          JSON.stringify({ country: input.country ?? null, language: input.language ?? "en",
            tags: input.tags ?? [], summary: input.summary ?? null }),
          contentSha256, actorId ?? null],
      );
      if (!document.rows[0]) throw new Error("Knowledge document version conflict.");
      await client.query(
        `INSERT INTO knowledge_chunks (
           tenant_id, document_id, chunk_index, content, content_sha256, chunk_key, metadata
         ) VALUES ($1, $2, 0, $3, $4, $5, $6::jsonb)`,
        [input.tenantId, document.rows[0].id, input.content, contentSha256,
          `${document.rows[0].id}:full`, JSON.stringify({ canonical: true })],
      );
      await client.query(
        `INSERT INTO audit_events (
           tenant_id, actor_id, event_type, event_category, outcome, request_id, details
         ) VALUES ($1, $2, 'KNOWLEDGE_DOCUMENT_CREATED', 'KNOWLEDGE_REPOSITORY',
           'success', $3, $4::jsonb)`,
        [input.tenantId, actorId ?? null, requestId ?? null,
          JSON.stringify({ documentId: document.rows[0].id, documentKey,
            version: input.version, contentSha256 })],
      );
      const result = await client.query<KnowledgeRow>(
        `${selectDocument} WHERE document.tenant_id = $1 AND document.id = $2`,
        [input.tenantId, document.rows[0].id],
      );
      await client.query("COMMIT");
      return toDocument(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateStatus(input: {
    tenantId: string;
    id: string;
    action: "activate" | "supersede";
    actorId?: string;
    requestId?: string | null;
  }): Promise<KnowledgeDocument | null> {
    const client = await getPostgresPool().connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{ governance_status: string }>(
        `SELECT governance_status FROM knowledge_documents
          WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [input.tenantId, input.id],
      );
      if (!current.rows[0]) { await client.query("ROLLBACK"); return null; }
      const expected = input.action === "activate" ? "draft" : "effective";
      const next = input.action === "activate" ? "effective" : "superseded";
      if (current.rows[0].governance_status !== expected) {
        throw new Error(`Invalid knowledge lifecycle transition from ${current.rows[0].governance_status}.`);
      }
      await client.query(
        `UPDATE knowledge_documents SET governance_status = $3, updated_by = $4, updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [input.tenantId, input.id, next, input.actorId ?? null],
      );
      await client.query(
        `INSERT INTO audit_events (
           tenant_id, actor_id, event_type, event_category, outcome, request_id, details
         ) VALUES ($1, $2, 'KNOWLEDGE_DOCUMENT_STATUS_CHANGED', 'KNOWLEDGE_REPOSITORY',
           'success', $3, $4::jsonb)`,
        [input.tenantId, input.actorId ?? null, input.requestId ?? null,
          JSON.stringify({ documentId: input.id, action: input.action,
            fromStatus: expected, toStatus: next })],
      );
      const result = await client.query<KnowledgeRow>(
        `${selectDocument} WHERE document.tenant_id = $1 AND document.id = $2`,
        [input.tenantId, input.id],
      );
      await client.query("COMMIT");
      return toDocument(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async get(tenantId: string, id: string): Promise<KnowledgeDocument | null> {
    const result = await getPostgresPool().query<KnowledgeRow>(
      `${selectDocument} WHERE document.tenant_id = $1 AND document.id = $2`,
      [tenantId, id],
    );
    return result.rows[0] ? toDocument(result.rows[0]) : null;
  }

  async list(tenantId: string): Promise<KnowledgeDocument[]> {
    const result = await getPostgresPool().query<KnowledgeRow>(
      `${selectDocument} WHERE document.tenant_id = $1 ORDER BY document.updated_at DESC`,
      [tenantId],
    );
    return result.rows.map(toDocument);
  }

  async getStatus(tenantId: string): Promise<KnowledgeRepositoryStatus> {
    const result = await getPostgresPool().query<{
      total: string; active: string; tenant_documents: string;
    }>(
      `SELECT count(*) AS total,
         count(*) FILTER (WHERE governance_status IN ('approved', 'effective')) AS active,
         count(*) AS tenant_documents
       FROM knowledge_documents WHERE tenant_id = $1`,
      [tenantId],
    );
    return { totalDocuments: Number(result.rows[0].total),
      activeDocuments: Number(result.rows[0].active), globalDocuments: 0,
      tenantDocuments: Number(result.rows[0].tenant_documents) };
  }
}

export const knowledgeStore = new KnowledgeStore();
