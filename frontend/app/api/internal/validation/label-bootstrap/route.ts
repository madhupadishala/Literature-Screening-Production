import { type NextRequest } from "next/server";

import { runGovernedDatabaseMigrations } from "@/lib/database/governed-migration-runner";
import { getPostgresPool } from "@/lib/database/postgres";
import { bootstrapLabelKnowledge } from "@/lib/listedness-intelligence/label-knowledge-bootstrap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest): Promise<Response> {
  if (process.env.VERCEL_ENV !== "preview") {
    return new Response("Not found", { status: 404 });
  }

  const migration = await runGovernedDatabaseMigrations();
  const bootstrap = await bootstrapLabelKnowledge({ allowTenantCreate: true });
  const pool = getPostgresPool();

  const verification = await pool.query<{
    mapping_count: number;
    bound_document_count: number;
    unbound_count: number;
    production_scope_count: number;
    validation_scope_count: number;
    missing_effective_date_count: number;
    production_blocked_count: number;
  }>(
    `WITH active_config AS (
       SELECT v.tenant_id, v.payload
         FROM tenant_configuration_versions v
         JOIN tenant_configuration_sets s ON s.id = v.config_set_id
        WHERE v.tenant_id = $1
          AND s.resource_type = 'LABEL_REFERENCE'
          AND s.config_key = 'public-label-reference-validation'
          AND v.lifecycle_status = 'active'
        LIMIT 1
     ),
     mappings AS (
       SELECT a.tenant_id, record
         FROM active_config a
         CROSS JOIN LATERAL jsonb_array_elements(a.payload->'records') AS record
     ),
     resolved AS (
       SELECT m.record,
              d.id IS NOT NULL AS document_bound
         FROM mappings m
         LEFT JOIN controlled_knowledge_repositories r
           ON r.tenant_id = m.tenant_id
          AND r.repository_key = 'clinixai-label-knowledge'
          AND r.lifecycle_status = 'active'
         LEFT JOIN knowledge_documents d
           ON d.controlled_repository_id = r.id
          AND d.tenant_id = m.tenant_id
          AND d.document_key = m.record->>'labelKey'
     )
     SELECT
       count(*)::int AS mapping_count,
       count(*) FILTER (WHERE document_bound)::int AS bound_document_count,
       count(*) FILTER (WHERE NOT document_bound)::int AS unbound_count,
       count(*) FILTER (WHERE record->>'usageScope' = 'PRODUCTION')::int AS production_scope_count,
       count(*) FILTER (WHERE record->>'usageScope' = 'VALIDATION_ONLY')::int AS validation_scope_count,
       count(*) FILTER (
         WHERE coalesce(record->>'effectiveFrom', '') = ''
       )::int AS missing_effective_date_count,
       count(*) FILTER (
         WHERE coalesce((record->>'productionUseBlocked')::boolean, false) = true
       )::int AS production_blocked_count
     FROM resolved`,
    [bootstrap.tenantId],
  );

  const row = verification.rows[0];

  return Response.json({
    status:
      row &&
      row.mapping_count > 0 &&
      row.mapping_count === row.bound_document_count &&
      row.unbound_count === 0 &&
      row.production_scope_count === 0
        ? "PASSED"
        : "FAILED",
    migration: {
      migrationCount: migration.migrationCount,
      maxMigration: migration.maxMigration,
      applied: migration.applied,
      skippedCount: migration.skipped.length,
    },
    bootstrap,
    bindingVerification: row,
  });
}
