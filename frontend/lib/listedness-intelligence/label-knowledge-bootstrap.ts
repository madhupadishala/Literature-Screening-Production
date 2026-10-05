import "server-only";

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { getPostgresPool } from "@/lib/database/postgres";

const REPOSITORY_KEY = "clinixai-label-knowledge";
const REPOSITORY_VERSION = "2026-10-05-reference-v1";
const CONFIG_KEY = "public-label-reference-validation";
const CONFIG_VERSION = "2026-10-05-validation-v1";

const LISTEDNESS_TYPES = new Set([
  "CCDS",
  "CCSI",
  "Core-Safety-Information",
  "SmPC",
  "USPI",
  "PI",
  "Package-Insert",
  "IB",
  "RSI",
]);

type LabelManifest = {
  labelId: string;
  brandName: string;
  genericName: string;
  country: string;
  documentType: string;
  version: string;
  effectiveDate?: string | null;
  governanceStatus?: string;
  effectiveForProduction?: boolean;
  referenceMapping?: {
    clientProductId?: string;
    approvalStatus?: string;
    sourceScopeVerification?: string;
    historicalVersionMatch?: string;
    productionUseBlocked?: boolean;
    regionalApplicability?: string;
  };
  source?: {
    path?: string;
    canonicalUrl?: string | null;
    sha256?: string;
    sourcePublicationOrUpdateDate?: string | null;
  };
  derived?: { parsedPath?: string | null };
};

export type LabelBootstrapResult = {
  tenantId: string;
  tenantKey: string;
  repositoryId: string;
  repositoryVersion: string;
  documentCount: number;
  chunkCount: number;
  mappedReferenceCount: number;
  productionEligibleCount: number;
  missingEffectiveDateCount: number;
  excludedFromListednessCount: number;
  byDocumentType: Record<string, number>;
  byCountry: Record<string, number>;
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function walk(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  await visit(root);
  return files;
}

function chunks(text: string): string[] {
  const value = text.replace(/\r\n?/gu, "\n").trim();
  if (!value) return [];
  const maximum = 5000;
  const overlap = 350;
  const output: string[] = [];
  let start = 0;
  while (start < value.length) {
    let end = Math.min(value.length, start + maximum);
    if (end < value.length) {
      const breakAt = value.lastIndexOf("\n\n", end);
      if (breakAt > start + 2500) end = breakAt;
    }
    const part = value.slice(start, end).trim();
    if (part) output.push(part);
    if (end >= value.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return output;
}

function parsedFile(knowledgeRoot: string, manifest: LabelManifest): string {
  const configured = String(manifest.derived?.parsedPath || "").trim();
  if (!configured) throw new Error(manifest.labelId + ": parsedPath is missing.");
  const relative = configured.replace(/^knowledge[\\/]/u, "");
  return path.join(knowledgeRoot, relative, "document.txt");
}

async function ensureTenant(tenantKey: string, allowCreate: boolean) {
  const pool = getPostgresPool();
  let result = await pool.query<{ id: string; tenant_key: string }>(
    "SELECT id::text, tenant_key FROM tenants WHERE tenant_key = $1 OR id::text = $1 LIMIT 1",
    [tenantKey],
  );
  if (result.rows[0]) return result.rows[0];
  if (!allowCreate) throw new Error("Label bootstrap tenant was not found: " + tenantKey);

  result = await pool.query<{ id: string; tenant_key: string }>(
    "INSERT INTO tenants (tenant_key, display_name, status, configuration) VALUES ($1,$2,'active',$3::jsonb) ON CONFLICT (tenant_key) DO UPDATE SET status='active', updated_at=now() RETURNING id::text, tenant_key",
    [
      tenantKey,
      "Internal Label Validation",
      JSON.stringify({ validationOnly: true, labelRepositoryVersion: REPOSITORY_VERSION }),
    ],
  );
  return result.rows[0];
}

function toMapping(manifest: LabelManifest) {
  return {
    labelKey: manifest.labelId,
    knowledgeObjectId: manifest.labelId,
    clientProductId: String(manifest.referenceMapping?.clientProductId || "").trim(),
    country: manifest.country,
    labelType: manifest.documentType,
    version: manifest.version,
    effectiveFrom: manifest.effectiveDate ?? null,
    effectiveTo: null,
    eventTerms: [],
    sourceDocument: manifest.source?.path ?? null,
    sourcePublicationOrUpdateDate: manifest.source?.sourcePublicationOrUpdateDate ?? null,
    canonicalUrl: manifest.source?.canonicalUrl ?? null,
    sourceSha256: manifest.source?.sha256 ?? null,
    governanceStatus: manifest.governanceStatus ?? "DRAFT",
    productionEligible: manifest.effectiveForProduction === true,
    productionUseBlocked: manifest.referenceMapping?.productionUseBlocked !== false,
    approvalStatus: manifest.referenceMapping?.approvalStatus ?? "PENDING",
    sourceScopeVerification: manifest.referenceMapping?.sourceScopeVerification ?? "PENDING",
    historicalVersionMatch: manifest.referenceMapping?.historicalVersionMatch ?? "UNRESOLVED",
    regionalApplicability: manifest.referenceMapping?.regionalApplicability ?? null,
    usageScope: "VALIDATION_ONLY",
  };
}

export async function bootstrapLabelKnowledge(input?: {
  tenantKey?: string;
  allowTenantCreate?: boolean;
}): Promise<LabelBootstrapResult> {
  const tenantKey =
    input?.tenantKey?.trim() ||
    process.env.LABEL_KNOWLEDGE_TENANT_KEY?.trim() ||
    process.env.DEFAULT_TENANT_KEY?.trim() ||
    "clinixai-internal-validation";
  const allowTenantCreate = input?.allowTenantCreate === true || process.env.VERCEL_ENV === "preview";

  const knowledgeRoot = path.resolve(process.cwd(), "..", "knowledge");
  const labelRoot = path.join(knowledgeRoot, "Labeling");
  const manifestFiles = (await walk(labelRoot))
    .filter((file) => file.endsWith(path.sep + "manifest.json") && file.includes("public-reference-acquired-2026-10-05" + path.sep))
    .sort();

  const entries: Array<{ manifest: LabelManifest; manifestFile: string; text: string }> = [];
  for (const manifestFile of manifestFiles) {
    const manifest = JSON.parse(await readFile(manifestFile, "utf8")) as LabelManifest;
    if (!manifest.labelId || !manifest.brandName || !manifest.genericName || !manifest.country || !manifest.documentType) {
      throw new Error("Invalid label manifest: " + manifestFile);
    }
    const text = await readFile(parsedFile(knowledgeRoot, manifest), "utf8");
    if (!text.trim()) throw new Error(manifest.labelId + ": parsed label text is empty.");
    entries.push({ manifest, manifestFile, text });
  }
  if (!entries.length) throw new Error("No acquired label manifests were found.");

  const tenant = await ensureTenant(tenantKey, allowTenantCreate);
  const pool = getPostgresPool();
  const client = await pool.connect();
  const byDocumentType: Record<string, number> = {};
  const byCountry: Record<string, number> = {};
  let chunkCount = 0;

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [tenant.id + ":" + REPOSITORY_KEY]);

    const manifestHash = sha256(entries.map((item) => item.manifest.labelId + "|" + (item.manifest.source?.sha256 || "") + "|" + sha256(item.text)).sort().join("\n"));
    const current = await client.query<{ id: string }>(
      "SELECT id::text FROM controlled_knowledge_repositories WHERE tenant_id=$1 AND repository_key=$2 AND version_label=$3 LIMIT 1",
      [tenant.id, REPOSITORY_KEY, REPOSITORY_VERSION],
    );

    let repositoryId = current.rows[0]?.id;
    if (repositoryId) {
      await client.query(
        "UPDATE controlled_knowledge_repositories SET lifecycle_status='loading',manifest_sha256=$2,checksum_manifest_sha256=$2,approved_object_count=0,excluded_draft_object_count=$3,indexed_chunk_count=0,excluded_draft_chunk_count=0,embedding_provider='keyword',embedding_model='keyword-only-v1',embedding_dimensions=1,metadata=$4::jsonb,updated_at=now() WHERE id=$1",
        [repositoryId, manifestHash, entries.length, JSON.stringify({ validationOnly: true, source: "knowledge/Labeling" })],
      );
      await client.query("DELETE FROM knowledge_documents WHERE controlled_repository_id=$1", [repositoryId]);
    } else {
      const created = await client.query<{ id: string }>(
        "INSERT INTO controlled_knowledge_repositories (tenant_id,repository_key,version_label,lifecycle_status,manifest_sha256,checksum_manifest_sha256,approved_object_count,excluded_draft_object_count,indexed_chunk_count,excluded_draft_chunk_count,embedding_provider,embedding_model,embedding_dimensions,metadata) VALUES ($1,$2,$3,'loading',$4,$4,0,$5,0,0,'keyword','keyword-only-v1',1,$6::jsonb) RETURNING id::text",
        [tenant.id, REPOSITORY_KEY, REPOSITORY_VERSION, manifestHash, entries.length, JSON.stringify({ validationOnly: true, source: "knowledge/Labeling" })],
      );
      repositoryId = created.rows[0].id;
    }

    for (const item of entries) {
      const manifest = item.manifest;
      byDocumentType[manifest.documentType] = (byDocumentType[manifest.documentType] || 0) + 1;
      byCountry[manifest.country] = (byCountry[manifest.country] || 0) + 1;

      const document = await client.query<{ id: string }>(
        "INSERT INTO knowledge_documents (tenant_id,document_key,title,source_type,source_reference,effective_from,effective_to,version_label,governance_status,metadata,content_sha256,controlled_repository_id,production_eligible) VALUES ($1,$2,$3,'public_label_reference',$4,$5,NULL,$6,$7,$8::jsonb,$9,$10,$11) RETURNING id::text",
        [
          tenant.id,
          manifest.labelId,
          manifest.brandName + " — " + manifest.genericName + " — " + manifest.country + " — " + manifest.documentType,
          manifest.source?.canonicalUrl || manifest.source?.path || null,
          manifest.effectiveDate || null,
          manifest.version,
          manifest.effectiveForProduction === true ? "effective" : "draft",
          JSON.stringify({
            domain: "Labeling",
            category: "label_reference",
            labelId: manifest.labelId,
            brandName: manifest.brandName,
            genericName: manifest.genericName,
            country: manifest.country,
            documentType: manifest.documentType,
            clientProductId: manifest.referenceMapping?.clientProductId || null,
            sourceFile: manifest.source?.path || null,
            manifestFile: path.relative(knowledgeRoot, item.manifestFile).replaceAll("\\", "/"),
            sourcePublicationOrUpdateDate: manifest.source?.sourcePublicationOrUpdateDate || null,
            sourceSha256: manifest.source?.sha256 || null,
            status: manifest.effectiveForProduction === true ? "Approved" : "Draft – Requires Approval",
            effectiveForProduction: manifest.effectiveForProduction === true,
            productionUseBlocked: manifest.referenceMapping?.productionUseBlocked !== false,
          }),
          sha256(item.text),
          repositoryId,
          manifest.effectiveForProduction === true,
        ],
      );

      const documentChunks = chunks(item.text);
      chunkCount += documentChunks.length;
      for (let index = 0; index < documentChunks.length; index += 1) {
        const content = documentChunks[index];
        await client.query(
          "INSERT INTO knowledge_chunks (tenant_id,document_id,chunk_index,content,token_count,embedding_model,embedding,metadata,chunk_key,content_sha256,embedding_dimensions) VALUES ($1,$2,$3,$4,$5,NULL,NULL,$6::jsonb,$7,$8,NULL)",
          [
            tenant.id,
            document.rows[0].id,
            index,
            Math.max(1, Math.ceil(content.length / 4)),
            JSON.stringify({
              koId: manifest.labelId,
              domain: "Labeling",
              section: "label-chunk-" + (index + 1),
              sourceFile: manifest.source?.path || null,
              documentType: manifest.documentType,
              country: manifest.country,
              clientProductId: manifest.referenceMapping?.clientProductId || null,
              status: manifest.effectiveForProduction === true ? "Approved" : "Draft – Requires Approval",
              effectiveForProduction: manifest.effectiveForProduction === true,
            }),
            manifest.labelId + "::" + String(index + 1).padStart(4, "0"),
            sha256(content),
          ],
        );
      }
    }

    await client.query(
      "UPDATE controlled_knowledge_repositories SET lifecycle_status='superseded',updated_at=now() WHERE tenant_id=$1 AND repository_key=$2 AND id<>$3 AND lifecycle_status='active'",
      [tenant.id, REPOSITORY_KEY, repositoryId],
    );
    await client.query(
      "UPDATE controlled_knowledge_repositories SET lifecycle_status='active',indexed_chunk_count=$2,excluded_draft_chunk_count=$2,loaded_at=now(),updated_at=now() WHERE id=$1",
      [repositoryId, chunkCount],
    );

    const mappings = entries.map((item) => toMapping(item.manifest)).filter((record) => record.clientProductId && LISTEDNESS_TYPES.has(record.labelType));
    const payload = {
      usageScope: "VALIDATION_ONLY",
      governanceStatus: "REFERENCE_ACQUIRED_PENDING_REVIEW",
      productionUseBlocked: true,
      sourceRepositoryKey: REPOSITORY_KEY,
      sourceRepositoryVersion: REPOSITORY_VERSION,
      records: mappings,
    };
    const payloadHash = sha256(JSON.stringify(payload));

    const configSet = await client.query<{ id: string }>(
      "INSERT INTO tenant_configuration_sets (tenant_id,resource_type,config_key,display_name,description,status) VALUES ($1,'LABEL_REFERENCE',$2,'Public label reference validation mappings','Validation-only mappings from acquired public label references. Production use remains blocked pending PV/regulatory approval.','active') ON CONFLICT (tenant_id,resource_type,config_key) DO UPDATE SET display_name=EXCLUDED.display_name,description=EXCLUDED.description,status='active',updated_at=now() RETURNING id::text",
      [tenant.id, CONFIG_KEY],
    );

    await client.query(
      "UPDATE tenant_configuration_versions SET lifecycle_status='superseded',effective_to=COALESCE(effective_to,now()),updated_at=now() WHERE config_set_id=$1 AND lifecycle_status='active'",
      [configSet.rows[0].id],
    );

    const existingVersion = await client.query<{ id: string }>(
      "SELECT id::text FROM tenant_configuration_versions WHERE config_set_id=$1 AND version_label=$2 LIMIT 1",
      [configSet.rows[0].id, CONFIG_VERSION],
    );
    const validationReport = {
      valid: true,
      errors: [],
      warnings: [
        { severity: "warning", path: "records[*].effectiveFrom", message: "Public references lack approved client-specific effective dates and remain VALIDATION_ONLY." },
        { severity: "warning", path: "records[*].productionUseBlocked", message: "Production use is blocked pending product, jurisdiction, version and effective-date approval." },
      ],
      validatedAt: new Date().toISOString(),
    };

    if (existingVersion.rows[0]) {
      await client.query(
        "UPDATE tenant_configuration_versions SET lifecycle_status='active',effective_from=NULL,effective_to=NULL,payload=$2::jsonb,content_sha256=$3,validation_report=$4::jsonb,change_reason='Rebuilt from acquired label manifests',activated_at=now(),updated_at=now() WHERE id=$1",
        [existingVersion.rows[0].id, JSON.stringify(payload), payloadHash, JSON.stringify(validationReport)],
      );
    } else {
      await client.query(
        "INSERT INTO tenant_configuration_versions (config_set_id,tenant_id,version_number,version_label,lifecycle_status,effective_from,effective_to,payload,content_sha256,validation_report,change_reason,activated_at) VALUES ($1,$2,COALESCE((SELECT max(version_number)+1 FROM tenant_configuration_versions WHERE config_set_id=$1),1),$3,'active',NULL,NULL,$4::jsonb,$5,$6::jsonb,'Built from acquired label manifests',now())",
        [configSet.rows[0].id, tenant.id, CONFIG_VERSION, JSON.stringify(payload), payloadHash, JSON.stringify(validationReport)],
      );
    }

    await client.query("COMMIT");

    return {
      tenantId: tenant.id,
      tenantKey: tenant.tenant_key,
      repositoryId,
      repositoryVersion: REPOSITORY_VERSION,
      documentCount: entries.length,
      chunkCount,
      mappedReferenceCount: mappings.length,
      productionEligibleCount: entries.filter((item) => item.manifest.effectiveForProduction === true).length,
      missingEffectiveDateCount: mappings.filter((record) => !record.effectiveFrom).length,
      excludedFromListednessCount: entries.length - mappings.length,
      byDocumentType,
      byCountry,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export const LABEL_KNOWLEDGE_REPOSITORY_KEY = REPOSITORY_KEY;
