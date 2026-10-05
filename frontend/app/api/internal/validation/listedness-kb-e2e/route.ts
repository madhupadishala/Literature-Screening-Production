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

  const tenantReference =
    process.env.LISTEDNESS_E2E_TENANT_ID?.trim() ||
    process.env.DEFAULT_TENANT_KEY?.trim() ||
    "demo-tenant";

  const tenant = await getPostgresPool().query<{ id: string; tenant_key: string }>(
    `SELECT id::text, tenant_key
       FROM tenants
      WHERE id::text = $1 OR tenant_key = $1
      LIMIT 1`,
    [tenantReference],
  );
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
        failureReasons: { TENANT_NOT_FOUND: 1 },
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
    migration: {
      migrationCount: migration.migrationCount,
      maxMigration: migration.maxMigration,
      appliedCount: migration.applied.length,
      skippedCount: migration.skipped.length,
    },
    tenantConfigured: true,
    productionLabelReferences: references.length,
    tested: cases.length,
    passed,
    failed,
    evidenceModes,
    failureReasons,
  });
}
