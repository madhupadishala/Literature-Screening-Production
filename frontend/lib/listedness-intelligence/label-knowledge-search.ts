import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";
import type { ReviewReferenceUsageScope } from "@/lib/literature/review/review-reference-service";
import type { ListednessLabelEvidence } from "./types";
import { LABEL_KNOWLEDGE_REPOSITORY_KEY } from "./label-knowledge-bootstrap";
import { listednessSearchTerms } from "./listedness-engine";

export interface BoundLabelSearchInput {
  tenantId: string;
  labelKey: string;
  labelType: string;
  labelVersion: string;
  clientProductId: string;
  reportedEvent: string;
  effectiveFrom?: string;
  usageScope: ReviewReferenceUsageScope;
}

export interface BoundLabelSearchResult {
  documentAvailable: boolean;
  searchedChunks: number;
  evidence: ListednessLabelEvidence[];
  queryTerms: string[];
  citationIds: string[];
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export async function searchBoundLabelDocument(
  input: BoundLabelSearchInput,
): Promise<BoundLabelSearchResult> {
  const queryTerms = listednessSearchTerms(input.reportedEvent);
  const searchQuery = queryTerms.join(" OR ");
  const patterns = queryTerms.map((term) => `%${normalize(term).replace(/ /g, "%")}%`);
  const pool = getPostgresPool();

  const document = await pool.query<{
    tenant_id: string;
    repository_id: string;
    document_id: string;
    chunk_count: number;
  }>(
    `SELECT t.id::text AS tenant_id,
            r.id::text AS repository_id,
            d.id::text AS document_id,
            count(c.id)::int AS chunk_count
       FROM tenants t
       JOIN controlled_knowledge_repositories r ON r.tenant_id = t.id
       JOIN knowledge_documents d ON d.controlled_repository_id = r.id
       LEFT JOIN knowledge_chunks c ON c.document_id = d.id AND c.tenant_id = d.tenant_id
      WHERE (t.id::text = $1 OR t.tenant_key = $1)
        AND t.status = 'active'
        AND r.repository_key = $2
        AND r.lifecycle_status = 'active'
        AND d.document_key = $3
        AND (
          $4::text = 'VALIDATION_ONLY'
          OR (d.governance_status = 'effective' AND d.production_eligible IS TRUE)
        )
      GROUP BY t.id, r.id, d.id
      LIMIT 1`,
    [input.tenantId, LABEL_KNOWLEDGE_REPOSITORY_KEY, input.labelKey, input.usageScope],
  );

  const resolved = document.rows[0];
  if (!resolved) {
    return {
      documentAvailable: false,
      searchedChunks: 0,
      evidence: [],
      queryTerms,
      citationIds: [],
    };
  }

  const rows = await pool.query<{
    document_key: string;
    version_label: string;
    chunk_key: string;
    chunk_index: number;
    content: string;
    keyword_score: number;
  }>(
    `SELECT d.document_key,
            d.version_label,
            coalesce(c.chunk_key, d.document_key || '::' || lpad((c.chunk_index + 1)::text, 4, '0')) AS chunk_key,
            c.chunk_index,
            c.content,
            greatest(
              ts_rank_cd(
                to_tsvector('simple', c.content),
                websearch_to_tsquery('simple', $4)
              )::double precision,
              CASE
                WHEN lower(c.content) LIKE ANY($5::text[]) THEN 1::double precision
                ELSE 0::double precision
              END
            ) AS keyword_score
       FROM controlled_knowledge_repositories r
       JOIN knowledge_documents d ON d.controlled_repository_id = r.id
       JOIN knowledge_chunks c ON c.document_id = d.id AND c.tenant_id = d.tenant_id
      WHERE r.id = $1
        AND d.id = $2
        AND (
          $3::text = 'VALIDATION_ONLY'
          OR (d.governance_status = 'effective' AND d.production_eligible IS TRUE)
        )
        AND (
          to_tsvector('simple', c.content) @@ websearch_to_tsquery('simple', $4)
          OR lower(c.content) LIKE ANY($5::text[])
        )
      ORDER BY keyword_score DESC, c.chunk_index
      LIMIT 30`,
    [resolved.repository_id, resolved.document_id, input.usageScope, searchQuery, patterns],
  );

  const evidence = rows.rows.map<ListednessLabelEvidence>((row) => ({
    text: row.content,
    section: `label-chunk-${row.chunk_index + 1}`,
    documentId: row.document_key,
    documentType: input.labelType,
    documentVersion: row.version_label,
    effectiveDate: input.effectiveFrom,
    subjectProduct: input.clientProductId,
    chunkId: row.chunk_key,
  }));

  return {
    documentAvailable: true,
    searchedChunks: resolved.chunk_count,
    evidence,
    queryTerms,
    citationIds: rows.rows.map(
      (row) => `${row.document_key}@${row.version_label}#${row.chunk_key}`,
    ),
  };
}
