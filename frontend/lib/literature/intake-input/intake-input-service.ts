import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { getPostgresPool } from "@/lib/database/postgres";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";

import {
  INTAKE_INPUT_SCHEMA_VERSION,
  type GenerateIntakeInputRequest,
  type IntakeInputDownload,
  type IntakeInputExportSummary,
} from "./intake-input-types";

interface GenerationRow {
  package_id: string;
  package_key: string;
  source_type: string;
  external_reference: string | null;
  article_identity: Record<string, unknown>;
  product_context: Record<string, unknown>;
  workflow_state: string;
  configuration_snapshot: Record<string, unknown> | null;
  screening_result_id: string;
  screening_result_version: number;
  screening_payload: Record<string, unknown>;
  screening_confidence: string | number | null;
  screening_review_id: string;
  screening_review_status: string;
  screening_final_decision: string;
  screening_review_comments: string | null;
  screening_review_version: number;
  screening_reviewed_at: string | null;
  screening_reviewer: string | null;
  hits_result_id: string | null;
  hits_result_version: number | null;
  hits_payload: Record<string, unknown> | null;
  hits_review_id: string | null;
  hits_review_status: string | null;
  hits_review_decision: string | null;
  hits_review_version: number | null;
  source_records: unknown;
  duplicate_assessments: unknown;
}

interface ExportRow {
  id: string;
  package_id: string;
  export_version: number;
  schema_version: string;
  file_name: string;
  payload: Record<string, unknown>;
  content: string;
  sha256: string;
  generated_at: string;
  generated_by_name: string | null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function summary(row: ExportRow, reused: boolean): IntakeInputExportSummary {
  return {
    exportId: row.id,
    packageId: row.package_id,
    exportVersion: Number(row.export_version),
    schemaVersion: row.schema_version,
    fileName: row.file_name,
    sha256: row.sha256,
    generatedAt: new Date(row.generated_at).toISOString(),
    generatedBy: row.generated_by_name || undefined,
    reused,
  };
}

function generationSql(): string {
  return `
    WITH latest_screening AS (
      SELECT DISTINCT ON (package_id) * FROM screening_results
      WHERE tenant_id = $1 ORDER BY package_id, result_version DESC, created_at DESC
    ), latest_hits AS (
      SELECT DISTINCT ON (package_id) * FROM hits_results
      WHERE tenant_id = $1 ORDER BY package_id, result_version DESC, created_at DESC
    )
    SELECT
      package.id AS package_id, package.package_key, package.source_type,
      package.external_reference, package.article_identity, package.product_context,
      workflow.workflow_state, snapshot.snapshot_payload AS configuration_snapshot,
      screening.id AS screening_result_id,
      screening.result_version AS screening_result_version,
      screening.result_payload AS screening_payload,
      screening.confidence AS screening_confidence,
      screening_review.id AS screening_review_id,
      screening_review.review_status AS screening_review_status,
      screening_review.final_decision AS screening_final_decision,
      screening_review.comments AS screening_review_comments,
      screening_review.review_version AS screening_review_version,
      screening_review.reviewed_at::text AS screening_reviewed_at,
      screening_reviewer.display_name AS screening_reviewer,
      hits.id AS hits_result_id, hits.result_version AS hits_result_version,
      hits.result_payload AS hits_payload, hits_review.id AS hits_review_id,
      hits_review.review_status AS hits_review_status,
      hits_review.decision AS hits_review_decision,
      hits_review.review_version AS hits_review_version,
      COALESCE(sources.records, '[]'::jsonb) AS source_records,
      COALESCE(duplicates.assessments, '[]'::jsonb) AS duplicate_assessments
    FROM literature_packages package
    JOIN literature_workflow_state workflow
      ON workflow.package_id = package.id AND workflow.tenant_id = package.tenant_id
    JOIN latest_screening screening
      ON screening.package_id = package.id AND screening.tenant_id = package.tenant_id
    JOIN screening_reviews screening_review
      ON screening_review.tenant_id = package.tenant_id
     AND screening_review.package_id = package.id
     AND screening_review.screening_result_id = screening.id
    LEFT JOIN application_users screening_reviewer ON screening_reviewer.id = screening_review.reviewed_by
    LEFT JOIN latest_hits hits ON hits.package_id = package.id AND hits.tenant_id = package.tenant_id
    LEFT JOIN hits_reviews hits_review
      ON hits_review.tenant_id = package.tenant_id
     AND hits_review.package_id = package.id AND hits_review.hits_result_id = hits.id
    LEFT JOIN package_configuration_snapshots snapshot
      ON snapshot.package_id = package.id AND snapshot.tenant_id = package.tenant_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'source_key', source.source_key, 'source_record_id', source.source_record_id,
        'pmid', source.pmid, 'doi', source.doi, 'landing_url', source.landing_url,
        'added_at', source.added_at
      ) ORDER BY source.added_at) AS records
      FROM literature_package_sources source
      WHERE source.tenant_id = package.tenant_id AND source.package_id = package.id
    ) sources ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'classification', assessment.classification, 'confidence', assessment.confidence,
        'match_signals', assessment.match_signals, 'assessed_by', assessment.assessed_by,
        'assessed_at', assessment.assessed_at
      ) ORDER BY assessment.assessed_at) AS assessments
      FROM duplicate_assessments assessment
      WHERE assessment.tenant_id = package.tenant_id
        AND assessment.canonical_package_id = package.id
    ) duplicates ON true
    WHERE package.tenant_id = $1 AND package.id = $2
    FOR UPDATE OF package, workflow
  `;
}

export async function generateIntakeInput(input: {
  principal: RequestPrincipal;
  request: GenerateIntakeInputRequest;
}): Promise<IntakeInputExportSummary> {
  const packageId = input.request.packageId?.trim();
  const reason = input.request.reason?.trim();
  if (!packageId) throw new Error("packageId is required.");
  if (!reason || reason.length < 10) {
    throw new Error("A generation reason of at least 10 characters is required.");
  }

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query<GenerationRow>(generationSql(), [
      input.principal.tenantId,
      packageId,
    ]);
    const row = selected.rows[0];
    if (!row) throw new Error("Screening package was not found in the active tenant.");
    if (!["SCREENING_COMPLETE", "INTAKE_INPUT_CREATED"].includes(row.workflow_state)) {
      throw new Error(
        `Intake input cannot be generated from workflow state ${row.workflow_state}.`,
      );
    }
    if (row.screening_review_status !== "approved" || row.screening_final_decision !== "INCLUDE") {
      throw new Error("Intake input requires an approved INCLUDE screening decision.");
    }

    const lineage = {
      package_id: row.package_id,
      screening_result_id: row.screening_result_id,
      screening_result_version: Number(row.screening_result_version),
      screening_review_id: row.screening_review_id,
      screening_review_version: Number(row.screening_review_version),
      hits_result_id: row.hits_result_id,
      hits_result_version:
        row.hits_result_version === null ? null : Number(row.hits_result_version),
      hits_review_id: row.hits_review_id,
      hits_review_version:
        row.hits_review_version === null ? null : Number(row.hits_review_version),
    };
    const lineageHash = sha256(JSON.stringify(lineage));
    const existing = await client.query<ExportRow>(
      `SELECT export.*, generator.display_name AS generated_by_name
       FROM intake_input_exports export
       LEFT JOIN application_users generator ON generator.id = export.generated_by
       WHERE export.tenant_id = $1 AND export.package_id = $2
         AND export.source_lineage_sha256 = $3`,
      [input.principal.tenantId, packageId, lineageHash],
    );
    if (existing.rows[0]) {
      await client.query("COMMIT");
      return summary(existing.rows[0], true);
    }

    const exportId = randomUUID();
    const generatedAt = new Date().toISOString();
    const next = await client.query<{ next_version: number }>(
      `SELECT COALESCE(MAX(export_version), 0) + 1 AS next_version
       FROM intake_input_exports WHERE tenant_id = $1 AND package_id = $2`,
      [input.principal.tenantId, packageId],
    );
    const exportVersion = Number(next.rows[0].next_version);
    const payload: Record<string, unknown> = {
      schema_version: INTAKE_INPUT_SCHEMA_VERSION,
      intake_input_id: exportId,
      export_version: exportVersion,
      generated_at: generatedAt,
      source_system: "CLINIXAI_LITERATURE_INTELLIGENCE",
      downstream_target: "PV_NEXUS_COMMON_INTAKE",
      processing_status: "READY_FOR_DOWNSTREAM_IMPORT",
      tenant_id: input.principal.tenantId,
      package: {
        package_id: row.package_id,
        package_key: row.package_key,
        source_type: row.source_type,
        external_reference: row.external_reference,
      },
      article: row.article_identity,
      source_records: row.source_records,
      product_context: row.product_context,
      hits_assessment: {
        result: row.hits_payload,
        review_status: row.hits_review_status,
        review_decision: row.hits_review_decision,
      },
      screening_assessment: {
        result: row.screening_payload,
        confidence: row.screening_confidence === null ? null : Number(row.screening_confidence),
        final_decision: row.screening_final_decision,
        review_status: row.screening_review_status,
        review_comments: row.screening_review_comments,
        reviewed_at: row.screening_reviewed_at,
        reviewed_by: row.screening_reviewer,
      },
      duplicate_intelligence: row.duplicate_assessments,
      governance: {
        configuration_snapshot: row.configuration_snapshot || {},
        source_lineage: lineage,
        generation_reason: reason,
        generated_by: {
          user_id: input.principal.userId,
          display_name: input.principal.displayName,
          role: input.principal.roleKey,
        },
      },
    };
    const serialized = JSON.stringify(payload);
    const payloadHash = sha256(serialized);
    const fileName = "intake_input.json";
    const stored = await client.query<ExportRow>(
      `INSERT INTO intake_input_exports (
         id, tenant_id, package_id, screening_result_id, screening_review_id,
         export_version, schema_version, file_name, payload, content, sha256,
         source_lineage_sha256, generated_by, generated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14)
       RETURNING *, $15::text AS generated_by_name`,
      [
        exportId,
        input.principal.tenantId,
        packageId,
        row.screening_result_id,
        row.screening_review_id,
        exportVersion,
        INTAKE_INPUT_SCHEMA_VERSION,
        fileName,
        serialized,
        serialized,
        payloadHash,
        lineageHash,
        input.principal.userId,
        generatedAt,
        input.principal.displayName,
      ],
    );
    await client.query(
      `INSERT INTO evidence_artifacts (
         tenant_id, package_id, artifact_type, storage_backend, storage_key,
         media_type, sha256, size_bytes, metadata
       ) VALUES ($1, $2, 'INTAKE_INPUT_JSON', 'postgresql', $3,
         'application/json', $4, $5, $6::jsonb)`,
      [
        input.principal.tenantId,
        packageId,
        `intake-input/${exportId}/${fileName}`,
        payloadHash,
        Buffer.byteLength(serialized, "utf8"),
        JSON.stringify({ exportId, exportVersion, schemaVersion: INTAKE_INPUT_SCHEMA_VERSION }),
      ],
    );
    await client.query(
      `UPDATE literature_packages SET status = 'INTAKE_INPUT_CREATED', updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [packageId, input.principal.tenantId],
    );
    await client.query(
      `UPDATE literature_workflow_state
       SET workflow_state = 'INTAKE_INPUT_CREATED', state_version = state_version + 1,
           state_payload = state_payload || $3::jsonb, updated_by = $4, updated_at = now()
       WHERE package_id = $1 AND tenant_id = $2`,
      [
        packageId,
        input.principal.tenantId,
        JSON.stringify({
          intakeInputExportId: exportId,
          intakeInputExportVersion: exportVersion,
          intakeInputSha256: payloadHash,
          intakeInputGeneratedAt: generatedAt,
        }),
        input.principal.userId,
      ],
    );
    await client.query(
      `INSERT INTO audit_events (
         tenant_id, package_id, actor_id, event_type, event_category, outcome, details
       ) VALUES ($1, $2, $3, 'INTAKE_INPUT_GENERATED',
         'LITERATURE_INTAKE_INPUT', 'success', $4::jsonb)`,
      [
        input.principal.tenantId,
        packageId,
        input.principal.userId,
        JSON.stringify({
          exportId,
          exportVersion,
          schemaVersion: INTAKE_INPUT_SCHEMA_VERSION,
          sha256: payloadHash,
          sourceLineageSha256: lineageHash,
          reason,
        }),
      ],
    );
    await client.query("COMMIT");
    return summary(stored.rows[0], false);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getIntakeInputExport(input: {
  principal: RequestPrincipal;
  exportId: string;
}): Promise<IntakeInputDownload> {
  if (!input.exportId?.trim()) throw new Error("exportId is required.");
  const result = await getPostgresPool().query<ExportRow>(
    `SELECT export.*, generator.display_name AS generated_by_name
     FROM intake_input_exports export
     LEFT JOIN application_users generator ON generator.id = export.generated_by
     WHERE export.id = $1 AND export.tenant_id = $2`,
    [input.exportId, input.principal.tenantId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Intake input export was not found in the active tenant.");
  return { ...summary(row, true), payload: row.payload, content: row.content };
}
