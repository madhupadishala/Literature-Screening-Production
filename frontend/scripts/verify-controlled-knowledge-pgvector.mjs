import process from "node:process";

import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");

const tenantKey = process.env.KNOWLEDGE_TENANT_KEY?.trim() || "demo-tenant";
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: sslConfiguration(),
  max: 2,
  connectionTimeoutMillis: 15_000,
  statement_timeout: 120_000,
  application_name: "ClinixAI Controlled Knowledge Index Verification",
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const result = await pool.query(
    `SELECT
       r.id AS repository_id,
       r.version_label,
       r.lifecycle_status,
       r.manifest_sha256,
       r.checksum_manifest_sha256,
       r.approved_object_count,
       r.excluded_draft_object_count,
       r.indexed_chunk_count,
       r.excluded_draft_chunk_count,
       r.embedding_provider,
       r.embedding_model,
       r.embedding_dimensions,
       r.loaded_at,
       count(DISTINCT d.id)::integer AS persisted_documents,
       count(c.id)::integer AS persisted_chunks,
       count(c.embedding)::integer AS persisted_embeddings,
       count(*) FILTER (WHERE d.document_key LIKE 'CDS-%')::integer AS cds_chunks,
       count(*) FILTER (
         WHERE d.governance_status <> 'effective'
            OR d.production_eligible IS NOT TRUE
            OR c.metadata->>'status' <> 'Approved'
            OR c.metadata->>'effectiveForProduction' <> 'true'
       )::integer AS ineligible_chunks,
       count(DISTINCT c.chunk_key)::integer AS unique_chunk_keys,
       min(vector_dims(c.embedding))::integer AS minimum_dimensions,
       max(vector_dims(c.embedding))::integer AS maximum_dimensions,
       min(c.embedding <=> c.embedding)::double precision AS identity_distance
     FROM controlled_knowledge_repositories r
     JOIN tenants t ON t.id = r.tenant_id
     JOIN knowledge_documents d ON d.controlled_repository_id = r.id
     JOIN knowledge_chunks c ON c.document_id = d.id
     WHERE t.tenant_key = $1
       AND r.repository_key = 'clinixai-literature-knowledge'
       AND r.version_label = '1.0.0'
       AND r.lifecycle_status = 'active'
     GROUP BY r.id`,
    [tenantKey],
  );

  assert(result.rowCount === 1, "Exactly one active controlled repository v1.0.0 is required.");
  const row = result.rows[0];
  assert(row.lifecycle_status === "active", "Controlled repository is not active.");
  assert(row.approved_object_count === 80, "Repository Approved object count is not 80.");
  assert(row.excluded_draft_object_count === 20, "Repository excluded Draft object count is not 20.");
  assert(row.indexed_chunk_count === 1360, "Repository indexed chunk count is not 1360.");
  assert(row.excluded_draft_chunk_count === 340, "Repository excluded Draft chunk count is not 340.");
  assert(row.persisted_documents === 80, "Persisted document count is not 80.");
  assert(row.persisted_chunks === 1360, "Persisted chunk count is not 1360.");
  assert(row.persisted_embeddings === 1360, "Not every production chunk has an embedding.");
  assert(row.unique_chunk_keys === 1360, "Production chunk keys are not unique.");
  assert(row.cds_chunks === 0, "Draft CDS knowledge entered the production index.");
  assert(row.ineligible_chunks === 0, "Ineligible knowledge entered the production index.");
  assert(row.minimum_dimensions === row.embedding_dimensions, "Minimum vector dimensions do not match the repository contract.");
  assert(row.maximum_dimensions === row.embedding_dimensions, "Maximum vector dimensions do not match the repository contract.");
  assert(Math.abs(Number(row.identity_distance)) < 1e-12, "pgvector identity-distance verification failed.");
  assert(/^[a-f0-9]{64}$/u.test(row.manifest_sha256), "Repository manifest hash is invalid.");
  assert(/^[a-f0-9]{64}$/u.test(row.checksum_manifest_sha256), "Checksum manifest hash is invalid.");
  assert(row.loaded_at, "Repository activation timestamp is missing.");

  console.log("ClinixAI controlled pgvector index verification passed.");
  console.table([
    {
      tenant: tenantKey,
      repository_id: row.repository_id,
      version: row.version_label,
      status: row.lifecycle_status,
      documents: row.persisted_documents,
      chunks: row.persisted_chunks,
      embeddings: row.persisted_embeddings,
      dimensions: row.embedding_dimensions,
      model: row.embedding_model,
      excluded_drafts: `${row.excluded_draft_object_count} objects / ${row.excluded_draft_chunk_count} chunks`,
      cds_indexed: row.cds_chunks,
    },
  ]);
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
