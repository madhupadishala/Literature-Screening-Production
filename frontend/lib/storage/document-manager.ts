import "server-only";

import { createHash } from "node:crypto";
import { getPostgresPool } from "@/lib/database/postgres";
import type { DocumentRegistryRecord, UploadDocumentInput } from "./storage-types";

interface DocumentRow {
  id: string;
  tenant_id: string;
  category: DocumentRegistryRecord["category"];
  document_type: DocumentRegistryRecord["documentType"];
  file_name: string;
  content_type: string;
  storage_key: string;
  size_bytes: string;
  sha256: string;
  document_version: number;
  status: DocumentRegistryRecord["status"];
  module: string | null;
  source_id: string | null;
  pmid: string | null;
  doi: string | null;
  evidence_package_id: string | null;
  created_by: string | null;
  retention_policy: DocumentRegistryRecord["retentionPolicy"];
  metadata: Record<string, string>;
  created_at: Date;
  updated_at: Date;
}

function toRecord(row: DocumentRow): DocumentRegistryRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    category: row.category,
    documentType: row.document_type,
    fileName: row.file_name,
    contentType: row.content_type,
    storageKey: row.storage_key,
    storageBucket: "postgresql",
    storageProvider: "postgresql",
    sizeBytes: Number(row.size_bytes),
    checksum: row.sha256,
    version: row.document_version,
    status: row.status,
    module: row.module ?? undefined,
    sourceId: row.source_id ?? undefined,
    pmid: row.pmid ?? undefined,
    doi: row.doi ?? undefined,
    evidencePackageId: row.evidence_package_id ?? undefined,
    createdBy: row.created_by ?? undefined,
    retentionPolicy: row.retention_policy,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    metadata: row.metadata,
  };
}

export class DocumentManager {
  async upload(input: UploadDocumentInput & { requestId?: string | null }): Promise<DocumentRegistryRecord> {
    if (!input.tenantId) throw new Error("tenantId is required.");
    if (!input.fileName.trim()) throw new Error("fileName is required.");
    if (!input.contentType.trim()) throw new Error("contentType is required.");

    const bytes = Buffer.from(input.content, "utf8");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const client = await getPostgresPool().connect();
    try {
      await client.query("BEGIN");
      const document = await client.query<DocumentRow>(
        `INSERT INTO stored_documents (
           tenant_id, category, document_type, file_name, content_type, storage_key,
           size_bytes, sha256, module, source_id, pmid, doi, evidence_package_id,
           retention_policy, retention_until, metadata, created_by
         ) VALUES ($1, $2, $3, $4, $5, gen_random_uuid()::text, $6, $7,
           $8, $9, $10, $11, $12, $13,
           CASE WHEN $13 = 'temporary' THEN now() + interval '7 days' ELSE NULL END,
           $14::jsonb, $15) RETURNING *`,
        [input.tenantId, input.category, input.documentType, input.fileName,
          input.contentType, bytes.length, sha256, input.module ?? null,
          input.sourceId ?? null, input.pmid ?? null, input.doi ?? null,
          input.evidencePackageId ?? null, input.retentionPolicy ?? "selective",
          JSON.stringify(input.metadata ?? {}), input.createdBy ?? null],
      );
      await client.query(
        `INSERT INTO stored_document_contents (document_id, tenant_id, content)
         VALUES ($1, $2, $3)`,
        [document.rows[0].id, input.tenantId, bytes],
      );
      await client.query(
        `INSERT INTO audit_events (
           tenant_id, actor_id, event_type, event_category, outcome, request_id, details
         ) VALUES ($1, $2, 'DOCUMENT_STORED', 'DOCUMENT_STORAGE', 'success', $3, $4::jsonb)`,
        [input.tenantId, input.createdBy ?? null, input.requestId ?? null,
          JSON.stringify({ documentId: document.rows[0].id, sha256,
            sizeBytes: bytes.length, contentType: input.contentType,
            retentionPolicy: input.retentionPolicy ?? "selective" })],
      );
      await client.query("COMMIT");
      return toRecord(document.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async get(tenantId: string, documentId: string): Promise<DocumentRegistryRecord | undefined> {
    const result = await getPostgresPool().query<DocumentRow>(
      `SELECT * FROM stored_documents
        WHERE tenant_id = $1 AND id = $2 AND status <> 'deleted'`,
      [tenantId, documentId],
    );
    return result.rows[0] ? toRecord(result.rows[0]) : undefined;
  }

  async getContent(tenantId: string, documentId: string): Promise<{
    record: DocumentRegistryRecord;
    content: Buffer;
  } | undefined> {
    const result = await getPostgresPool().query<DocumentRow & { content: Buffer }>(
      `SELECT document.*, contents.content FROM stored_documents document
       JOIN stored_document_contents contents ON contents.document_id = document.id
       WHERE document.tenant_id = $1 AND document.id = $2 AND document.status <> 'deleted'`,
      [tenantId, documentId],
    );
    return result.rows[0] ? { record: toRecord(result.rows[0]), content: result.rows[0].content } : undefined;
  }

  async list(tenantId: string): Promise<DocumentRegistryRecord[]> {
    const result = await getPostgresPool().query<DocumentRow>(
      `SELECT * FROM stored_documents
        WHERE tenant_id = $1 AND status = 'active' ORDER BY created_at DESC`,
      [tenantId],
    );
    return result.rows.map(toRecord);
  }

  async archive(tenantId: string, documentId: string): Promise<boolean> {
    const result = await getPostgresPool().query(
      `UPDATE stored_documents SET status = 'archived', updated_at = now()
        WHERE tenant_id = $1 AND id = $2 AND status = 'active'`,
      [tenantId, documentId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async delete(input: {
    tenantId: string;
    documentId: string;
    actorId: string;
    reason: string;
    requestId?: string | null;
  }): Promise<DocumentRegistryRecord | undefined> {
    if (!input.reason.trim()) throw new Error("Deletion reason is required.");
    const client = await getPostgresPool().connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query<DocumentRow & {
        legal_hold: boolean; retention_until: Date | null;
      }>(
        `SELECT * FROM stored_documents WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [input.tenantId, input.documentId],
      );
      if (!locked.rows[0] || locked.rows[0].status === "deleted") {
        await client.query("ROLLBACK");
        return undefined;
      }
      if (locked.rows[0].legal_hold) throw new Error("Document is under legal hold and cannot be deleted.");
      if (locked.rows[0].retention_until && locked.rows[0].retention_until > new Date()) {
        throw new Error("Document retention period has not expired.");
      }
      await client.query(`DELETE FROM stored_document_contents WHERE document_id = $1`, [input.documentId]);
      const deleted = await client.query<DocumentRow>(
        `UPDATE stored_documents SET status = 'deleted', deleted_by = $3,
           delete_reason = $4, deleted_at = now(), updated_at = now()
         WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        [input.tenantId, input.documentId, input.actorId, input.reason],
      );
      await client.query(
        `INSERT INTO audit_events (
           tenant_id, actor_id, event_type, event_category, outcome, request_id, details
         ) VALUES ($1, $2, 'DOCUMENT_DELETED', 'DOCUMENT_STORAGE', 'success', $3, $4::jsonb)`,
        [input.tenantId, input.actorId, input.requestId ?? null,
          JSON.stringify({ documentId: input.documentId, reason: input.reason,
            sha256: locked.rows[0].sha256, sizeBytes: Number(locked.rows[0].size_bytes) })],
      );
      await client.query("COMMIT");
      return toRecord(deleted.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export const documentManager = new DocumentManager();
