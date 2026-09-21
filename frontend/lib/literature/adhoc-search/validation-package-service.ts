import "server-only";

import { createHash } from "node:crypto";
import { getPostgresPool } from "@/lib/database/postgres";
import {
  configurationSnapshotPayload,
  resolveActiveConfigurations,
} from "@/lib/configuration/active-resolver";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";

type ValidationSearchRow = {
  id: string;
  search_id: string;
  search_key: string;
  search_criteria: Record<string, unknown>;
  selected_sources: unknown;
  translated_queries: Record<string, unknown>;
  search_created_at: string;
  search_completed_at: string | null;
  source_key: string;
  source_record_id: string;
  pmid: string | null;
  doi: string | null;
  title: string;
  authors: unknown;
  journal: string | null;
  publication_date: string | null;
  language: string | null;
  publication_type: string | null;
  abstract_text: string | null;
  landing_url: string | null;
  full_text_status: string;
  match_metadata: Record<string, unknown>;
  dedupe_key: string;
  evidence_package_id: string | null;
};

export type ValidationPackageResult = {
  validationPackageId: string;
  validationKey: string;
  identityKey: string;
  title: string;
  pmid: string | null;
  doi: string | null;
  sourceResultIds: string[];
  mergedSources: string[];
  sha256: string;
  reused: boolean;
  handoffPackageId: string | null;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function richness(row: ValidationSearchRow): number {
  return (
    (row.abstract_text?.trim().length || 0) * 10 +
    (row.doi ? 100 : 0) +
    (row.publication_type ? 20 : 0) +
    (row.journal ? 10 : 0)
  );
}

export async function createValidationPackagesFromSearch(input: {
  principal: RequestPrincipal;
  resultIds: string[];
}): Promise<ValidationPackageResult[]> {
  const resultIds = [...new Set(input.resultIds.map((id) => id.trim()).filter(Boolean))];
  if (resultIds.length === 0) {
    throw new Error("Select at least one literature result.");
  }
  if (resultIds.length > 100) {
    throw new Error("A maximum of 100 search results can be packaged in one action.");
  }

  const pool = getPostgresPool();
  const selected = await pool.query<ValidationSearchRow>(
    `SELECT
       result.*,
       search.search_key,
       search.criteria AS search_criteria,
       search.selected_sources,
       search.translated_queries,
       search.created_at AS search_created_at,
       search.completed_at AS search_completed_at
     FROM ad_hoc_literature_results result
     JOIN ad_hoc_literature_searches search
       ON search.id = result.search_id
      AND search.tenant_id = result.tenant_id
     WHERE result.tenant_id = $1
       AND result.id = ANY($2::uuid[])
     ORDER BY result.created_at`,
    [input.principal.tenantId, resultIds],
  );

  if (selected.rows.length !== resultIds.length) {
    throw new Error("One or more selected results were not found in the active tenant.");
  }

  const active = await resolveActiveConfigurations(input.principal.tenantId);
  const configurationSnapshot = configurationSnapshotPayload(active);

  const grouped = new Map<string, ValidationSearchRow[]>();
  for (const row of selected.rows) {
    const rows = grouped.get(row.dedupe_key) || [];
    rows.push(row);
    grouped.set(row.dedupe_key, rows);
  }

  const output: ValidationPackageResult[] = [];

  for (const groupRows of grouped.values()) {
    const rows = [...groupRows].sort((a, b) => richness(b) - richness(a));
    const primary = rows[0];
    const sourceResultIds = rows.map((row) => row.id).sort();
    const stableConfigurationSnapshot = {
      ...configurationSnapshot,
      capturedAt: undefined,
    };
    const fingerprint = sha256(
      JSON.stringify({
        searchId: primary.search_id,
        identityKey: primary.dedupe_key,
        sourceResultIds,
        configurationSnapshot: stableConfigurationSnapshot,
      }),
    );
    const validationKey = `VAL-${fingerprint.slice(0, 24)}`;
    const createdAt = new Date().toISOString();

    const payload = {
      schema_version: "clinixai.literature.validation-package.v1",
      validation_key: validationKey,
      package_purpose: "SEARCH_RESULT_VALIDATION",
      workflow_effect: "NONE",
      operational_handoff: false,
      search: {
        id: primary.search_id,
        key: primary.search_key,
        criteria: primary.search_criteria,
        selected_sources: primary.selected_sources,
        translated_queries: primary.translated_queries,
        executed_at: primary.search_created_at,
        completed_at: primary.search_completed_at,
      },
      canonical_article: {
        identity_key: primary.dedupe_key,
        pmid: primary.pmid,
        doi: primary.doi,
        title: primary.title,
        authors: primary.authors,
        journal: primary.journal,
        publication_date: primary.publication_date,
        language: primary.language,
        publication_type: primary.publication_type,
        abstract: primary.abstract_text,
        full_text_status: primary.full_text_status,
        match_metadata: primary.match_metadata,
      },
      source_records: rows.map((row) => ({
        result_id: row.id,
        source_key: row.source_key,
        source_record_id: row.source_record_id,
        pmid: row.pmid,
        doi: row.doi,
        landing_url: row.landing_url,
      })),
      duplicate_context: {
        merged_source_count: rows.length,
        merged_sources: [...new Set(rows.map((row) => row.source_key))],
        dedupe_key: primary.dedupe_key,
      },
      configuration_snapshot: configurationSnapshot,
      governance: {
        immutable_snapshot: true,
        created_at: createdAt,
        created_by: input.principal.email,
        content_fingerprint: fingerprint,
      },
    };

    const serialized = JSON.stringify(payload);
    const contentHash = sha256(serialized);

    const compatibleExisting = await pool.query<{
      id: string;
      validation_key: string;
      content_sha256: string;
      handoff_package_id: string | null;
    }>(
      `SELECT id, validation_key, content_sha256, handoff_package_id
       FROM literature_validation_packages
       WHERE tenant_id = $1
         AND search_id = $2
         AND identity_key = $3
         AND selected_result_ids = $4::jsonb
         AND ((payload->'configuration_snapshot') - 'capturedAt')
           = ($5::jsonb - 'capturedAt')
       ORDER BY (handoff_package_id IS NOT NULL) DESC, created_at ASC
       LIMIT 1`,
      [
        input.principal.tenantId,
        primary.search_id,
        primary.dedupe_key,
        JSON.stringify(sourceResultIds),
        JSON.stringify(configurationSnapshot),
      ],
    );

    let validationPackageId: string;
    let effectiveValidationKey = validationKey;
    let effectiveContentHash = contentHash;
    let handoffPackageId: string | null;
    let reused = false;

    if (compatibleExisting.rows[0]) {
      reused = true;
      validationPackageId = compatibleExisting.rows[0].id;
      effectiveValidationKey = compatibleExisting.rows[0].validation_key;
      effectiveContentHash = compatibleExisting.rows[0].content_sha256;
      handoffPackageId = compatibleExisting.rows[0].handoff_package_id;
    } else {
      const inserted = await pool.query<{
        id: string;
        validation_key: string;
        content_sha256: string;
        handoff_package_id: string | null;
      }>(
        `INSERT INTO literature_validation_packages (
           tenant_id,
           validation_key,
           search_id,
           identity_key,
           selected_result_ids,
           payload,
           content_sha256,
           created_by
         )
         VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8)
         ON CONFLICT (tenant_id, validation_key) DO NOTHING
         RETURNING id, validation_key, content_sha256, handoff_package_id`,
        [
          input.principal.tenantId,
          effectiveValidationKey,
          primary.search_id,
          primary.dedupe_key,
          JSON.stringify(sourceResultIds),
          serialized,
          contentHash,
          input.principal.userId,
        ],
      );

      if (inserted.rows[0]) {
        validationPackageId = inserted.rows[0].id;
        effectiveValidationKey = inserted.rows[0].validation_key;
        effectiveContentHash = inserted.rows[0].content_sha256;
        handoffPackageId = inserted.rows[0].handoff_package_id;
      } else {
        reused = true;
        const existing = await pool.query<{
          id: string;
          validation_key: string;
          content_sha256: string;
          handoff_package_id: string | null;
        }>(
          `SELECT id, validation_key, content_sha256, handoff_package_id
           FROM literature_validation_packages
           WHERE tenant_id = $1 AND validation_key = $2
           LIMIT 1`,
          [input.principal.tenantId, validationKey],
        );
        if (!existing.rows[0]) {
          throw new Error("Existing Validation Package could not be resolved.");
        }
        validationPackageId = existing.rows[0].id;
        effectiveValidationKey = existing.rows[0].validation_key;
        effectiveContentHash = existing.rows[0].content_sha256;
        handoffPackageId = existing.rows[0].handoff_package_id;
      }
    }

    const existingHandoffPackageId =
      rows.map((row) => row.evidence_package_id).find((value) => Boolean(value)) || null;
    if (!handoffPackageId && existingHandoffPackageId) {
      handoffPackageId = existingHandoffPackageId;
      await pool.query(
        `UPDATE literature_validation_packages
         SET
           handoff_package_id = COALESCE(handoff_package_id, $3),
           handed_off_at = COALESCE(handed_off_at, now())
         WHERE tenant_id = $1 AND id = $2`,
        [input.principal.tenantId, validationPackageId, existingHandoffPackageId],
      );
    }

    await pool.query(
      `INSERT INTO audit_events (
         tenant_id, package_id, actor_id, event_type, event_category, outcome, details
       )
       VALUES ($1,NULL,$2,$3,'LITERATURE_VALIDATION','success',$4::jsonb)`,
      [
        input.principal.tenantId,
        input.principal.userId,
        reused ? "VALIDATION_PACKAGE_REUSED" : "VALIDATION_PACKAGE_CREATED",
        JSON.stringify({
          validationPackageId,
          validationKey: effectiveValidationKey,
          searchId: primary.search_id,
          identityKey: primary.dedupe_key,
          sourceResultIds,
          contentSha256: effectiveContentHash,
          workflowEffect: "NONE",
        }),
      ],
    );

    output.push({
      validationPackageId,
      validationKey: effectiveValidationKey,
      identityKey: primary.dedupe_key,
      title: primary.title,
      pmid: primary.pmid,
      doi: primary.doi,
      sourceResultIds,
      mergedSources: [...new Set(rows.map((row) => row.source_key))],
      sha256: effectiveContentHash,
      reused,
      handoffPackageId,
    });
  }

  return output;
}

export async function linkValidationPackagesToHits(input: {
  principal: RequestPrincipal;
  validationPackages: ValidationPackageResult[];
}): Promise<ValidationPackageResult[]> {
  const pool = getPostgresPool();
  const linked: ValidationPackageResult[] = [];

  for (const validationPackage of input.validationPackages) {
    const handoff = await pool.query<{
      package_id: string;
      execution_purpose: string;
      search_id: string;
      search_key: string;
    }>(
      `SELECT result.evidence_package_id AS package_id,
         COALESCE(search.criteria->>'executionPurpose', 'TEST_VALIDATION') AS execution_purpose,
         search.id::text AS search_id,
         search.search_key
       FROM ad_hoc_literature_results result
       JOIN ad_hoc_literature_searches search
         ON search.id = result.search_id
        AND search.tenant_id = result.tenant_id
       WHERE result.tenant_id = $1
         AND result.dedupe_key = $2
         AND result.evidence_package_id IS NOT NULL
       ORDER BY result.created_at DESC
       LIMIT 1`,
      [input.principal.tenantId, validationPackage.identityKey],
    );

    const packageId = handoff.rows[0]?.package_id || null;
    if (!packageId) {
      linked.push(validationPackage);
      continue;
    }

    await pool.query(
      `UPDATE literature_validation_packages
       SET
         handoff_package_id = COALESCE(handoff_package_id, $3),
         handed_off_at = COALESCE(handed_off_at, now())
       WHERE tenant_id = $1 AND id = $2`,
      [input.principal.tenantId, validationPackage.validationPackageId, packageId],
    );

    await pool.query(
      `INSERT INTO audit_events (
         tenant_id, package_id, actor_id, event_type, event_category, outcome, details
       )
       VALUES ($1,$2,$3,$4,
         'LITERATURE_HANDOFF','success',$5::jsonb)`,
      [
        input.principal.tenantId,
        packageId,
        input.principal.userId,
        handoff.rows[0].execution_purpose === "TEST_VALIDATION"
          ? "TEST_SEARCH_RESULT_PROMOTED_TO_PV_WORKFLOW"
          : "PRODUCTION_SEARCH_RESULT_PROMOTED_TO_HITS",
        JSON.stringify({
          validationPackageId: validationPackage.validationPackageId,
          validationKey: validationPackage.validationKey,
          identityKey: validationPackage.identityKey,
          sourceSearchId: handoff.rows[0].search_id,
          sourceSearchKey: handoff.rows[0].search_key,
          sourceExecutionPurpose: handoff.rows[0].execution_purpose,
          promotionBoundary:
            handoff.rows[0].execution_purpose === "TEST_VALIDATION"
              ? "TEST_SEARCH_TO_PV_WORKFLOW"
              : "PRODUCTION_SEARCH_TO_HITS",
        }),
      ],
    );

    linked.push({
      ...validationPackage,
      handoffPackageId: packageId,
    });
  }

  return linked;
}
