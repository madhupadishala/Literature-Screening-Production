import { getPostgresPool } from "../lib/database/postgres";
import { activeReviewReferenceData } from "../lib/literature/review/review-reference-service";
import { assessListednessFromKnowledgeBase } from "../lib/listedness-intelligence/knowledge-base-listedness-service";

const tenantReference =
  process.env.LISTEDNESS_E2E_TENANT_ID?.trim() ||
  process.env.DEMO_TENANT_KEY?.trim() ||
  "demo-tenant";

const pool = getPostgresPool();
let tenant = await pool.query<{ id: string; tenant_key: string }>(
  `SELECT id::text, tenant_key
     FROM tenants
    WHERE id::text = $1 OR tenant_key = $1
    LIMIT 1`,
  [tenantReference],
);

if (!tenant.rows[0]) {
  tenant = await pool.query<{ id: string; tenant_key: string }>(
    `SELECT DISTINCT t.id::text, t.tenant_key
       FROM tenants t
       JOIN tenant_configuration_sets s
         ON s.tenant_id = t.id
        AND s.resource_type = 'LABEL_REFERENCE'
       JOIN tenant_configuration_versions v
         ON v.config_set_id = s.id
        AND v.tenant_id = t.id
        AND v.lifecycle_status = 'active'
      WHERE t.status = 'active'
      ORDER BY t.tenant_key
      LIMIT 1`,
  );
}

if (!tenant.rows[0]) {
  throw new Error(
    "No active tenant with a governed LABEL_REFERENCE configuration is available for real-label E2E validation.",
  );
}

const tenantId = tenant.rows[0].id;
const maxCases = Math.max(
  1,
  Math.min(Number(process.env.LISTEDNESS_E2E_MAX_CASES || 20), 100),
);

const references = (await activeReviewReferenceData(tenantId)).labelReferences
  .filter(
    (reference) =>
      reference.usageScope === "PRODUCTION" &&
      reference.clientProductId &&
      reference.country &&
      reference.sourceDocument &&
      reference.eventTerms.length > 0,
  )
  .sort((a, b) => a.labelKey.localeCompare(b.labelKey));

if (references.length === 0) {
  throw new Error(
    "No active PRODUCTION Label / RSI references with sourceDocument and eventTerms are available for the selected tenant.",
  );
}

const cases = references
  .flatMap((reference) =>
    reference.eventTerms.map((event) => ({ reference, event })),
  )
  .slice(0, maxCases);

const failures: Array<Record<string, unknown>> = [];
const passes: Array<Record<string, unknown>> = [];

for (const testCase of cases) {
  const result = await assessListednessFromKnowledgeBase({
    tenantId,
    clientProductId: testCase.reference.clientProductId,
    country: testCase.reference.country,
    reportedEvent: testCase.event,
    relevantDate: testCase.reference.effectiveFrom,
    requireDocumentEvidence: true,
    requestId: "listedness-real-label-e2e",
    correlationId: `listedness-e2e-${testCase.reference.labelKey}`,
  });

  const pass =
    result.reference?.labelKey === testCase.reference.labelKey &&
    result.reference?.version === testCase.reference.version &&
    result.retrieval.evidenceMode === "CONTROLLED_KNOWLEDGE_DOCUMENT" &&
    result.retrieval.matchedChunks > 0 &&
    result.retrieval.citationIds.length > 0 &&
    result.assessment.listedness === "LISTED";

  const record = {
    labelKey: testCase.reference.labelKey,
    labelType: testCase.reference.labelType,
    version: testCase.reference.version,
    productId: testCase.reference.clientProductId,
    country: testCase.reference.country,
    event: testCase.event,
    sourceDocument: testCase.reference.sourceDocument,
    listedness: result.assessment.listedness,
    reasonCode: result.assessment.reasonCode,
    evidenceMode: result.retrieval.evidenceMode,
    matchedChunks: result.retrieval.matchedChunks,
    citationCount: result.retrieval.citationIds.length,
  };

  if (pass) passes.push(record);
  else failures.push(record);
}

console.log(
  JSON.stringify(
    {
      tenantId,
      tested: cases.length,
      passed: passes.length,
      failed: failures.length,
      documents: [...new Set(cases.map((item) => item.reference.labelKey))].length,
      passSummary: passes,
      failures,
    },
    null,
    2,
  ),
);

if (failures.length > 0) {
  process.exit(1);
}
