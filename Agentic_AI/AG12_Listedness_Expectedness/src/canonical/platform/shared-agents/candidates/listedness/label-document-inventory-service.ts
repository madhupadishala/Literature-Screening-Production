import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";

export interface LabelDocumentInventoryRow {
  tenantId: string;
  tenantKey: string;
  repositoryId: string;
  repositoryKey: string;
  repositoryVersion: string;
  documentKey: string;
  title: string;
  documentVersion: string;
  governanceStatus: string;
  productionEligible: boolean;
  sourceReference: string;
  sourceFile: string;
  domain: string;
  chunkCount: number;
  metadata: Record<string, unknown>;
  detectedLabelType?: string;
}

function normalize(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function detectLabelType(input: {
  documentKey: string;
  title: string;
  sourceReference: string;
  sourceFile: string;
  domain: string;
  metadata: Record<string, unknown>;
}): string | undefined {
  const haystack = normalize([
    input.documentKey,
    input.title,
    input.sourceReference,
    input.sourceFile,
    input.domain,
    JSON.stringify(input.metadata),
  ].join(" "));

  if (/\bccsi\b|company core safety information/.test(haystack)) return "CCSI";
  if (/\bccds\b|company core data sheet/.test(haystack)) return "CCDS";
  if (/\buspi\b|united states prescribing information|us prescribing information/.test(haystack)) return "USPI";
  if (/\bsmpc\b|summary of product characteristics/.test(haystack)) return "SmPC";
  if (/\bspc\b/.test(haystack)) return "SPC";
  if (/\binvestigator.?s brochure\b|\bib\b/.test(haystack)) return "IB";
  if (/\breference safety information\b|\brsi\b/.test(haystack)) return "RSI";
  if (/\blocal product document\b|\blpd\b/.test(haystack)) return "LPD";
  if (/\bpackage insert\b|\bproduct information\b|\blabel(?:ing)?\b/.test(haystack)) return "LABEL_OTHER";
  return undefined;
}

export async function inventoryControlledLabelDocuments(): Promise<{
  repositories: number;
  totalDocuments: number;
  labelCandidates: LabelDocumentInventoryRow[];
}> {
  const pool = getPostgresPool();

  const result = await pool.query<{
    tenant_id: string;
    tenant_key: string;
    repository_id: string;
    repository_key: string;
    repository_version: string;
    document_key: string;
    title: string;
    document_version: string;
    governance_status: string;
    production_eligible: boolean;
    source_reference: string;
    source_file: string;
    domain: string;
    chunk_count: number;
    metadata: Record<string, unknown>;
  }>(
    `SELECT
       t.id::text AS tenant_id,
       t.tenant_key,
       r.id::text AS repository_id,
       r.repository_key,
       r.version_label AS repository_version,
       d.document_key,
       d.title,
       d.version_label AS document_version,
       d.governance_status,
       d.production_eligible,
       coalesce(d.source_reference, '') AS source_reference,
       coalesce(d.metadata->>'sourceFile', '') AS source_file,
       coalesce(d.metadata->>'domain', '') AS domain,
       count(c.id)::int AS chunk_count,
       d.metadata
     FROM tenants t
     JOIN controlled_knowledge_repositories r
       ON r.tenant_id = t.id
      AND r.lifecycle_status = 'active'
     JOIN knowledge_documents d
       ON d.tenant_id = t.id
      AND d.controlled_repository_id = r.id
     LEFT JOIN knowledge_chunks c
       ON c.tenant_id = d.tenant_id
      AND c.document_id = d.id
     WHERE t.status = 'active'
     GROUP BY
       t.id, t.tenant_key, r.id, r.repository_key, r.version_label,
       d.id, d.document_key, d.title, d.version_label,
       d.governance_status, d.production_eligible,
       d.source_reference, d.metadata
     ORDER BY t.tenant_key, r.repository_key, d.document_key`,
  );

  const labelCandidates: LabelDocumentInventoryRow[] = [];
  for (const row of result.rows) {
    const detectedLabelType = detectLabelType({
      documentKey: row.document_key,
      title: row.title,
      sourceReference: row.source_reference,
      sourceFile: row.source_file,
      domain: row.domain,
      metadata: row.metadata || {},
    });
    if (!detectedLabelType) continue;

    labelCandidates.push({
      tenantId: row.tenant_id,
      tenantKey: row.tenant_key,
      repositoryId: row.repository_id,
      repositoryKey: row.repository_key,
      repositoryVersion: row.repository_version,
      documentKey: row.document_key,
      title: row.title,
      documentVersion: row.document_version,
      governanceStatus: row.governance_status,
      productionEligible: row.production_eligible,
      sourceReference: row.source_reference,
      sourceFile: row.source_file,
      domain: row.domain,
      chunkCount: Number(row.chunk_count),
      metadata: row.metadata || {},
      detectedLabelType,
    });
  }

  return {
    repositories: new Set(result.rows.map((row) => row.repository_id)).size,
    totalDocuments: result.rows.length,
    labelCandidates,
  };
}
