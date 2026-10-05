import { type NextRequest } from "next/server";

import { runGovernedDatabaseMigrations } from "@/lib/database/governed-migration-runner";
import { getPostgresPool } from "@/lib/database/postgres";
import { activeReviewReferenceData } from "@/lib/literature/review/review-reference-service";
import { assessListednessFromKnowledgeBase } from "@/lib/listedness-intelligence/knowledge-base-listedness-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest): Promise<Response> {
  if (process.env.VERCEL_ENV !== "preview") {
    return new Response("Not found", { status: 404 });
  }

  const migration = await runGovernedDatabaseMigrations();
  const pool = getPostgresPool();

  const tenantReference =
    process.env.LISTEDNESS_E2E_TENANT_ID?.trim() ||
    process.env.DEFAULT_TENANT_KEY?.trim() ||
    "demo-tenant";

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
    return Response.json(
      {
        status: "FAILED",
        migration: {
          migrationCount: migration.migrationCount,
          maxMigration: migration.maxMigration,
          appliedCount: migration.applied.length,
          skippedCount: migration.skipped.length,
        },
        failureReasons: { NO_ACTIVE_LABEL_REFERENCE_TENANT: 1 },
      },
      { status: 424 },
    );
  }

  const tenantId = tenant.rows[0].id;
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
    return Response.json(
      {
        status: "FAILED",
        tenantKey: tenant.rows[0].tenant_key,
        migration: {
          migrationCount: migration.migrationCount,
          maxMigration: migration.maxMigration,
          appliedCount: migration.applied.length,
          skippedCount: migration.skipped.length,
        },
        productionLabelReferences: 0,
        failureReasons: { NO_PRODUCTION_LABEL_REFERENCES_WITH_SOURCE_DOCUMENT: 1 },
      },
      { status: 424 },
    );
  }

  const cases = references
    .flatMap((reference) =>
      reference.eventTerms.map((event) => ({ reference, event })),
    )
    .slice(0, 25);

  const failureReasons: Record<string, number> = {};
  const evidenceModes: Record<string, number> = {};
  let passed = 0;
  let failed = 0;

  for (const testCase of cases) {
    const result = await assessListednessFromKnowledgeBase({
      tenantId,
      clientProductId: testCase.reference.clientProductId,
      country: testCase.reference.country,
      reportedEvent: testCase.event,
      relevantDate: testCase.reference.effectiveFrom,
      requireDocumentEvidence: true,
      requestId: "preview-real-label-e2e",
      correlationId: "preview-real-label-e2e",
    });

    evidenceModes[result.retrieval.evidenceMode] =
      (evidenceModes[result.retrieval.evidenceMode] || 0) + 1;

    const ok =
      result.reference?.labelKey === testCase.reference.labelKey &&
      result.reference?.version === testCase.reference.version &&
      result.retrieval.evidenceMode === "CONTROLLED_KNOWLEDGE_DOCUMENT" &&
      result.retrieval.matchedChunks > 0 &&
      result.retrieval.citationIds.length > 0 &&
      result.assessment.listedness === "LISTED";

    if (ok) {
      passed += 1;
    } else {
      failed += 1;
      const reason = result.assessment.reasonCode || "UNKNOWN";
      failureReasons[reason] = (failureReasons[reason] || 0) + 1;
    }
  }

  return Response.json({
    status: failed === 0 && cases.length > 0 ? "PASSED" : "FAILED",
    tenantKey: tenant.rows[0].tenant_key,
    migration: {
      migrationCount: migration.migrationCount,
      maxMigration: migration.maxMigration,
      appliedCount: migration.applied.length,
      skippedCount: migration.skipped.length,
    },
    productionLabelReferences: references.length,
    tested: cases.length,
    passed,
    failed,
    evidenceModes,
    failureReasons,
  });
}
