import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import pg from "pg";

const { Pool } = pg;
const APPROVED_STATUS = "Approved";
const DRAFT_STATUS = "Draft – Requires Approval";
const REPOSITORY_KEY = "clinixai-literature-knowledge";
const REPOSITORY_VERSION = "1.0.0";
const EXPECTED_APPROVED_OBJECTS = 80;
const EXPECTED_DRAFT_OBJECTS = 20;
const EXPECTED_APPROVED_CHUNKS = 1360;
const EXPECTED_DRAFT_CHUNKS = 340;

const databaseUrl = requiredEnvironment("DATABASE_URL");
const tenantKey = process.env.KNOWLEDGE_TENANT_KEY?.trim() || "demo-tenant";
const repositoryRoot = path.resolve(
  process.cwd(),
  "..",
  "knowledge",
  "controlled",
  "ClinixAI_Knowledge_Repository_v1.0",
);

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: sslConfiguration(),
  max: 2,
  connectionTimeoutMillis: integerEnvironment("DATABASE_CONNECTION_TIMEOUT_MS", 15_000, 1_000, 120_000),
  statement_timeout: integerEnvironment("DATABASE_STATEMENT_TIMEOUT_MS", 120_000, 10_000, 600_000),
  application_name: "ClinixAI Controlled Knowledge Loader",
});

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function integerEnvironment(name, fallback, minimum, maximum) {
  const value = Number.parseInt(process.env[name] || "", 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sslConfiguration() {
  const mode = process.env.DATABASE_SSL_MODE?.trim().toLowerCase();
  if (!mode || mode === "disable") return false;
  if (mode === "no-verify" || mode === "require") return { rejectUnauthorized: false };
  if (mode === "verify-full") return { rejectUnauthorized: true };
  throw new Error("DATABASE_SSL_MODE must be disable, no-verify, require, or verify-full.");
}

function embeddingConfiguration() {
  const provider = (process.env.KNOWLEDGE_EMBEDDING_PROVIDER || "openai")
    .trim()
    .toLowerCase();
  const timeoutMs = integerEnvironment("KNOWLEDGE_EMBEDDING_TIMEOUT_MS", 120_000, 5_000, 600_000);
  const batchSize = integerEnvironment("KNOWLEDGE_EMBEDDING_BATCH_SIZE", 64, 1, 256);
  const attempts = integerEnvironment("KNOWLEDGE_EMBEDDING_MAX_ATTEMPTS", 3, 1, 6);

  if (provider === "azure-openai" || provider === "azure") {
    const endpoint = requiredEnvironment("AZURE_OPENAI_ENDPOINT").replace(/\/+$/u, "");
    const deployment = requiredEnvironment("AZURE_OPENAI_EMBEDDING_DEPLOYMENT");
    const apiKey = requiredEnvironment("AZURE_OPENAI_API_KEY");
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION?.trim() || "2024-02-01";
    return {
      provider: "azure-openai",
      model: deployment,
      url: `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}/embeddings?api-version=${encodeURIComponent(apiVersion)}`,
      headers: { "api-key": apiKey, "content-type": "application/json" },
      timeoutMs,
      batchSize,
      attempts,
    };
  }

  if (provider === "openai" || provider === "openai-compatible") {
    const baseUrl = (
      process.env.KNOWLEDGE_EMBEDDING_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      "https://api.openai.com/v1"
    ).trim().replace(/\/+$/u, "");
    const model = process.env.KNOWLEDGE_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
    const apiKey =
      process.env.KNOWLEDGE_EMBEDDING_API_KEY?.trim() ||
      process.env.OPENAI_API_KEY?.trim();
    if (provider === "openai" || process.env.NODE_ENV === "production") {
      assert(apiKey, "KNOWLEDGE_EMBEDDING_API_KEY or OPENAI_API_KEY is required.");
    }
    return {
      provider,
      model,
      url: `${baseUrl}/embeddings`,
      headers: {
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        "content-type": "application/json",
      },
      timeoutMs,
      batchSize,
      attempts,
    };
  }

  if (provider === "ollama") {
    const baseUrl = (process.env.OLLAMA_BASE_URL || "http://localhost:11434")
      .trim()
      .replace(/\/+$/u, "");
    const model = requiredEnvironment("KNOWLEDGE_EMBEDDING_MODEL");
    return {
      provider,
      model,
      url: `${baseUrl}/api/embed`,
      headers: { "content-type": "application/json" },
      timeoutMs,
      batchSize,
      attempts,
    };
  }

  throw new Error(
    "KNOWLEDGE_EMBEDDING_PROVIDER must be openai, openai-compatible, azure-openai, or ollama.",
  );
}

async function readControlledSource() {
  const registryPath = path.join(repositoryRoot, "07_Indexes_and_Loader", "knowledge.json");
  const chunksPath = path.join(repositoryRoot, "07_Indexes_and_Loader", "chunks.jsonl");
  const checksumsPath = path.join(repositoryRoot, "checksums.sha256");

  const [registryContent, chunksContent, checksumManifest] = await Promise.all([
    readFile(registryPath),
    readFile(chunksPath),
    readFile(checksumsPath),
  ]);
  const objects = JSON.parse(registryContent.toString("utf8"));
  assert(Array.isArray(objects) && objects.length === 100, "Controlled registry must contain 100 objects.");

  const objectsById = new Map();
  let approvedObjectCount = 0;
  let draftObjectCount = 0;
  for (const object of objects) {
    assert(typeof object.id === "string" && !objectsById.has(object.id), `Invalid or duplicate object: ${object.id}`);
    const approved = object.status === APPROVED_STATUS && object.effective_for_production === true;
    const draft = object.status === DRAFT_STATUS && object.effective_for_production === false;
    assert(approved || draft, `${object.id}: invalid governance eligibility combination.`);
    if (approved) approvedObjectCount += 1;
    if (draft) draftObjectCount += 1;
    if (object.id.startsWith("CDS-")) {
      assert(draft, `${object.id}: CDS knowledge must remain Draft and non-production.`);
    }
    objectsById.set(object.id, object);
  }
  assert(approvedObjectCount === EXPECTED_APPROVED_OBJECTS, `Expected ${EXPECTED_APPROVED_OBJECTS} Approved objects.`);
  assert(draftObjectCount === EXPECTED_DRAFT_OBJECTS, `Expected ${EXPECTED_DRAFT_OBJECTS} Draft objects.`);

  const approvedChunks = [];
  let draftChunkCount = 0;
  const chunkIds = new Set();
  for (const [index, line] of chunksContent.toString("utf8").split(/\r?\n/u).entries()) {
    if (!line.trim()) continue;
    const chunk = JSON.parse(line);
    assert(typeof chunk.chunk_id === "string" && !chunkIds.has(chunk.chunk_id), `Invalid or duplicate chunk at line ${index + 1}.`);
    chunkIds.add(chunk.chunk_id);
    const object = objectsById.get(chunk.ko_id);
    assert(object, `${chunk.chunk_id}: unknown Knowledge Object.`);
    assert(chunk.status === object.status, `${chunk.chunk_id}: status mismatch.`);
    assert(chunk.effective_for_production === object.effective_for_production, `${chunk.chunk_id}: eligibility mismatch.`);
    assert(sha256(Buffer.from(chunk.text, "utf8")) === chunk.content_hash_sha256, `${chunk.chunk_id}: hash mismatch.`);

    if (chunk.status === APPROVED_STATUS && chunk.effective_for_production === true) {
      approvedChunks.push(chunk);
    } else {
      assert(chunk.status === DRAFT_STATUS && chunk.effective_for_production === false, `${chunk.chunk_id}: unsafe Draft state.`);
      draftChunkCount += 1;
    }
  }

  assert(approvedChunks.length === EXPECTED_APPROVED_CHUNKS, `Expected ${EXPECTED_APPROVED_CHUNKS} Approved chunks.`);
  assert(draftChunkCount === EXPECTED_DRAFT_CHUNKS, `Expected ${EXPECTED_DRAFT_CHUNKS} excluded Draft chunks.`);
  assert(approvedChunks.every((chunk) => !chunk.ko_id.startsWith("CDS-")), "CDS chunks entered the production set.");

  return {
    objects,
    objectsById,
    approvedChunks,
    approvedObjectCount,
    draftObjectCount,
    draftChunkCount,
    registrySha256: sha256(registryContent),
    checksumManifestSha256: sha256(checksumManifest),
  };
}

async function fetchEmbeddingBatch(config, texts) {
  let lastError;
  for (let attempt = 1; attempt <= config.attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const requestBody =
        config.provider === "ollama"
          ? { model: config.model, input: texts, truncate: true }
          : { model: config.model, input: texts, encoding_format: "float" };
      const response = await fetch(config.url, {
        method: "POST",
        headers: config.headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = body?.error?.message || body?.message || `HTTP ${response.status}`;
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        if (!retryable) throw new Error(`Embedding request rejected: ${message}`);
        throw new Error(`Retryable embedding response: ${message}`);
      }
      if (config.provider === "ollama") {
        assert(
          Array.isArray(body.embeddings) && body.embeddings.length === texts.length,
          "Ollama embedding response count mismatch.",
        );
        return body.embeddings;
      }
      assert(Array.isArray(body.data) && body.data.length === texts.length, "Embedding response count mismatch.");
      return [...body.data]
        .sort((left, right) => left.index - right.index)
        .map((entry) => entry.embedding);
    } catch (error) {
      lastError = error;
      if (attempt === config.attempts) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(8_000, 500 * 2 ** (attempt - 1))));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`Embedding generation failed after ${config.attempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function generateEmbeddings(config, chunks) {
  const embeddings = [];
  let dimensions;
  for (let offset = 0; offset < chunks.length; offset += config.batchSize) {
    const batch = chunks.slice(offset, offset + config.batchSize);
    const batchEmbeddings = await fetchEmbeddingBatch(config, batch.map((chunk) => chunk.text));
    for (const embedding of batchEmbeddings) {
      assert(Array.isArray(embedding) && embedding.length > 0, "Embedding is empty.");
      assert(embedding.every((value) => Number.isFinite(value)), "Embedding contains a non-finite value.");
      dimensions ??= embedding.length;
      assert(embedding.length === dimensions, "Embedding dimensions changed within the controlled load.");
      embeddings.push(embedding);
    }
    console.log(`Embedded ${Math.min(offset + batch.length, chunks.length)} of ${chunks.length} Approved chunks.`);
  }
  assert(embeddings.length === chunks.length && dimensions, "Embedding generation was incomplete.");
  return { embeddings, dimensions };
}

function vectorLiteral(embedding) {
  return `[${embedding.join(",")}]`;
}

async function persistControlledKnowledge(source, embeddingConfig, embeddingResult) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${tenantKey}:${REPOSITORY_KEY}`]);

    const tenant = await client.query(
      `SELECT id FROM tenants WHERE tenant_key = $1 AND status = 'active' FOR UPDATE`,
      [tenantKey],
    );
    assert(tenant.rowCount === 1, `Active tenant ${tenantKey} was not found.`);
    const tenantId = tenant.rows[0].id;

    const actor = await client.query(
      `SELECT u.id
       FROM application_users u
       JOIN tenant_memberships m ON m.user_id = u.id
       WHERE m.tenant_id = $1 AND m.membership_status = 'active'
       ORDER BY CASE WHEN m.role_key = 'CLINIXAI_SUPER_ADMIN' THEN 0 ELSE 1 END, u.created_at
       LIMIT 1`,
      [tenantId],
    );
    const loadedBy = actor.rows[0]?.id || null;

    const repository = await client.query(
      `INSERT INTO controlled_knowledge_repositories (
         tenant_id, repository_key, version_label, lifecycle_status,
         manifest_sha256, checksum_manifest_sha256,
         approved_object_count, excluded_draft_object_count,
         indexed_chunk_count, excluded_draft_chunk_count,
         embedding_provider, embedding_model, embedding_dimensions,
         loaded_by, metadata, updated_at
       ) VALUES ($1, $2, $3, 'loading', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, now())
       ON CONFLICT (tenant_id, repository_key, version_label)
       DO UPDATE SET lifecycle_status = 'loading', manifest_sha256 = EXCLUDED.manifest_sha256,
         checksum_manifest_sha256 = EXCLUDED.checksum_manifest_sha256,
         approved_object_count = EXCLUDED.approved_object_count,
         excluded_draft_object_count = EXCLUDED.excluded_draft_object_count,
         indexed_chunk_count = EXCLUDED.indexed_chunk_count,
         excluded_draft_chunk_count = EXCLUDED.excluded_draft_chunk_count,
         embedding_provider = EXCLUDED.embedding_provider,
         embedding_model = EXCLUDED.embedding_model,
         embedding_dimensions = EXCLUDED.embedding_dimensions,
         loaded_by = EXCLUDED.loaded_by, metadata = EXCLUDED.metadata, updated_at = now()
       RETURNING id`,
      [
        tenantId,
        REPOSITORY_KEY,
        REPOSITORY_VERSION,
        source.registrySha256,
        source.checksumManifestSha256,
        source.approvedObjectCount,
        source.draftObjectCount,
        source.approvedChunks.length,
        source.draftChunkCount,
        embeddingConfig.provider,
        embeddingConfig.model,
        embeddingResult.dimensions,
        loadedBy,
        JSON.stringify({ source: "ClinixAI_Knowledge_Repository_v1.0", controlled: true }),
      ],
    );
    const repositoryId = repository.rows[0].id;

    await client.query(`DELETE FROM knowledge_documents WHERE controlled_repository_id = $1`, [repositoryId]);
    const documentIds = new Map();
    for (const object of source.objects) {
      if (object.status !== APPROVED_STATUS || object.effective_for_production !== true) continue;
      const inserted = await client.query(
        `INSERT INTO knowledge_documents (
           tenant_id, document_key, title, source_type, source_reference,
           version_label, governance_status, metadata, content_sha256,
           controlled_repository_id, production_eligible
         ) VALUES ($1, $2, $3, 'clinixai_controlled_knowledge', $4, $5, 'effective', $6::jsonb, $7, $8, true)
         RETURNING id`,
        [
          tenantId,
          object.id,
          object.title,
          object.regulatory_reference,
          object.version,
          JSON.stringify({
            domain: object.domain,
            category: object.category,
            controlledRule: object.rule,
            ruleHashSha256: object.rule_hash_sha256,
            documentHashSha256: object.document_hash_sha256,
            dependencies: object.dependencies || [],
            sourceFile: object.file,
            approvalBasis: object.approval_basis,
            status: object.status,
            effectiveForProduction: object.effective_for_production,
          }),
          object.document_hash_sha256,
          repositoryId,
        ],
      );
      documentIds.set(object.id, inserted.rows[0].id);
    }
    assert(documentIds.size === EXPECTED_APPROVED_OBJECTS, "Approved document persistence count mismatch.");

    for (let index = 0; index < source.approvedChunks.length; index += 1) {
      const chunk = source.approvedChunks[index];
      const chunkNumber = Number.parseInt(chunk.chunk_id.split("::").at(-1), 10);
      assert(Number.isInteger(chunkNumber) && chunkNumber > 0, `${chunk.chunk_id}: invalid chunk index.`);
      await client.query(
        `INSERT INTO knowledge_chunks (
           tenant_id, document_id, chunk_index, content, embedding_model,
           embedding, metadata, chunk_key, content_sha256, embedding_dimensions
         ) VALUES ($1, $2, $3, $4, $5, $6::vector, $7::jsonb, $8, $9, $10)`,
        [
          tenantId,
          documentIds.get(chunk.ko_id),
          chunkNumber - 1,
          chunk.text,
          embeddingConfig.model,
          vectorLiteral(embeddingResult.embeddings[index]),
          JSON.stringify({
            koId: chunk.ko_id,
            title: chunk.title,
            domain: chunk.domain,
            version: chunk.version,
            status: chunk.status,
            effectiveForProduction: chunk.effective_for_production,
            section: chunk.section,
            sourceFile: chunk.source_file,
            regulatoryReference: chunk.regulatory_reference,
            dependencies: chunk.dependencies || [],
            contentHashSha256: chunk.content_hash_sha256,
            repositoryVersion: REPOSITORY_VERSION,
          }),
          chunk.chunk_id,
          chunk.content_hash_sha256,
          embeddingResult.dimensions,
        ],
      );
    }

    const persisted = await client.query(
      `SELECT
         count(DISTINCT d.id)::integer AS documents,
         count(c.id)::integer AS chunks,
         count(c.embedding)::integer AS embeddings,
         count(*) FILTER (WHERE d.document_key LIKE 'CDS-%')::integer AS cds_chunks
       FROM knowledge_documents d
       LEFT JOIN knowledge_chunks c ON c.document_id = d.id
       WHERE d.controlled_repository_id = $1`,
      [repositoryId],
    );
    const counts = persisted.rows[0];
    assert(counts.documents === EXPECTED_APPROVED_OBJECTS, "Database document count mismatch.");
    assert(counts.chunks === EXPECTED_APPROVED_CHUNKS, "Database chunk count mismatch.");
    assert(counts.embeddings === EXPECTED_APPROVED_CHUNKS, "Database embedding count mismatch.");
    assert(counts.cds_chunks === 0, "Draft CDS knowledge entered the database.");

    await client.query(
      `UPDATE controlled_knowledge_repositories
       SET lifecycle_status = 'superseded', updated_at = now()
       WHERE tenant_id = $1 AND repository_key = $2 AND id <> $3 AND lifecycle_status = 'active'`,
      [tenantId, REPOSITORY_KEY, repositoryId],
    );
    await client.query(
      `UPDATE controlled_knowledge_repositories
       SET lifecycle_status = 'active', loaded_at = now(), updated_at = now()
       WHERE id = $1`,
      [repositoryId],
    );
    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES ($1, $2, 'CONTROLLED_KNOWLEDGE_INDEX_ACTIVATED', 'KNOWLEDGE_GOVERNANCE', 'success', $3::jsonb)`,
      [
        tenantId,
        loadedBy,
        JSON.stringify({
          repositoryId,
          repositoryKey: REPOSITORY_KEY,
          version: REPOSITORY_VERSION,
          approvedObjects: EXPECTED_APPROVED_OBJECTS,
          indexedChunks: EXPECTED_APPROVED_CHUNKS,
          excludedDraftObjects: EXPECTED_DRAFT_OBJECTS,
          excludedDraftChunks: EXPECTED_DRAFT_CHUNKS,
          manifestSha256: source.registrySha256,
          embeddingProvider: embeddingConfig.provider,
          embeddingModel: embeddingConfig.model,
          embeddingDimensions: embeddingResult.dimensions,
        }),
      ],
    );

    await client.query("COMMIT");
    return { repositoryId, tenantId, ...counts };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const source = await readControlledSource();
  const config = embeddingConfiguration();
  console.log(`Generating governed embeddings with ${config.provider}/${config.model}.`);
  const embeddings = await generateEmbeddings(config, source.approvedChunks);
  const persisted = await persistControlledKnowledge(source, config, embeddings);
  console.log("Controlled knowledge pgvector load passed.");
  console.table([
    {
      tenant: tenantKey,
      repository_id: persisted.repositoryId,
      approved_documents: persisted.documents,
      indexed_chunks: persisted.chunks,
      persisted_embeddings: persisted.embeddings,
      embedding_dimensions: embeddings.dimensions,
      excluded_draft_objects: source.draftObjectCount,
      excluded_draft_chunks: source.draftChunkCount,
    },
  ]);
}

main()
  .catch((error) => {
    console.error("Controlled knowledge pgvector load failed.");
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
