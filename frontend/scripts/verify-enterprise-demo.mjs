import { createHash } from "node:crypto";
import process from "node:process";

import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: sslConfiguration(),
  max: 2,
  application_name: "ClinixAI Enterprise Demo Verification",
});
const tenantKey = process.env.DEMO_TENANT_KEY?.trim() || "demo-tenant";

try {
  const tenant = await pool.query(
    `SELECT id, configuration FROM tenants WHERE tenant_key = $1 AND status = 'active'`,
    [tenantKey],
  );
  if (tenant.rowCount !== 1) throw new Error(`Active demo tenant ${tenantKey} was not found.`);
  const tenantId = tenant.rows[0].id;
  if (tenant.rows[0].configuration?.syntheticDemoData !== true) {
    throw new Error("Tenant is not marked as a synthetic demo dataset.");
  }

  const checks = await pool.query(
    `SELECT
       (SELECT count(*) FROM tenant_memberships WHERE tenant_id = $1 AND membership_status = 'active') AS members,
       (SELECT count(*) FROM literature_source_connectors WHERE tenant_id = $1 AND enabled) AS sources,
       (SELECT count(*) FROM ad_hoc_literature_searches WHERE tenant_id = $1 AND search_key = 'DEMO-SEARCH-001') AS searches,
       (SELECT count(*) FROM ad_hoc_literature_results WHERE tenant_id = $1 AND match_metadata->>'syntheticDemo' = 'true') AS results,
       (SELECT count(*) FROM literature_packages WHERE tenant_id = $1 AND product_context->>'syntheticDemo' = 'true') AS packages,
       (SELECT count(*) FROM hits_results WHERE tenant_id = $1 AND result_payload->'result'->>'syntheticDemo' = 'true') AS hits,
       (SELECT count(*) FROM screening_results WHERE tenant_id = $1 AND result_payload->'result'->'findings'->0->>'comment' LIKE 'Synthetic%') AS screenings,
       (SELECT count(*) FROM ai_executions WHERE tenant_id = $1 AND token_usage->>'syntheticDemo' = 'true') AS ai_executions,
       (SELECT count(*) FROM duplicate_assessments WHERE tenant_id = $1 AND assessed_by = 'DETERMINISTIC_IDENTITY_ENGINE') AS duplicate_assessments,
       (SELECT count(*) FROM intake_input_exports WHERE tenant_id = $1 AND payload->>'synthetic_demo' = 'true') AS exports,
       (SELECT count(*) FROM audit_events WHERE tenant_id = $1 AND event_category = 'DEMO_DATASET') AS audit_events`,
    [tenantId],
  );
  const actual = Object.fromEntries(
    Object.entries(checks.rows[0]).map(([key, value]) => [key, Number(value)]),
  );
  const expected = {
    members: 5,
    sources: 3,
    searches: 1,
    results: 4,
    packages: 4,
    hits: 4,
    screenings: 3,
    ai_executions: 7,
    duplicate_assessments: 4,
    exports: 1,
    audit_events: 4,
  };
  for (const [name, minimum] of Object.entries(expected)) {
    if (actual[name] < minimum)
      throw new Error(
        `Demo verification failed for ${name}: expected at least ${minimum}, found ${actual[name]}.`,
      );
  }

  const states = await pool.query(
    `SELECT workflow_state, count(*)::integer AS count
     FROM literature_workflow_state workflow
     JOIN literature_packages package ON package.id = workflow.package_id
     WHERE workflow.tenant_id = $1 AND package.product_context->>'syntheticDemo' = 'true'
     GROUP BY workflow_state`,
    [tenantId],
  );
  const stateMap = Object.fromEntries(
    states.rows.map((row) => [row.workflow_state, Number(row.count)]),
  );
  for (const state of [
    "HITS_COMPLETE",
    "SCREENING_REVIEW",
    "SCREENING_COMPLETE",
    "INTAKE_INPUT_CREATED",
  ]) {
    if (stateMap[state] !== 1) throw new Error(`Expected exactly one synthetic ${state} package.`);
  }

  const goldenPath = await pool.query(
    `SELECT count(DISTINCT screening.id)::integer AS count
     FROM screening_results screening
     JOIN screening_reviews screening_review
       ON screening_review.tenant_id = screening.tenant_id
      AND screening_review.package_id = screening.package_id
      AND screening_review.screening_result_id = screening.id
     JOIN hits_results hits
       ON hits.tenant_id = screening.tenant_id
      AND hits.package_id = screening.package_id
     JOIN hits_reviews hits_review
       ON hits_review.tenant_id = hits.tenant_id
      AND hits_review.package_id = hits.package_id
      AND hits_review.hits_result_id = hits.id
     CROSS JOIN LATERAL jsonb_array_elements(
       COALESCE(
         screening.result_payload->'result'->'companySuspectAssessments',
         '[]'::jsonb
       )
     ) assessment
     WHERE screening.tenant_id = $1
       AND screening.decision = 'INCLUDE'
       AND screening_review.review_status = 'approved'
       AND screening_review.final_decision = 'INCLUDE'
       AND hits_review.review_status = 'approved'
       AND hits_review.decision = 'accept_ai'
       AND screening.result_payload->'result'->'patientSafetyAssessment'->>'relevance' = 'RELEVANT'
       AND screening.result_payload->'result'->'icsrAssessment'->>'conclusion' = 'POTENTIAL_ICSR'
       AND assessment->>'conclusion' = 'CONFIRMED'
       AND assessment->>'licenceStatus' = 'ACTIVE'
       AND assessment->>'companySuspect' = 'true'
       AND assessment->>'manualReviewRequired' = 'false'`,
    [tenantId],
  );
  if (Number(goldenPath.rows[0].count) < 2) {
    throw new Error(
      `Expected at least two governed synthetic INCLUDE cases ready for Screening-to-Intake handoff; found ${goldenPath.rows[0].count}.`,
    );
  }

  const exported = await pool.query(
    `SELECT content, sha256 FROM intake_input_exports
     WHERE tenant_id = $1 AND payload->>'synthetic_demo' = 'true'`,
    [tenantId],
  );
  const digest = createHash("sha256").update(exported.rows[0].content, "utf8").digest("hex");
  if (digest !== exported.rows[0].sha256)
    throw new Error("Synthetic intake_input.json integrity check failed.");
  const exportedPayload = JSON.parse(exported.rows[0].content);
  if (
    exportedPayload?.hits_assessment?.review_status !== "approved" ||
    exportedPayload?.hits_assessment?.review_decision !== "accept_ai"
  ) {
    throw new Error("Synthetic intake_input.json is missing the completed human Hits review.");
  }
  const exportedCompanyAssessment =
    exportedPayload?.screening_assessment?.result?.companySuspectAssessments?.[0];
  if (
    exportedPayload?.screening_assessment?.final_decision !== "INCLUDE" ||
    exportedPayload?.screening_assessment?.review_status !== "approved" ||
    exportedCompanyAssessment?.conclusion !== "CONFIRMED" ||
    exportedCompanyAssessment?.licenceStatus !== "ACTIVE" ||
    exportedCompanyAssessment?.companySuspect !== true
  ) {
    throw new Error(
      "Synthetic intake_input.json is missing the governed Screening/Product-Master handoff evidence.",
    );
  }

  const prohibited = await pool.query(
    `SELECT count(*)::integer AS count FROM ad_hoc_literature_results
     WHERE tenant_id = $1 AND match_metadata->>'syntheticDemo' = 'true'
       AND lower(coalesce(abstract_text, '')) NOT LIKE '%entirely synthetic%'`,
    [tenantId],
  );
  if (prohibited.rows[0].count !== 0)
    throw new Error("One or more demo abstracts are not explicitly marked synthetic.");

  console.log("Enterprise demo dataset verification passed.");
  console.table([
    {
      tenant: tenantKey,
      ...actual,
      workflow_states: JSON.stringify(stateMap),
      governed_golden_path_cases: Number(goldenPath.rows[0].count),
      intake_sha256: digest,
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
