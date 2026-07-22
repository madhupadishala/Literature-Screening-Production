import { createHash } from "node:crypto";
import process from "node:process";

import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");

const tenantKey = process.env.KNOWLEDGE_TENANT_KEY?.trim() || "demo-tenant";
const embeddingModel = required("KNOWLEDGE_EMBEDDING_MODEL");
const embeddingProvider = (process.env.KNOWLEDGE_EMBEDDING_PROVIDER || "ollama").trim().toLowerCase();
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: sslConfiguration(),
  max: 2,
  connectionTimeoutMillis: 15_000,
  statement_timeout: 180_000,
  application_name: "ClinixAI Governed Retrieval Verification",
});

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function vectorLiteral(vector) {
  return `[${vector.join(",")}]`;
}

async function queryEmbedding(text) {
  let url;
  let headers = { "content-type": "application/json" };
  let body;

  if (embeddingProvider === "ollama") {
    url = `${(process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/+$/u, "")}/api/embed`;
    body = { model: embeddingModel, input: [text], truncate: true };
  } else if (embeddingProvider === "azure" || embeddingProvider === "azure-openai") {
    const endpoint = required("AZURE_OPENAI_ENDPOINT").replace(/\/+$/u, "");
    const deployment = required("AZURE_OPENAI_EMBEDDING_DEPLOYMENT");
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION?.trim() || "2024-02-01";
    url = `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}/embeddings?api-version=${encodeURIComponent(apiVersion)}`;
    headers = { ...headers, "api-key": required("AZURE_OPENAI_API_KEY") };
    body = { input: [text], encoding_format: "float" };
  } else if (embeddingProvider === "openai" || embeddingProvider === "openai-compatible") {
    const apiKey = process.env.KNOWLEDGE_EMBEDDING_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
    if (apiKey) headers = { ...headers, authorization: `Bearer ${apiKey}` };
    url = `${(process.env.KNOWLEDGE_EMBEDDING_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/u, "")}/embeddings`;
    body = { model: embeddingModel, input: [text], encoding_format: "float" };
  } else {
    throw new Error(`Unsupported KNOWLEDGE_EMBEDDING_PROVIDER: ${embeddingProvider}.`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error?.message || `Embedding request failed with HTTP ${response.status}.`);
    }
    const embedding = embeddingProvider === "ollama" ? payload.embeddings?.[0] : payload.data?.[0]?.embedding;
    assert(Array.isArray(embedding) && embedding.length > 0, "Embedding provider returned no query vector.");
    assert(embedding.every(Number.isFinite), "Embedding provider returned a non-numeric query vector.");
    return embedding;
  } finally {
    clearTimeout(timer);
  }
}

async function activeRepository() {
  const result = await pool.query(
    `SELECT t.id AS tenant_id, r.id AS repository_id, r.version_label,
            r.manifest_sha256, r.embedding_model, r.embedding_dimensions
       FROM tenants t
       JOIN controlled_knowledge_repositories r ON r.tenant_id = t.id
      WHERE t.tenant_key = $1 AND t.status = 'active'
        AND r.repository_key = 'clinixai-literature-knowledge'
        AND r.lifecycle_status = 'active'`,
    [tenantKey],
  );
  assert(result.rowCount === 1, "Exactly one active controlled repository is required for the tenant.");
  return result.rows[0];
}

async function governedSearch(repository, query, topK = 5) {
  const embedding = await queryEmbedding(query);
  assert(embeddingModel === repository.embedding_model, "Query and repository embedding models differ.");
  assert(embedding.length === repository.embedding_dimensions, "Query and repository vector dimensions differ.");
  const result = await pool.query(
    `WITH governed AS (
       SELECT d.document_key, d.title, d.version_label, c.chunk_key, c.content,
              c.content_sha256, c.metadata,
              greatest(0::double precision, 1 - (c.embedding <=> $2::vector)) AS semantic_score,
              least(1::double precision,
                ts_rank_cd(to_tsvector('english', c.content), websearch_to_tsquery('english', $3))::double precision * 4
              ) AS keyword_score
         FROM knowledge_documents d
         JOIN knowledge_chunks c ON c.document_id = d.id AND c.tenant_id = d.tenant_id
        WHERE d.controlled_repository_id = $1
          AND d.governance_status = 'effective' AND d.production_eligible IS TRUE
          AND c.embedding IS NOT NULL AND c.embedding_model = $4
          AND c.embedding_dimensions = $5
          AND c.metadata->>'status' = 'Approved'
          AND c.metadata->>'effectiveForProduction' = 'true'
          AND d.document_key NOT LIKE 'CDS-%'
     )
     SELECT *, (semantic_score * 0.80 + keyword_score * 0.20) AS score
       FROM governed
      ORDER BY score DESC, document_key, chunk_key
      LIMIT $6`,
    [repository.repository_id, vectorLiteral(embedding), query, repository.embedding_model, repository.embedding_dimensions, topK],
  );
  return result.rows;
}

try {
  const repository = await activeRepository();
  assert(repository.version_label === "1.0.0", "Active controlled repository version is not 1.0.0.");
  assert(/^[a-f0-9]{64}$/u.test(repository.manifest_sha256), "Active repository manifest is invalid.");

  const testQueries = [
    "identifiable patient suspect medicinal product adverse event literature case",
    "weekly literature search calendar review governance",
    "duplicate literature publication case detection",
  ];
  const summary = [];
  for (const query of testQueries) {
    const first = await governedSearch(repository, query);
    const second = await governedSearch(repository, query);
    assert(first.length > 0, `No approved knowledge was retrieved for: ${query}`);
    assert(first.every((row) => !row.document_key.startsWith("CDS-")), "Draft CDS knowledge was retrieved.");
    assert(first.every((row) => row.metadata.status === "Approved"), "Non-Approved knowledge was retrieved.");
    assert(first.every((row) => row.metadata.effectiveForProduction === true), "Non-production knowledge was retrieved.");
    assert(first.every((row) => /^[a-f0-9]{64}$/u.test(row.content_sha256)), "A governed citation content hash is invalid.");
    const firstIdentity = first.map((row) => `${row.document_key}@${row.version_label}#${row.chunk_key}`).join("|");
    const secondIdentity = second.map((row) => `${row.document_key}@${row.version_label}#${row.chunk_key}`).join("|");
    assert(firstIdentity === secondIdentity, "Retrieval ordering is not deterministic.");
    const contextPackId = `acp_${sha256(`${repository.tenant_id}|${query}|${repository.version_label}|${first.map((row) => row.content_sha256).join("|")}`).slice(0, 24)}`;
    summary.push({
      query: `${query.slice(0, 44)}...`,
      results: first.length,
      top_knowledge_object: first[0].document_key,
      top_score: Number(first[0].score).toFixed(4),
      context_pack: contextPackId,
      draft_cds: 0,
    });
  }

  const isolation = await pool.query(
    `SELECT count(*)::integer AS leaked_chunks
       FROM knowledge_chunks c
       JOIN knowledge_documents d ON d.id = c.document_id
       JOIN controlled_knowledge_repositories r ON r.id = d.controlled_repository_id
       JOIN tenants t ON t.id = c.tenant_id
      WHERE t.tenant_key <> $1 AND r.id = $2`,
    [tenantKey, repository.repository_id],
  );
  assert(isolation.rows[0].leaked_chunks === 0, "Cross-tenant controlled knowledge leakage was detected.");

  console.log("ClinixAI governed controlled-knowledge retrieval verification passed.");
  console.table(summary);
} finally {
  await pool.end();
}

function sslConfiguration() {
  const mode = process.env.DATABASE_SSL_MODE?.trim().toLowerCase();
  if (!mode || mode === "disable") return false;
  if (mode === "no-verify" || mode === "require") return { rejectUnauthorized: false };
  if (mode === "verify-full") return { rejectUnauthorized: true };
  throw new Error("DATABASE_SSL_MODE must be disable, no-verify, require, or verify-full.");
}
