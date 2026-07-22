import process from "node:process";
import fs from "node:fs";
import path from "node:path";

import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");

const tenantKey = process.env.KNOWLEDGE_TENANT_KEY?.trim() || "demo-tenant";
const requireOperationalEvidence = process.argv.includes("--full");
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: sslConfiguration(),
  max: 2,
  connectionTimeoutMillis: 15_000,
  statement_timeout: 120_000,
  application_name: "ClinixAI Sprint 50 Operational Governance Verification",
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function records(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && Array.isArray(payload.records)) return payload.records;
  return [];
}

function productIdentity(product) {
  return [
    product.clientProductId,
    product.productId,
    product.brandName,
    product.genericName,
    product.inn,
    product.api,
    product.whodrugId,
  ].some((value) => String(value || "").trim());
}

try {
  const ppiRegistryPath = path.resolve(process.cwd(), "lib/pharmaceutical-intelligence/approved-scenarios.json");
  const ppiGovernancePath = path.resolve(process.cwd(), "../knowledge/pharmaceutical-product-intelligence/v1.0/scenarios.json");
  assert(fs.existsSync(ppiRegistryPath), "Approved Pharmaceutical Product Intelligence registry is missing.");
  assert(fs.existsSync(ppiGovernancePath), "Pharmaceutical Product Intelligence governance manifest is missing.");
  const ppiRegistry = JSON.parse(fs.readFileSync(ppiRegistryPath, "utf8"));
  assert(ppiRegistry.knowledgeVersion === "PPI-KB-1.0.0", "Unexpected Pharmaceutical Product Intelligence knowledge version.");
  assert(Array.isArray(ppiRegistry.scenarios) && ppiRegistry.scenarios.length === 6, "Six approved pharmaceutical decision scenarios are required.");
  assert(ppiRegistry.scenarios.every((scenario) => scenario.status === "APPROVED"), "A pharmaceutical decision scenario is not Approved.");
  assert(ppiRegistry.scenarios.every((scenario) => Array.isArray(scenario.prohibitedConclusions) && scenario.prohibitedConclusions.length > 0), "A pharmaceutical scenario has no prohibited conclusions.");
  const tenantResult = await pool.query(
    `SELECT id, tenant_key, status FROM tenants WHERE tenant_key = $1`,
    [tenantKey],
  );
  assert(tenantResult.rowCount === 1, `Tenant ${tenantKey} does not exist.`);
  const tenant = tenantResult.rows[0];
  assert(tenant.status === "active", `Tenant ${tenantKey} is not active.`);

  const repositoryResult = await pool.query(
    `SELECT version_label, lifecycle_status, approved_object_count, indexed_chunk_count,
            excluded_draft_object_count, excluded_draft_chunk_count, embedding_model,
            embedding_dimensions, manifest_sha256
       FROM controlled_knowledge_repositories
      WHERE tenant_id = $1 AND repository_key = 'clinixai-literature-knowledge'
        AND lifecycle_status = 'active'`,
    [tenant.id],
  );
  assert(repositoryResult.rowCount === 1, "Exactly one active controlled Knowledge Repository is required.");
  const repository = repositoryResult.rows[0];
  assert(repository.approved_object_count === 80, "Active repository does not contain 80 Approved objects.");
  assert(repository.indexed_chunk_count === 1360, "Active repository does not contain 1360 indexed chunks.");
  assert(repository.excluded_draft_object_count === 20, "Active repository does not exclude 20 Draft objects.");
  assert(repository.excluded_draft_chunk_count === 340, "Active repository does not exclude 340 Draft chunks.");

  const configurationResult = await pool.query(
    `SELECT s.resource_type, s.config_key, s.display_name, v.id, v.version_label,
            v.payload, v.validation_report, v.source_filename, v.activated_at
       FROM tenant_configuration_versions v
       JOIN tenant_configuration_sets s ON s.id = v.config_set_id
      WHERE v.tenant_id = $1 AND v.lifecycle_status = 'active'
        AND (v.effective_from IS NULL OR v.effective_from <= now())
        AND (v.effective_to IS NULL OR v.effective_to > now())
        AND s.resource_type IN ('PRODUCT_MASTER', 'LITERATURE_CALENDAR')
      ORDER BY s.resource_type, v.activated_at DESC NULLS LAST`,
    [tenant.id],
  );

  const productVersions = configurationResult.rows.filter((row) => row.resource_type === "PRODUCT_MASTER");
  const calendarVersions = configurationResult.rows.filter((row) => row.resource_type === "LITERATURE_CALENDAR");
  assert(productVersions.length === 1, "Exactly one effective active Product Master is required.");
  assert(calendarVersions.length === 1, "Exactly one effective active Literature Calendar is required.");

  const productMaster = productVersions[0];
  const literatureCalendar = calendarVersions[0];
  assert(productMaster.validation_report?.valid === true, "Active Product Master validation report is not valid.");
  assert(literatureCalendar.validation_report?.valid === true, "Active Literature Calendar validation report is not valid.");

  const products = records(productMaster.payload);
  const schedules = records(literatureCalendar.payload);
  assert(products.length > 0, "Active Product Master contains no product records.");
  assert(products.every(productIdentity), "A Product Master record has no governed product identity.");
  assert(schedules.length > 0, "Active Literature Calendar contains no schedule records.");
  assert(schedules.every((row) => String(row.frequency || "").trim()), "A Literature Calendar record has no frequency.");

  const duplicateProducts = await pool.query(
    `SELECT lower(coalesce(item->>'clientProductId', item->>'productId', item->>'brandName', item->>'genericName', item->>'inn', item->>'api', item->>'whodrugId')) AS identity,
            count(*)::integer AS occurrences
       FROM jsonb_array_elements(
         CASE WHEN jsonb_typeof($1::jsonb) = 'array' THEN $1::jsonb ELSE coalesce($1::jsonb->'records', '[]'::jsonb) END
       ) item
      GROUP BY identity HAVING count(*) > 1`,
    [JSON.stringify(productMaster.payload)],
  );
  assert(duplicateProducts.rowCount === 0, "Duplicate primary product identities exist in the active Product Master.");

  const summary = [
    {
      control: "Controlled Knowledge",
      version: repository.version_label,
      source: repository.embedding_model,
      records: `${repository.approved_object_count} objects / ${repository.indexed_chunk_count} chunks`,
      status: "PASS",
    },
    {
      control: "Pharmaceutical Product Intelligence",
      version: ppiRegistry.knowledgeVersion,
      source: "approved-scenarios.json",
      records: ppiRegistry.scenarios.length,
      status: "PASS",
    },
    {
      control: "Product Master",
      version: productMaster.version_label,
      source: productMaster.source_filename || productMaster.config_key,
      records: products.length,
      status: "PASS",
    },
    {
      control: "Literature Calendar",
      version: literatureCalendar.version_label,
      source: literatureCalendar.source_filename || literatureCalendar.config_key,
      records: schedules.length,
      status: "PASS",
    },
  ];

  if (requireOperationalEvidence) {
    const auditResult = await pool.query(
      `SELECT event_type, details, occurred_at
         FROM audit_events
        WHERE tenant_id = $1
          AND event_type IN ('CONTROLLED_KNOWLEDGE_RETRIEVED', 'AI_HITS_SUCCESS', 'AI_SCREENING_SUCCESS')
        ORDER BY occurred_at DESC`,
      [tenant.id],
    );
    const latest = (eventType) => auditResult.rows.find((row) => row.event_type === eventType);
    const retrieval = latest("CONTROLLED_KNOWLEDGE_RETRIEVED");
    const hits = latest("AI_HITS_SUCCESS");
    const screening = latest("AI_SCREENING_SUCCESS");
    assert(retrieval, "No persisted controlled-knowledge retrieval audit event exists.");
    assert(Array.isArray(retrieval.details?.citations) && retrieval.details.citations.length > 0, "Retrieval audit has no governed citations.");
    assert(hits, "No successful persisted Hits AI audit event exists.");
    assert(screening, "No successful persisted Screening AI audit event exists.");
    for (const event of [hits, screening]) {
      assert(String(event.details?.knowledgeContextPackId || "").startsWith("acp_"), `${event.event_type} has no Context Pack identity.`);
      assert(Array.isArray(event.details?.knowledgeCitationIds) && event.details.knowledgeCitationIds.length > 0, `${event.event_type} has no governed citations.`);
      assert(event.details?.configurationSnapshot?.productMaster, `${event.event_type} did not bind the active Product Master.`);
      assert(event.details?.configurationSnapshot?.literatureCalendar, `${event.event_type} did not bind the active Literature Calendar.`);
    }
    summary.push(
      { control: "Knowledge Retrieval Audit", version: retrieval.occurred_at.toISOString(), source: "audit_events", records: retrieval.details.citations.length, status: "PASS" },
      { control: "Hits Governance Audit", version: hits.occurred_at.toISOString(), source: hits.details.knowledgeContextPackId, records: hits.details.knowledgeCitationIds.length, status: "PASS" },
      { control: "Screening Governance Audit", version: screening.occurred_at.toISOString(), source: screening.details.knowledgeContextPackId, records: screening.details.knowledgeCitationIds.length, status: "PASS" },
    );
  }

  console.log(
    requireOperationalEvidence
      ? "ClinixAI end-to-end governed operational verification passed."
      : "ClinixAI active configuration governance verification passed.",
  );
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
