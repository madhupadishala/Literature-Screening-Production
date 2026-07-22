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
  application_name: "ClinixAI Enterprise Demo Seed",
});

const tenantKey = process.env.DEMO_TENANT_KEY?.trim() || "demo-tenant";
const tenantName =
  process.env.DEMO_TENANT_NAME?.trim() || "ClinixAI Synthetic Literature Demonstration";
const ids = {
  search: "10000000-0000-4000-8000-000000000001",
  packages: [
    "20000000-0000-4000-8000-000000000001",
    "20000000-0000-4000-8000-000000000002",
    "20000000-0000-4000-8000-000000000003",
    "20000000-0000-4000-8000-000000000004",
  ],
  results: [
    "30000000-0000-4000-8000-000000000001",
    "30000000-0000-4000-8000-000000000002",
    "30000000-0000-4000-8000-000000000003",
    "30000000-0000-4000-8000-000000000004",
  ],
  hits: [
    "40000000-0000-4000-8000-000000000001",
    "40000000-0000-4000-8000-000000000002",
    "40000000-0000-4000-8000-000000000003",
    "40000000-0000-4000-8000-000000000004",
  ],
  hitReviews: [
    "41000000-0000-4000-8000-000000000001",
    "41000000-0000-4000-8000-000000000002",
    "41000000-0000-4000-8000-000000000003",
    "41000000-0000-4000-8000-000000000004",
  ],
  screenings: [
    "50000000-0000-4000-8000-000000000001",
    "50000000-0000-4000-8000-000000000002",
    "50000000-0000-4000-8000-000000000003",
  ],
  hitExecutions: [
    "80000000-0000-4000-8000-000000000001",
    "80000000-0000-4000-8000-000000000002",
    "80000000-0000-4000-8000-000000000003",
    "80000000-0000-4000-8000-000000000004",
  ],
  screeningExecutions: [
    "81000000-0000-4000-8000-000000000001",
    "81000000-0000-4000-8000-000000000002",
    "81000000-0000-4000-8000-000000000003",
  ],
  screeningReviews: [
    "51000000-0000-4000-8000-000000000001",
    "51000000-0000-4000-8000-000000000002",
    "51000000-0000-4000-8000-000000000003",
  ],
  export: "60000000-0000-4000-8000-000000000001",
};

const articles = [
  article(
    "SYNTH-10001",
    "10.5555/clinix.demo.10001",
    "Synthetic report of febrile reaction following Acmevir exposure",
    "Acmevir",
    "INCLUDE",
    "INTAKE_INPUT_CREATED",
  ),
  article(
    "SYNTH-10002",
    "10.5555/clinix.demo.10002",
    "Synthetic literature case describing dizziness during Acmevir therapy",
    "Acmevir",
    "INCLUDE",
    "SCREENING_COMPLETE",
  ),
  article(
    "SYNTH-10003",
    "10.5555/clinix.demo.10003",
    "Synthetic review of hepatic monitoring with Betazol",
    "Betazol",
    "REVIEW",
    "SCREENING_REVIEW",
  ),
  article(
    "SYNTH-10004",
    "10.5555/clinix.demo.10004",
    "Synthetic observational safety summary for Cardiomab",
    "Cardiomab",
    "INCLUDE",
    "HITS_COMPLETE",
  ),
];

const users = [
  ["demo.admin@theclinixai.local", "Demo Administrator", "CLIENT_ADMIN"],
  ["demo.pv@theclinixai.local", "Demo PV Lead", "PV_ADMINISTRATOR"],
  ["demo.reviewer@theclinixai.local", "Demo Literature Reviewer", "LITERATURE_REVIEWER"],
  ["demo.qc@theclinixai.local", "Demo Quality Reviewer", "QUALITY_APPROVER"],
  ["demo.auditor@theclinixai.local", "Demo Auditor", "AUDITOR"],
];

const client = await pool.connect();
try {
  await client.query("BEGIN");
  await assertMigrations(client);
  const tenant = await client.query(
    `INSERT INTO tenants (tenant_key, display_name, status, configuration)
     VALUES ($1, $2, 'active', $3::jsonb)
     ON CONFLICT (tenant_key) DO UPDATE SET display_name = EXCLUDED.display_name,
       configuration = tenants.configuration || EXCLUDED.configuration, updated_at = now()
     RETURNING id`,
    [
      tenantKey,
      tenantName,
      JSON.stringify({ syntheticDemoData: true, containsRealPatientData: false }),
    ],
  );
  const tenantId = tenant.rows[0].id;
  const userIds = new Map();
  for (const [email, displayName, roleKey] of users) {
    const user = await client.query(
      `INSERT INTO application_users (email, display_name, status)
       VALUES ($1, $2, 'active') ON CONFLICT (email) DO UPDATE SET
         display_name = EXCLUDED.display_name, status = 'active', updated_at = now()
       RETURNING id`,
      [email, displayName],
    );
    userIds.set(roleKey, user.rows[0].id);
    await client.query(
      `INSERT INTO tenant_memberships (
         tenant_id, user_id, role_key, permissions, membership_status,
         membership_version, updated_by, updated_at
       ) VALUES ($1, $2, $3, '[]'::jsonb, 'active', 1, $2, now())
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET role_key = EXCLUDED.role_key,
         membership_status = 'active', updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [tenantId, user.rows[0].id, roleKey],
    );
  }
  const adminId = userIds.get("CLIENT_ADMIN");
  const reviewerId = userIds.get("LITERATURE_REVIEWER");
  const qualityId = userIds.get("QUALITY_APPROVER");

  for (const source of [
    [
      "PUBMED",
      "PubMed / MEDLINE",
      "PUBMED_EUTILITIES",
      "https://eutils.ncbi.nlm.nih.gov/entrez/eutils",
    ],
    [
      "EUROPE_PMC",
      "Europe PMC",
      "EUROPE_PMC_REST",
      "https://www.ebi.ac.uk/europepmc/webservices/rest/search",
    ],
    ["CROSSREF", "Crossref", "CROSSREF_REST", "https://api.crossref.org/v1/works"],
  ]) {
    await client.query(
      `INSERT INTO literature_source_connectors (
         tenant_id, source_key, display_name, connector_type, enabled, base_url,
         max_results, settings, created_by, updated_by
       ) VALUES ($1, $2, $3, $4, true, $5, 200, $6::jsonb, $7, $7)
       ON CONFLICT (tenant_id, source_key) DO UPDATE SET enabled = true,
         display_name = EXCLUDED.display_name, connector_type = EXCLUDED.connector_type,
         base_url = EXCLUDED.base_url, settings = EXCLUDED.settings, updated_at = now()`,
      [
        tenantId,
        source[0],
        source[1],
        source[2],
        source[3],
        JSON.stringify({ syntheticDemo: true }),
        adminId,
      ],
    );
  }

  await client.query(
    `INSERT INTO ad_hoc_literature_searches (
       id, search_key, tenant_id, executed_by, criteria, selected_sources,
       translated_queries, status, result_count, selected_count, duration_ms,
       connector_errors, created_at, completed_at
     ) VALUES ($1, 'DEMO-SEARCH-001', $2, $3, $4::jsonb, $5::jsonb,
       $6::jsonb, 'completed', 4, 4, 1280, '{}'::jsonb, now() - interval '4 hours', now() - interval '4 hours')
     ON CONFLICT (id) DO UPDATE SET criteria = EXCLUDED.criteria,
       result_count = 4, selected_count = 4, status = 'completed'`,
    [
      ids.search,
      tenantId,
      reviewerId,
      JSON.stringify({
        booleanQuery: "(Acmevir OR Betazol OR Cardiomab) AND safety",
        syntheticDemo: true,
      }),
      JSON.stringify(["PUBMED", "EUROPE_PMC", "CROSSREF"]),
      JSON.stringify({
        PUBMED: "synthetic safety query",
        EUROPE_PMC: "synthetic safety query",
        CROSSREF: "synthetic safety query",
      }),
    ],
  );

  for (let index = 0; index < articles.length; index += 1) {
    const item = articles[index];
    const packageId = ids.packages[index];
    await client.query(
      `INSERT INTO literature_packages (
         id, tenant_id, package_key, source_type, external_reference,
         article_identity, product_context, status, created_by, created_at, updated_at
       ) VALUES ($1, $2, $3, 'LITERATURE', $4, $5::jsonb, $6::jsonb, $7, $8,
         now() - ($9::integer * interval '1 hour'), now() - ($9::integer * interval '10 minutes'))
       ON CONFLICT (id) DO UPDATE SET article_identity = EXCLUDED.article_identity,
         product_context = EXCLUDED.product_context, status = EXCLUDED.status, updated_at = EXCLUDED.updated_at`,
      [
        packageId,
        tenantId,
        `DEMO-PKG-${String(index + 1).padStart(3, "0")}`,
        item.pmid,
        JSON.stringify(item.identity),
        JSON.stringify({
          productName: item.product,
          countryOfInterest: "United States",
          syntheticDemo: true,
        }),
        item.state,
        reviewerId,
        8 - index,
      ],
    );
    await client.query(
      `INSERT INTO literature_workflow_state (
         package_id, tenant_id, workflow_state, state_version, state_payload, updated_by, updated_at
       ) VALUES ($1, $2, $3, 1, $4::jsonb, $5, now() - ($6::integer * interval '10 minutes'))
       ON CONFLICT (package_id) DO UPDATE SET workflow_state = EXCLUDED.workflow_state,
         state_payload = EXCLUDED.state_payload, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at`,
      [
        packageId,
        tenantId,
        item.state,
        JSON.stringify({ syntheticDemo: true, demoScenario: item.state }),
        reviewerId,
        4 - index,
      ],
    );
    await client.query(
      `INSERT INTO ad_hoc_literature_results (
         id, search_id, tenant_id, source_key, source_record_id, pmid, doi, title,
         authors, journal, publication_date, language, publication_type, abstract_text,
         landing_url, full_text_status, match_metadata, dedupe_key, selected,
         evidence_package_id, created_at
       ) VALUES ($1, $2, $3, 'PUBMED', $4, $4, $5, $6, $7::jsonb,
         'Journal of Synthetic Pharmacovigilance', current_date - ($8::integer * interval '30 days'),
         'English', 'Synthetic Case Report', $9, $10, 'abstract', $11::jsonb,
         $5, true, $12, now() - interval '4 hours')
       ON CONFLICT (id) DO UPDATE SET selected = true, evidence_package_id = EXCLUDED.evidence_package_id`,
      [
        ids.results[index],
        ids.search,
        tenantId,
        item.pmid,
        item.doi,
        item.identity.title,
        JSON.stringify(item.identity.authors),
        index + 1,
        item.identity.abstract,
        `https://example.invalid/synthetic/${item.pmid}`,
        JSON.stringify({ syntheticDemo: true }),
        packageId,
      ],
    );
    await client.query(
      `INSERT INTO literature_package_sources (
         tenant_id, package_id, search_result_id, source_key, source_record_id,
         pmid, doi, landing_url
       ) VALUES ($1, $2, $3, 'PUBMED', $4, $4, $5, $6)
       ON CONFLICT (tenant_id, package_id, source_key, source_record_id) DO NOTHING`,
      [
        tenantId,
        packageId,
        ids.results[index],
        item.pmid,
        item.doi,
        `https://example.invalid/synthetic/${item.pmid}`,
      ],
    );
    await client.query(
      `INSERT INTO duplicate_assessments (
         tenant_id, candidate_result_id, canonical_package_id, classification,
         confidence, match_signals, assessed_by, assessed_at
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb,
         'DETERMINISTIC_IDENTITY_ENGINE', now() - interval '3 hours')
       ON CONFLICT (tenant_id, candidate_result_id) DO UPDATE SET
         canonical_package_id = EXCLUDED.canonical_package_id,
         classification = EXCLUDED.classification, confidence = EXCLUDED.confidence,
         match_signals = EXCLUDED.match_signals`,
      [
        tenantId,
        ids.results[index],
        packageId,
        index === 2 ? "possible_duplicate" : "unique",
        index === 2 ? 0.72 : 0.99,
        JSON.stringify(
          index === 2
            ? ["synthetic_title_similarity", "shared_product_term"]
            : ["unique_pmid", "unique_doi"],
        ),
      ],
    );
    await client.query(
      `INSERT INTO ai_executions (
         id, tenant_id, package_id, execution_type, provider, model, request_id,
         input_sha256, status, latency_ms, token_usage, created_at, completed_at
       ) VALUES ($1, $2, $3, 'hits', 'OPENAI', 'demo-controlled-model', $4,
         $5, 'succeeded', $6, $7::jsonb, now() - interval '3 hours', now() - interval '3 hours')
       ON CONFLICT (id) DO UPDATE SET latency_ms = EXCLUDED.latency_ms,
         status = 'succeeded', token_usage = EXCLUDED.token_usage`,
      [
        ids.hitExecutions[index],
        tenantId,
        packageId,
        `demo-hits-${index + 1}`,
        sha256(JSON.stringify(item.identity)),
        820 + index * 430,
        JSON.stringify({
          promptTokens: 420 + index * 20,
          completionTokens: 180 + index * 10,
          syntheticDemo: true,
        }),
      ],
    );
    const hitsPayload = {
      result: {
        detectedProducts: [item.product],
        detectedEvents: [item.event],
        detectedSpecialSituations: [],
        confidence: 91 - index * 4,
        syntheticDemo: true,
      },
      article: item.identity,
      generatedAt: new Date().toISOString(),
    };
    await client.query(
      `INSERT INTO hits_results (id, tenant_id, package_id, execution_id, result_version, result_payload, confidence)
       VALUES ($1, $2, $3, $4, 1, $5::jsonb, $6)
       ON CONFLICT (id) DO UPDATE SET result_payload = EXCLUDED.result_payload, confidence = EXCLUDED.confidence`,
      [
        ids.hits[index],
        tenantId,
        packageId,
        ids.hitExecutions[index],
        JSON.stringify(hitsPayload),
        (91 - index * 4) / 100,
      ],
    );
    await client.query(
      `INSERT INTO hits_reviews (
         id, tenant_id, package_id, hits_result_id, review_status, decision,
         comments, reviewed_by, reviewed_at, review_version
       ) VALUES ($1, $2, $3, $4, 'approved', 'accept_ai',
         'Synthetic demo evidence verified for controlled presentation.', $5, now() - interval '2 hours', 1)
       ON CONFLICT (id) DO UPDATE SET review_status = 'approved', decision = 'accept_ai'`,
      [ids.hitReviews[index], tenantId, packageId, ids.hits[index], qualityId],
    );
    await client.query(
      `INSERT INTO package_configuration_snapshots (
         package_id, tenant_id, search_execution_id, snapshot_payload
       ) VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (package_id) DO UPDATE SET snapshot_payload = EXCLUDED.snapshot_payload`,
      [
        packageId,
        tenantId,
        ids.search,
        JSON.stringify({
          syntheticDemo: true,
          productMasterVersion: "DEMO-PM-1",
          guidelineVersion: "DEMO-SOP-1",
        }),
      ],
    );
    if (index < 3) {
      await client.query(
        `INSERT INTO ai_executions (
           id, tenant_id, package_id, execution_type, provider, model, request_id,
           input_sha256, status, latency_ms, token_usage, created_at, completed_at
         ) VALUES ($1, $2, $3, 'screening', 'OPENAI', 'demo-controlled-model', $4,
           $5, 'succeeded', $6, $7::jsonb, now() - interval '2 hours', now() - interval '2 hours')
         ON CONFLICT (id) DO UPDATE SET latency_ms = EXCLUDED.latency_ms,
           status = 'succeeded', token_usage = EXCLUDED.token_usage`,
        [
          ids.screeningExecutions[index],
          tenantId,
          packageId,
          `demo-screening-${index + 1}`,
          sha256(JSON.stringify(item.identity)),
          1150 + index * 680,
          JSON.stringify({
            promptTokens: 610 + index * 30,
            completionTokens: 240 + index * 15,
            syntheticDemo: true,
          }),
        ],
      );
      const screeningPayload = {
        result: {
          decision: item.decision,
          confidence: 88 - index * 5,
          reason: item.decision === "REVIEW" ? "INSUFFICIENT_INFORMATION" : "ADVERSE_EVENT",
          findings: [
            {
              rule: "Synthetic safety evidence",
              passed: item.decision !== "REVIEW",
              score: 90 - index * 5,
              comment: "Synthetic evidence created exclusively for product demonstration.",
            },
          ],
        },
        article: item.identity,
        generatedAt: new Date().toISOString(),
      };
      await client.query(
        `INSERT INTO screening_results (
           id, tenant_id, package_id, execution_id, result_version, decision, result_payload, confidence
         ) VALUES ($1, $2, $3, $4, 1, $5, $6::jsonb, $7)
         ON CONFLICT (id) DO UPDATE SET decision = EXCLUDED.decision,
           result_payload = EXCLUDED.result_payload, confidence = EXCLUDED.confidence`,
        [
          ids.screenings[index],
          tenantId,
          packageId,
          ids.screeningExecutions[index],
          item.decision,
          JSON.stringify(screeningPayload),
          (88 - index * 5) / 100,
        ],
      );
      const approved = index < 2;
      await client.query(
        `INSERT INTO screening_reviews (
           id, tenant_id, package_id, screening_result_id, review_status,
           final_decision, comments, reviewed_by, reviewed_at, review_version
         ) VALUES ($1, $2, $3, $4, $5, $6,
           'Synthetic demo screening rationale documented for review.', $7, now() - interval '1 hour', 1)
         ON CONFLICT (id) DO UPDATE SET review_status = EXCLUDED.review_status,
           final_decision = EXCLUDED.final_decision, comments = EXCLUDED.comments`,
        [
          ids.screeningReviews[index],
          tenantId,
          packageId,
          ids.screenings[index],
          approved ? "approved" : "flagged",
          approved ? "INCLUDE" : "REVIEW",
          qualityId,
        ],
      );
    }
  }

  const first = articles[0];
  const intakePayload = {
    schema_version: "clinixai.literature.intake-input.v1",
    intake_input_id: ids.export,
    export_version: 1,
    source_system: "CLINIXAI_LITERATURE_INTELLIGENCE",
    downstream_target: "PV_NEXUS_COMMON_INTAKE",
    processing_status: "READY_FOR_DOWNSTREAM_IMPORT",
    synthetic_demo: true,
    contains_real_patient_data: false,
    package: { package_id: ids.packages[0], package_key: "DEMO-PKG-001" },
    article: first.identity,
    product_context: { productName: first.product, countryOfInterest: "United States" },
    screening_assessment: { final_decision: "INCLUDE", review_status: "approved" },
  };
  const content = JSON.stringify(intakePayload);
  const payloadHash = sha256(content);
  const lineageHash = sha256(
    JSON.stringify({
      screening_result_id: ids.screenings[0],
      screening_review_id: ids.screeningReviews[0],
      demo: true,
    }),
  );
  await client.query(
    `INSERT INTO intake_input_exports (
       id, tenant_id, package_id, screening_result_id, screening_review_id,
       export_version, schema_version, file_name, payload, content, sha256,
       source_lineage_sha256, generated_by, generated_at
     ) VALUES ($1, $2, $3, $4, $5, 1, 'clinixai.literature.intake-input.v1',
       'intake_input.json', $6::jsonb, $7, $8, $9, $10, now() - interval '30 minutes')
     ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, content = EXCLUDED.content,
       sha256 = EXCLUDED.sha256, source_lineage_sha256 = EXCLUDED.source_lineage_sha256`,
    [
      ids.export,
      tenantId,
      ids.packages[0],
      ids.screenings[0],
      ids.screeningReviews[0],
      content,
      content,
      payloadHash,
      lineageHash,
      qualityId,
    ],
  );
  await client.query(
    `INSERT INTO evidence_artifacts (
       tenant_id, package_id, artifact_type, storage_backend, storage_key,
       media_type, sha256, size_bytes, metadata
     ) VALUES ($1, $2, 'INTAKE_INPUT_JSON', 'postgresql', $3,
       'application/json', $4, $5, $6::jsonb)
     ON CONFLICT (tenant_id, package_id, artifact_type, storage_key) DO UPDATE SET
       sha256 = EXCLUDED.sha256, size_bytes = EXCLUDED.size_bytes, metadata = EXCLUDED.metadata`,
    [
      tenantId,
      ids.packages[0],
      `intake-input/${ids.export}/intake_input.json`,
      payloadHash,
      Buffer.byteLength(content),
      JSON.stringify({ syntheticDemo: true, exportId: ids.export }),
    ],
  );

  for (let index = 0; index < articles.length; index += 1) {
    await client.query(
      `INSERT INTO audit_events (
         id, tenant_id, package_id, actor_id, event_type, event_category, outcome, details,
         occurred_at
       ) VALUES ($1::uuid, $2, $3, $4, $5, 'DEMO_DATASET', 'success', $6::jsonb,
         now() - ($7::integer * interval '20 minutes'))
       ON CONFLICT (id) DO NOTHING`,
      [
        `70000000-0000-4000-8000-00000000000${index + 1}`,
        tenantId,
        ids.packages[index],
        reviewerId,
        "SYNTHETIC_DEMO_SCENARIO_READY",
        JSON.stringify({ syntheticDemo: true, workflowState: articles[index].state }),
        index + 1,
      ],
    );
  }
  await client.query("COMMIT");
  console.log(`Enterprise demo dataset ready for tenant ${tenantKey}.`);
  console.table(
    articles.map((item, index) => ({
      package: `DEMO-PKG-${String(index + 1).padStart(3, "0")}`,
      pmid: item.pmid,
      product: item.product,
      state: item.state,
    })),
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}

function article(pmid, doi, title, product, decision, state) {
  return {
    pmid,
    doi,
    product,
    decision,
    state,
    event:
      product === "Acmevir" ? "Synthetic febrile or dizziness event" : "Synthetic monitoring event",
    identity: {
      pmid,
      doi,
      title,
      journal: "Journal of Synthetic Pharmacovigilance",
      publicationDate: "2026-06-15",
      authors: ["Synthetic Author Group"],
      language: "English",
      abstract:
        "Entirely synthetic literature abstract for ClinixAI demonstration. It contains no real patient, reporter, or clinical data.",
    },
  };
}

async function assertMigrations(database) {
  const result = await database.query(
    `SELECT migration_id FROM clinixai_schema_migrations
     WHERE migration_id = ANY($1::text[])`,
    [["001", "002", "003", "004", "005", "006", "007", "008", "009", "010", "011", "012", "013"]],
  );
  if (result.rowCount !== 13)
    throw new Error(
      `All migrations 001-013 are required before seeding; found ${result.rowCount}.`,
    );
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function sslConfiguration() {
  const mode = process.env.DATABASE_SSL_MODE?.trim().toLowerCase();
  if (!mode || mode === "disable") return false;
  if (mode === "no-verify" || mode === "require") return { rejectUnauthorized: false };
  if (mode === "verify-full") return { rejectUnauthorized: true };
  throw new Error("DATABASE_SSL_MODE must be disable, no-verify, require, or verify-full.");
}
