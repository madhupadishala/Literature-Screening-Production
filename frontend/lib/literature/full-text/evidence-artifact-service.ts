import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";

export interface EvidenceArtifactMetadata {
  id: string;
  packageId: string;
  artifactType: string;
  mediaType: string | null;
  fileName: string | null;
  sha256: string;
  sizeBytes: number | null;
  provenanceUrl: string | null;
  retrievedAt: string | null;
  retentionPolicy: string;
  retentionUntil: string | null;
  legalHold: boolean;
  createdAt: string;
}

export interface EvidenceArtifactDownload extends EvidenceArtifactMetadata {
  content: Buffer;
}

interface ArtifactRow {
  id: string;
  package_id: string;
  artifact_type: string;
  media_type: string | null;
  storage_key: string;
  sha256: string;
  size_bytes: string | number | null;
  provenance_url: string | null;
  retrieved_at: Date | string | null;
  retention_policy: string;
  retention_until: Date | string | null;
  legal_hold: boolean;
  created_at: Date | string;
  content: Buffer;
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapArtifact(row: ArtifactRow): EvidenceArtifactDownload {
  return {
    id: row.id,
    packageId: row.package_id,
    artifactType: row.artifact_type,
    mediaType: row.media_type,
    fileName: row.storage_key.split("/").at(-1) || null,
    sha256: row.sha256,
    sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
    provenanceUrl: row.provenance_url,
    retrievedAt: iso(row.retrieved_at),
    retentionPolicy: row.retention_policy,
    retentionUntil: iso(row.retention_until),
    legalHold: row.legal_hold,
    createdAt: iso(row.created_at) as string,
    content: row.content,
  };
}

export async function getEvidenceArtifact(
  tenantId: string,
  artifactId: string,
): Promise<EvidenceArtifactDownload | null> {
  const result = await getPostgresPool().query<ArtifactRow>(
    `
      SELECT
        a.id, a.package_id, a.artifact_type, a.media_type, a.storage_key,
        a.sha256, a.size_bytes, a.provenance_url, a.retrieved_at,
        a.retention_policy, a.retention_until, a.legal_hold, a.created_at,
        c.content
      FROM evidence_artifacts a
      JOIN evidence_artifact_contents c
        ON c.artifact_id = a.id AND c.tenant_id = a.tenant_id
      WHERE a.id = $1
        AND a.tenant_id = $2
        AND a.deleted_at IS NULL
      LIMIT 1
    `,
    [artifactId, tenantId],
  );

  return result.rows[0] ? mapArtifact(result.rows[0]) : null;
}

export async function deleteEvidenceArtifact(input: {
  tenantId: string;
  artifactId: string;
  actorId: string;
  reason: string;
  requestId?: string | null;
}): Promise<void> {
  if (!input.reason.trim()) {
    throw new Error("Deletion reason is required.");
  }

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");

    const artifact = await client.query<{
      package_id: string;
      legal_hold: boolean;
      deleted_at: Date | null;
      sha256: string;
    }>(
      `
        SELECT package_id, legal_hold, deleted_at, sha256
        FROM evidence_artifacts
        WHERE id = $1 AND tenant_id = $2
        FOR UPDATE
      `,
      [input.artifactId, input.tenantId],
    );
    const row = artifact.rows[0];
    if (!row || row.deleted_at) throw new Error("Evidence artifact not found.");
    if (row.legal_hold) {
      throw new Error("Evidence artifact cannot be deleted while legal hold is active.");
    }

    await client.query(
      `DELETE FROM evidence_artifact_contents
       WHERE artifact_id = $1 AND tenant_id = $2`,
      [input.artifactId, input.tenantId],
    );
    await client.query(
      `
        UPDATE evidence_artifacts
        SET deleted_at = now(), deleted_by = $3, deletion_reason = $4
        WHERE id = $1 AND tenant_id = $2
      `,
      [input.artifactId, input.tenantId, input.actorId, input.reason.trim()],
    );
    await client.query(
      `
        INSERT INTO audit_events (
          tenant_id, package_id, actor_id, event_type, event_category,
          outcome, request_id, details
        ) VALUES ($1, $2, $3, 'EVIDENCE_ARTIFACT_DELETED',
          'EVIDENCE_LIFECYCLE', 'success', $4, $5::jsonb)
      `,
      [
        input.tenantId,
        row.package_id,
        input.actorId,
        input.requestId || null,
        JSON.stringify({
          artifactId: input.artifactId,
          sha256: row.sha256,
          reason: input.reason.trim(),
          contentRemoved: true,
        }),
      ],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
