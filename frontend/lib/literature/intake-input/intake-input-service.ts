import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { getPostgresPool } from "@/lib/database/postgres";
import { canonicalJson } from "@/lib/enterprise/canonical-json";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";

import {
  assertIntakeGenerationGate,
  extractCompanyAssessmentsFromScreeningPayload,
  validateIntakeGenerationReason,
} from "./intake-input-governance";
import { buildGovernedPatientCaseCandidates } from "./intake-case-governance";
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
  review_workspace_id: string | null;
  review_workspace_version: number | null;
  review_workspace_status: string | null;
  patient_count: number | null;
  patient_segmentation_status: string | null;
  patient_segments: unknown;
  labeling_status: string | null;
  causality_status: string | null;
  label_assessments: unknown;
  causality_assessments: unknown;
  latest_patient_extraction_id: string | null;
  latest_patient_extraction_version: number | null;
  latest_patient_extraction_source_sha256: string | null;
  mr_review_status: string | null;
  mr_final_decision: string | null;
  mr_review_comments: string | null;
  mr_reviewed_at: string | null;
  mr_review_version: number | null;
  mr_reviewer: string | null;
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
      review_workspace.id AS review_workspace_id,
      review_workspace.workspace_version AS review_workspace_version,
      review_workspace.status AS review_workspace_status,
      review_workspace.patient_count,
      review_workspace.patient_segmentation_status,
      review_workspace.patient_segments,
      review_workspace.labeling_status,
      review_workspace.causality_status,
      medical_review.review_status AS mr_review_status,
      medical_review.final_decision AS mr_final_decision,
      medical_review.comments AS mr_review_comments,
      medical_review.reviewed_at::text AS mr_reviewed_at,
      medical_review.review_version AS mr_review_version,
      mr_reviewer.display_name AS mr_reviewer,
      COALESCE(labels.assessments, '[]'::jsonb) AS label_assessments,
      COALESCE(causality.assessments, '[]'::jsonb) AS causality_assessments,
      extraction.id AS latest_patient_extraction_id,
      extraction.run_version AS latest_patient_extraction_version,
      extraction.source_sha256 AS latest_patient_extraction_source_sha256,
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
    LEFT JOIN literature_review_workspaces review_workspace
      ON review_workspace.tenant_id = package.tenant_id
     AND review_workspace.package_id = package.id
     AND review_workspace.screening_result_id = screening.id
    LEFT JOIN literature_medical_reviews medical_review
      ON medical_review.tenant_id = package.tenant_id
     AND medical_review.review_workspace_id = review_workspace.id
    LEFT JOIN application_users mr_reviewer ON mr_reviewer.id = medical_review.reviewed_by
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'id', label.id,
        'patient_segment_key', label.patient_segment_key,
        'reported_product', label.reported_product,
        'clinical_event', label.clinical_event,
        'conclusion', label.conclusion,
        'reference_label_key', label.reference_label_key,
        'reference_label_version', label.reference_label_version,
        'reference_effective_date', label.reference_effective_date,
        'evidence', label.evidence,
        'rationale', label.rationale,
        'assessed_at', label.assessed_at
      ) ORDER BY label.patient_segment_key, label.reported_product, label.clinical_event, label.id) AS assessments
      FROM literature_label_assessments label
      WHERE label.tenant_id = package.tenant_id
        AND label.review_workspace_id = review_workspace.id
    ) labels ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'id', assessment.id,
        'patient_segment_key', assessment.patient_segment_key,
        'reported_product', assessment.reported_product,
        'clinical_event', assessment.clinical_event,
        'method_key', assessment.method_key,
        'method_version', assessment.method_version,
        'conclusion', assessment.conclusion,
        'evidence', assessment.evidence,
        'rationale', assessment.rationale,
        'assessed_at', assessment.assessed_at
      ) ORDER BY assessment.patient_segment_key, assessment.reported_product, assessment.clinical_event, assessment.id) AS assessments
      FROM literature_causality_assessments assessment
      WHERE assessment.tenant_id = package.tenant_id
        AND assessment.review_workspace_id = review_workspace.id
    ) causality ON true
    LEFT JOIN LATERAL (
      SELECT extraction.id, extraction.run_version, extraction.source_sha256
      FROM literature_patient_extraction_runs extraction
      WHERE extraction.tenant_id = package.tenant_id
        AND extraction.review_workspace_id = review_workspace.id
      ORDER BY extraction.run_version DESC, extraction.created_at DESC
      LIMIT 1
    ) extraction ON true
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
  if (!packageId) throw new Error("packageId is required.");
  const reason = validateIntakeGenerationReason(input.request.reason);

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query<GenerationRow>(generationSql(), [
      input.principal.tenantId,
      packageId,
    ]);
    const row = selected.rows[0];
    if (!row) throw new Error("Screening package was not found in the active tenant.");
    assertIntakeGenerationGate({
      workflowState: row.workflow_state,
      screeningReviewStatus: row.screening_review_status,
      screeningFinalDecision: row.screening_final_decision,
      hitsReviewStatus: row.hits_review_status,
      hitsReviewDecision: row.hits_review_decision,
      companyAssessments: extractCompanyAssessmentsFromScreeningPayload(
        row.screening_payload,
      ),
      reviewWorkspaceStatus: row.review_workspace_status,
      patientSegmentationStatus: row.patient_segmentation_status,
      labelingStatus: row.labeling_status,
      causalityStatus: row.causality_status,
      mrReviewStatus: row.mr_review_status,
    });

    const caseCandidates = buildGovernedPatientCaseCandidates({
      patientSegments: row.patient_segments,
      labelAssessments: row.label_assessments,
      causalityAssessments: row.causality_assessments,
    });

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
      review_workspace_id: row.review_workspace_id,
      review_workspace_version:
        row.review_workspace_version === null
          ? null
          : Number(row.review_workspace_version),
      patient_segmentation_sha256: sha256(canonicalJson(row.patient_segments || [])),
      label_assessments_sha256: sha256(canonicalJson(row.label_assessments || [])),
      causality_assessments_sha256: sha256(
        canonicalJson(row.causality_assessments || []),
      ),
      patient_extraction: {
        run_id: row.latest_patient_extraction_id,
        run_version:
          row.latest_patient_extraction_version === null
            ? null
            : Number(row.latest_patient_extraction_version),
        source_sha256: row.latest_patient_extraction_source_sha256,
      },
      medical_review_version:
        row.mr_review_version === null ? null : Number(row.mr_review_version),
      mr_review_status: row.mr_review_status,
      mr_final_decision: row.mr_final_decision,
      configuration_snapshot_sha256: sha256(
        canonicalJson(row.configuration_snapshot || {}),
      ),
      case_candidate_count: caseCandidates.length,
    };
    const lineageHash = sha256(canonicalJson(lineage));
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
      review_assessment: {
        review_workspace_id: row.review_workspace_id,
        workspace_status: row.review_workspace_status,
        patient_segmentation_status: row.patient_segmentation_status,
        patient_count: row.patient_count,
        patient_segments: row.patient_segments || [],
        explicit_case_candidates: caseCandidates,
        labeling_status: row.labeling_status,
        label_assessments: row.label_assessments || [],
        causality_status: row.causality_status,
        causality_assessments: row.causality_assessments || [],
        medical_review_status: row.mr_review_status,
        medical_review_decision: row.mr_final_decision,
        medical_review_comments: row.mr_review_comments,
        medical_reviewed_at: row.mr_reviewed_at,
        medical_reviewer: row.mr_reviewer,
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
    const serialized = canonicalJson(payload);
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
    for (const candidate of caseCandidates) {
      const candidatePayload = {
        case_candidate_key: `${row.package_key}::${candidate.patient.patientSegmentKey}`,
        patient: candidate.patient,
        explicit_product_event_relations: candidate.relations,
      };
      const candidateContent = canonicalJson(candidatePayload);
      await client.query(
        `INSERT INTO literature_intake_case_candidates (
           tenant_id, intake_export_id, package_id, patient_segment_key,
           case_candidate_key, patient_payload, assessment_payload,
           source_lineage_sha256, content_sha256
         ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9)
         ON CONFLICT (tenant_id, intake_export_id, patient_segment_key)
         DO UPDATE SET
           case_candidate_key = EXCLUDED.case_candidate_key,
           patient_payload = EXCLUDED.patient_payload,
           assessment_payload = EXCLUDED.assessment_payload,
           source_lineage_sha256 = EXCLUDED.source_lineage_sha256,
           content_sha256 = EXCLUDED.content_sha256`,
        [
          input.principal.tenantId,
          exportId,
          packageId,
          candidate.patient.patientSegmentKey,
          `${row.package_key}::${candidate.patient.patientSegmentKey}`,
          JSON.stringify(candidate.patient),
          JSON.stringify(candidate.relations),
          lineageHash,
          sha256(candidateContent),
        ],
      );
    }

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
          caseCandidateCount: caseCandidates.length,
          relationCount: caseCandidates.reduce(
            (count, candidate) => count + candidate.relations.length,
            0,
          ),
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
