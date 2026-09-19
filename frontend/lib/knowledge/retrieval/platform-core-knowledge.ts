import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { getPostgresPool } from "@/lib/database/postgres";

import type {
  ControlledKnowledgeSearchRequest,
  ControlledKnowledgeSearchResponse,
  ControlledKnowledgeSearchResult,
  ControlledKnowledgeSearchMode,
} from "./controlled-knowledge-types";

const REPOSITORY_KEY = "clinixai-literature-knowledge";
const REPOSITORY_VERSION = "1.0.0";
const EXPECTED_APPROVED_OBJECTS = 80;

interface CoreKnowledgeObject {
  id: string;
  title: string;
  rule: string;
  category?: string;
  regulatory_reference?: string;
  status: string;
  approval_basis?: string;
  source_file?: string;
  domain?: string;
  version: string;
  effective_for_production: boolean;
  dependencies?: string[];
  file: string;
  rule_hash_sha256: string;
}

interface CoreMetadata {
  version?: string;
  approved_objects?: number;
  production_rule?: string;
}

interface LoadedCore {
  objects: CoreKnowledgeObject[];
  manifestSha256: string;
  metadata: CoreMetadata;
}

interface TenantIdentity {
  tenantId: string;
  tenantKey: string;
}

let coreCache: Promise<LoadedCore> | null = null;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function knowledgeRoot(): string {
  const configured =
    process.env.KNOWLEDGE_ROOT?.trim() ||
    process.env.CLINIXAI_KNOWLEDGE_ROOT?.trim();

  if (!configured) {
    return path.resolve(process.cwd(), "..", "knowledge");
  }

  return path.isAbsolute(configured)
    ? path.normalize(configured)
    : path.resolve(process.cwd(), configured);
}

function repositoryRoot(): string {
  return path.join(
    knowledgeRoot(),
    "controlled",
    "ClinixAI_Knowledge_Repository_v1.0",
  );
}

async function loadCore(): Promise<LoadedCore> {
  if (coreCache) return coreCache;

  coreCache = (async () => {
    const root = repositoryRoot();
    const registryPath = path.join(root, "07_Indexes_and_Loader", "knowledge.json");
    const metadataPath = path.join(root, "07_Indexes_and_Loader", "metadata.json");

    const [registryBuffer, metadataBuffer] = await Promise.all([
      readFile(registryPath),
      readFile(metadataPath),
    ]);

    const parsed = JSON.parse(registryBuffer.toString("utf8")) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("Bundled ClinixAI controlled knowledge registry is invalid.");
    }

    const metadata = JSON.parse(metadataBuffer.toString("utf8")) as CoreMetadata;
    const objects = parsed.filter(
      (item): item is CoreKnowledgeObject =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item),
    );

    const approved = objects.filter(
      (object) =>
        object.status === "Approved" &&
        object.effective_for_production === true &&
        !object.id.startsWith("CDS-"),
    );

    if (approved.length !== EXPECTED_APPROVED_OBJECTS) {
      throw new Error(
        `Bundled ClinixAI core must contain exactly ${EXPECTED_APPROVED_OBJECTS} approved production objects; found ${approved.length}.`,
      );
    }

    if (
      metadata.approved_objects !== undefined &&
      metadata.approved_objects !== EXPECTED_APPROVED_OBJECTS
    ) {
      throw new Error("Bundled ClinixAI knowledge metadata does not match the approved object count.");
    }

    for (const object of approved) {
      if (!object.id || !object.title || !object.rule || !object.version || !object.file) {
        throw new Error(`Bundled knowledge object ${object.id || "unknown"} is incomplete.`);
      }
      if (sha256(object.rule) !== object.rule_hash_sha256) {
        throw new Error(`Bundled knowledge object ${object.id} failed its rule hash check.`);
      }
    }

    return {
      objects: approved,
      manifestSha256: sha256(registryBuffer),
      metadata,
    };
  })();

  return coreCache;
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "shall",
  "only", "when", "where", "within", "using", "used", "use", "are", "was",
  "were", "been", "being", "have", "has", "had", "not", "but", "may",
  "must", "can", "will", "all", "any", "its", "their", "each", "every",
  "according", "through", "after", "before", "during", "over", "under",
]);

function tokens(value: string): string[] {
  return [
    ...new Set(
      value
        .toLowerCase()
        .normalize("NFKC")
        .replace(/[^a-z0-9]+/g, " ")
        .split(/\s+/u)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && !STOPWORDS.has(token)),
    ),
  ];
}

function keywordScore(object: CoreKnowledgeObject, queryTokens: string[]): number {
  const titleDomain = `${object.title} ${object.domain || ""}`.toLowerCase();
  const rule = object.rule.toLowerCase();
  let points = 0;

  for (const token of queryTokens) {
    if (titleDomain.includes(token)) points += 3;
    if (rule.includes(token)) points += 1;
  }

  const queryText = queryTokens.join(" ");
  if (
    /patient|adverse|event|reaction|safety|special|reporter|case|valid/i.test(queryText) &&
    (object.domain === "Validity Engine" || object.title === "Safety Information Definition")
  ) {
    points += 8;
  }

  if (
    /screen|hits|literature/i.test(queryText) &&
    object.domain === "Screening Decision Intelligence"
  ) {
    points += 5;
  }

  if (
    /company|product|mah|suspect/i.test(queryText) &&
    /Product|MAH|Suspect/i.test(`${object.title} ${object.rule}`)
  ) {
    points += 4;
  }

  const denominator = Math.max(8, Math.min(queryTokens.length, 20) * 2);
  return Math.min(1, points / denominator);
}

function normalizeMode(value?: string): ControlledKnowledgeSearchMode {
  return value === "keyword" || value === "semantic" ? value : "hybrid";
}

function boundedNumber(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value as number)) : fallback;
}

function normalizedList(values: string[] | undefined, maximum: number): string[] {
  return [...new Set((values || []).map((value) => value.trim()).filter(Boolean))].slice(0, maximum);
}

async function resolveTenant(tenantReference: string): Promise<TenantIdentity> {
  const result = await getPostgresPool().query<{ id: string; tenant_key: string }>(
    `SELECT id, tenant_key
     FROM tenants
     WHERE (tenant_key = $1 OR id::text = $1)
       AND status = 'active'
     LIMIT 1`,
    [tenantReference],
  );

  const row = result.rows[0];
  if (!row) throw new Error(`Active tenant ${tenantReference} was not found.`);
  return { tenantId: row.id, tenantKey: row.tenant_key };
}

export async function searchPlatformCoreKnowledge(
  request: ControlledKnowledgeSearchRequest,
): Promise<ControlledKnowledgeSearchResponse> {
  const tenantReference = request.tenantId?.trim();
  const query = request.query?.replace(/\s+/gu, " ").trim();

  if (!tenantReference) throw new Error("tenantId is required.");
  if (!query) throw new Error("Controlled knowledge query is required.");
  if (query.length > 20_000) throw new Error("Controlled knowledge query exceeds 20,000 characters.");

  const [tenant, core] = await Promise.all([
    resolveTenant(tenantReference),
    loadCore(),
  ]);

  const requestedMode = normalizeMode(request.mode);
  const topK = Math.trunc(boundedNumber(request.topK, 10, 1, 30));
  const minScore = boundedNumber(request.minScore, 0, 0, 1);
  const domains = normalizedList(request.domains, 20);
  const objectIds = normalizedList(request.knowledgeObjectIds, 100);
  const queryTokens = tokens(query);

  const ranked = core.objects
    .filter((object) => domains.length === 0 || domains.includes(object.domain || ""))
    .filter((object) => objectIds.length === 0 || objectIds.includes(object.id))
    .map((object) => ({ object, score: keywordScore(object, queryTokens) }))
    .filter(({ score }) => score >= minScore)
    .sort((left, right) => right.score - left.score || left.object.id.localeCompare(right.object.id))
    .slice(0, topK);

  const results: ControlledKnowledgeSearchResult[] = ranked.map(({ object, score }) => ({
    content: object.rule,
    score: Number(score.toFixed(6)),
    semanticScore: 0,
    keywordScore: Number(score.toFixed(6)),
    matchedBy: "keyword",
    citation: {
      citationId: `${object.id}@${object.version}#core-rule`,
      knowledgeObjectId: object.id,
      chunkId: `${object.id}::core-rule`,
      title: object.title,
      domain: object.domain || "",
      section: object.category || "Controlled Rule",
      version: object.version,
      regulatoryReference: object.regulatory_reference || "",
      sourceFile: object.file,
      contentHashSha256: object.rule_hash_sha256,
      repositoryVersion: core.metadata.version || REPOSITORY_VERSION,
      repositoryManifestSha256: core.manifestSha256,
    },
  }));

  await getPostgresPool().query(
    `INSERT INTO audit_events (
       tenant_id, actor_id, event_type, event_category, outcome,
       request_id, correlation_id, details
     ) VALUES ($1, $2, 'CONTROLLED_KNOWLEDGE_RETRIEVED', 'KNOWLEDGE_GOVERNANCE', 'success',
       $3, $4, $5::jsonb)`,
    [
      tenant.tenantId,
      request.actorId || null,
      request.requestId || null,
      request.correlationId || null,
      JSON.stringify({
        source: "CLINIXAI_PLATFORM_CORE_BUNDLED",
        fallbackReason: "TENANT_CONTROLLED_REPOSITORY_NOT_CONFIGURED",
        requestedMode,
        effectiveMode: "keyword",
        repositoryKey: REPOSITORY_KEY,
        repositoryVersion: core.metadata.version || REPOSITORY_VERSION,
        repositoryManifestSha256: core.manifestSha256,
        resultCount: results.length,
        citations: results.map((item) => item.citation.citationId),
      }),
    ],
  );

  return {
    tenantId: tenant.tenantId,
    tenantKey: tenant.tenantKey,
    query,
    mode: "keyword",
    repositoryId: "platform-core:clinixai-literature-knowledge",
    repositoryVersion: core.metadata.version || REPOSITORY_VERSION,
    repositoryManifestSha256: core.manifestSha256,
    embeddingModel: "governed-keyword-core",
    embeddingDimensions: 0,
    results,
    generatedAt: new Date().toISOString(),
  };
}
