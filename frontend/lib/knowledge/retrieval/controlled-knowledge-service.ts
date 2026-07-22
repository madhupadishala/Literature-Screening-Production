import "server-only";

import { createHash } from "node:crypto";

import { getPostgresPool } from "@/lib/database/postgres";

import { createKnowledgeQueryEmbedding } from "./knowledge-embedding-client";
import type {
  AgentContextPack,
  ControlledKnowledgeSearchRequest,
  ControlledKnowledgeSearchResponse,
  ControlledKnowledgeSearchResult,
  ControlledKnowledgeSearchMode,
  GovernedKnowledgeCitation,
} from "./controlled-knowledge-types";

interface ActiveRepositoryRow {
  tenant_id: string;
  tenant_key: string;
  repository_id: string;
  repository_version: string;
  manifest_sha256: string;
  embedding_model: string;
  embedding_dimensions: number;
}

interface SearchRow {
  content: string;
  chunk_key: string;
  content_sha256: string;
  document_key: string;
  title: string;
  version_label: string;
  domain: string;
  section: string;
  regulatory_reference: string;
  source_file: string;
  semantic_score: number;
  keyword_score: number;
  score: number;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function vectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

function normalizeMode(value?: string): ControlledKnowledgeSearchMode {
  return value === "keyword" || value === "semantic" ? value : "hybrid";
}

function normalizedList(values: string[] | undefined, maximum: number): string[] {
  return [...new Set((values || []).map((value) => value.trim()).filter(Boolean))].slice(0, maximum);
}

function boundedNumber(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value as number)) : fallback;
}

async function activeRepository(tenantReference: string): Promise<ActiveRepositoryRow> {
  const result = await getPostgresPool().query<ActiveRepositoryRow>(
    `SELECT
       t.id AS tenant_id,
       t.tenant_key,
       r.id AS repository_id,
       r.version_label AS repository_version,
       r.manifest_sha256,
       r.embedding_model,
       r.embedding_dimensions
     FROM tenants t
     JOIN controlled_knowledge_repositories r ON r.tenant_id = t.id
     WHERE (t.tenant_key = $1 OR t.id::text = $1)
       AND t.status = 'active'
       AND r.repository_key = 'clinixai-literature-knowledge'
       AND r.lifecycle_status = 'active'
     LIMIT 1`,
    [tenantReference],
  );
  const row = result.rows[0];
  if (!row) throw new Error(`No active controlled Knowledge Repository exists for tenant ${tenantReference}.`);
  return row;
}

function toCitation(row: SearchRow, repository: ActiveRepositoryRow): GovernedKnowledgeCitation {
  return {
    citationId: `${row.document_key}@${row.version_label}#${row.chunk_key}`,
    knowledgeObjectId: row.document_key,
    chunkId: row.chunk_key,
    title: row.title,
    domain: row.domain,
    section: row.section,
    version: row.version_label,
    regulatoryReference: row.regulatory_reference,
    sourceFile: row.source_file,
    contentHashSha256: row.content_sha256,
    repositoryVersion: repository.repository_version,
    repositoryManifestSha256: repository.manifest_sha256,
  };
}

function scoreExpression(mode: ControlledKnowledgeSearchMode): string {
  if (mode === "semantic") return "semantic_score";
  if (mode === "keyword") return "keyword_score";
  return "(semantic_score * 0.80 + keyword_score * 0.20)";
}

export async function searchControlledKnowledge(
  request: ControlledKnowledgeSearchRequest,
): Promise<ControlledKnowledgeSearchResponse> {
  const tenantReference = request.tenantId?.trim();
  const query = request.query?.replace(/\s+/gu, " ").trim();
  if (!tenantReference) throw new Error("tenantId is required.");
  if (!query) throw new Error("Controlled knowledge query is required.");
  if (query.length > 20_000) throw new Error("Controlled knowledge query exceeds 20,000 characters.");

  const repository = await activeRepository(tenantReference);
  const mode = normalizeMode(request.mode);
  const topK = Math.trunc(boundedNumber(request.topK, 10, 1, 30));
  const minScore = boundedNumber(request.minScore, 0, 0, 1);
  const domains = normalizedList(request.domains, 20);
  const objectIds = normalizedList(request.knowledgeObjectIds, 100);

  let queryVector: number[] | null = null;
  if (mode !== "keyword") {
    const generated = await createKnowledgeQueryEmbedding(query);
    if (generated.model !== repository.embedding_model) {
      throw new Error(
        `Query embedding model ${generated.model} does not match active repository model ${repository.embedding_model}.`,
      );
    }
    if (generated.embedding.length !== repository.embedding_dimensions) {
      throw new Error(
        `Query embedding dimensions ${generated.embedding.length} do not match active repository dimensions ${repository.embedding_dimensions}.`,
      );
    }
    queryVector = generated.embedding;
  }

  const result = await getPostgresPool().query<SearchRow>(
    `WITH governed AS (
       SELECT
         c.content,
         c.chunk_key,
         c.content_sha256,
         d.document_key,
         d.title,
         d.version_label,
         coalesce(c.metadata->>'domain', d.metadata->>'domain', '') AS domain,
         coalesce(c.metadata->>'section', '') AS section,
         coalesce(c.metadata->>'regulatoryReference', d.source_reference, '') AS regulatory_reference,
         coalesce(c.metadata->>'sourceFile', d.metadata->>'sourceFile', '') AS source_file,
         CASE
           WHEN $2::vector IS NULL THEN 0::double precision
           ELSE greatest(0::double precision, 1 - (c.embedding <=> $2::vector))
         END AS semantic_score,
         least(
           1::double precision,
           ts_rank_cd(
             to_tsvector('english', c.content),
             websearch_to_tsquery('english', $3)
           )::double precision * 4
         ) AS keyword_score
       FROM controlled_knowledge_repositories r
       JOIN knowledge_documents d ON d.controlled_repository_id = r.id
       JOIN knowledge_chunks c ON c.document_id = d.id AND c.tenant_id = d.tenant_id
       WHERE r.id = $1
         AND r.lifecycle_status = 'active'
         AND d.governance_status = 'effective'
         AND d.production_eligible IS TRUE
         AND c.embedding IS NOT NULL
         AND c.embedding_model = r.embedding_model
         AND c.embedding_dimensions = r.embedding_dimensions
         AND c.metadata->>'status' = 'Approved'
         AND c.metadata->>'effectiveForProduction' = 'true'
         AND d.document_key NOT LIKE 'CDS-%'
         AND (cardinality($4::text[]) = 0 OR coalesce(c.metadata->>'domain', d.metadata->>'domain') = ANY($4::text[]))
         AND (cardinality($5::text[]) = 0 OR d.document_key = ANY($5::text[]))
     ), scored AS (
       SELECT governed.*, ${scoreExpression(mode)} AS score
       FROM governed
     )
     SELECT * FROM scored
     WHERE score >= $6
     ORDER BY score DESC, document_key, chunk_key
     LIMIT $7`,
    [
      repository.repository_id,
      queryVector ? vectorLiteral(queryVector) : null,
      query,
      domains,
      objectIds,
      minScore,
      topK,
    ],
  );

  const results: ControlledKnowledgeSearchResult[] = result.rows.map((row) => ({
    content: row.content,
    score: Number(Number(row.score).toFixed(6)),
    semanticScore: Number(Number(row.semantic_score).toFixed(6)),
    keywordScore: Number(Number(row.keyword_score).toFixed(6)),
    matchedBy: mode,
    citation: toCitation(row, repository),
  }));

  await getPostgresPool().query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome,
         request_id, correlation_id, details
       ) VALUES ($1, $2, 'CONTROLLED_KNOWLEDGE_RETRIEVED', 'KNOWLEDGE_GOVERNANCE', 'success',
         $3, $4, $5::jsonb)`,
      [
        repository.tenant_id,
        request.actorId || null,
        request.requestId || null,
        request.correlationId || null,
        JSON.stringify({
          querySha256: sha256(query),
          mode,
          repositoryId: repository.repository_id,
          repositoryVersion: repository.repository_version,
          resultCount: results.length,
          citations: results.map((item) => item.citation.citationId),
        }),
      ],
    );

  return {
    tenantId: repository.tenant_id,
    tenantKey: repository.tenant_key,
    query,
    mode,
    repositoryId: repository.repository_id,
    repositoryVersion: repository.repository_version,
    embeddingModel: repository.embedding_model,
    embeddingDimensions: repository.embedding_dimensions,
    results,
    generatedAt: new Date().toISOString(),
  };
}

export async function buildAgentContextPack(
  request: ControlledKnowledgeSearchRequest,
): Promise<AgentContextPack> {
  const response = await searchControlledKnowledge(request);
  const manifest = response.results[0]?.citation.repositoryManifestSha256;
  if (!manifest) {
    const repository = await activeRepository(request.tenantId);
    return {
      contextPackId: `acp_${sha256(`${repository.tenant_id}|${request.query}|${repository.manifest_sha256}`).slice(0, 24)}`,
      tenantId: repository.tenant_id,
      tenantKey: repository.tenant_key,
      query: response.query,
      repositoryId: repository.repository_id,
      repositoryVersion: repository.repository_version,
      repositoryManifestSha256: repository.manifest_sha256,
      governedContext: "No approved controlled knowledge was retrieved for this query.",
      results: [],
      citations: [],
      generatedAt: response.generatedAt,
    };
  }
  const governedContext = response.results
    .map(
      (item, index) =>
        `[K${index + 1}] ${item.citation.knowledgeObjectId} v${item.citation.version} — ${item.citation.title}\n` +
        `Section: ${item.citation.section}\nRegulatory reference: ${item.citation.regulatoryReference}\n` +
        `Controlled content:\n${item.content}`,
    )
    .join("\n\n---\n\n");
  return {
    contextPackId: `acp_${sha256(
      `${response.tenantId}|${response.query}|${response.repositoryVersion}|${response.results
        .map((item) => item.citation.contentHashSha256)
        .join("|")}`,
    ).slice(0, 24)}`,
    tenantId: response.tenantId,
    tenantKey: response.tenantKey,
    query: response.query,
    repositoryId: response.repositoryId,
    repositoryVersion: response.repositoryVersion,
    repositoryManifestSha256: manifest,
    governedContext,
    results: response.results,
    citations: response.results.map((item) => item.citation),
    generatedAt: response.generatedAt,
  };
}
