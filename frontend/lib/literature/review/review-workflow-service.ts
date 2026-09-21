import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";
import { activeReviewReferenceData } from "@/lib/literature/review/review-reference-service";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export interface ReviewWorklistRecord {
  workspaceId: string;
  packageId: string;
  packageKey: string;
  pmid: string;
  title: string;
  workflowState: string;
  workspaceStatus: string;
  patientSegmentationStatus: string;
  patientCount?: number;
  labelingStatus: string;
  causalityStatus: string;
  mrReviewStatus: string;
  products: string[];
  clinicalEvents: string[];
  screeningDecision: string;
  screeningReviewedAt?: string;
  screeningReviewedBy?: string;
}

export async function listReviewWorklist(input: {
  principal: RequestPrincipal;
  limit?: number;
}): Promise<ReviewWorklistRecord[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 250, 500));
  const result = await getPostgresPool().query<Record<string, unknown>>(
    `
      WITH latest_screening AS (
        SELECT DISTINCT ON (package_id)
          id, tenant_id, package_id, result_version, result_payload, created_at
        FROM screening_results
        WHERE tenant_id = $1
        ORDER BY package_id, result_version DESC, created_at DESC
      )
      SELECT
        workspace.id AS workspace_id,
        workspace.status AS workspace_status,
        workspace.patient_segmentation_status,
        workspace.patient_count,
        workspace.labeling_status,
        workspace.causality_status,
        workspace.mr_review_status,
        package.id AS package_id,
        package.package_key,
        package.external_reference,
        package.article_identity,
        workflow.workflow_state,
        screening.result_payload,
        review.final_decision AS screening_final_decision,
        review.reviewed_at::text AS screening_reviewed_at,
        reviewer.display_name AS screening_reviewed_by
      FROM literature_review_workspaces workspace
      JOIN literature_packages package
        ON package.id = workspace.package_id
       AND package.tenant_id = workspace.tenant_id
      JOIN literature_workflow_state workflow
        ON workflow.package_id = package.id
       AND workflow.tenant_id = package.tenant_id
      JOIN latest_screening screening
        ON screening.id = workspace.screening_result_id
       AND screening.tenant_id = workspace.tenant_id
      JOIN screening_reviews review
        ON review.tenant_id = workspace.tenant_id
       AND review.package_id = package.id
       AND review.screening_result_id = screening.id
      LEFT JOIN application_users reviewer ON reviewer.id = review.reviewed_by
      WHERE workspace.tenant_id = $1
        AND review.review_status = 'approved'
        AND review.final_decision = 'INCLUDE'
      ORDER BY workspace.updated_at DESC
      LIMIT $2
    `,
    [input.principal.tenantId, limit],
  );

  return result.rows.map((row) => {
    const article = isRecord(row.article_identity) ? row.article_identity : {};
    const payload = isRecord(row.result_payload) ? row.result_payload : {};
    const screening = isRecord(payload.result) ? payload.result : {};
    const companyAssessments = Array.isArray(screening.companySuspectAssessments)
      ? screening.companySuspectAssessments.filter(isRecord)
      : [];
    const products = [
      ...new Set(
        companyAssessments
          .map((assessment) => text(assessment.reportedProduct))
          .filter(Boolean),
      ),
    ];
    const regulatoryEvidence = isRecord(screening.regulatoryEvidence)
      ? screening.regulatoryEvidence
      : {};
    const clinicalEvents = Array.isArray(regulatoryEvidence.clinicalEvents)
      ? regulatoryEvidence.clinicalEvents
          .filter(isRecord)
          .map((event) => text(event.event))
          .filter(Boolean)
      : stringList(screening.detectedEvents);

    return {
      workspaceId: String(row.workspace_id),
      packageId: String(row.package_id),
      packageKey: String(row.package_key),
      pmid:
        text(article.pmid) ||
        text(row.external_reference, "—"),
      title: text(article.title, "Untitled article"),
      workflowState: text(row.workflow_state, "REVIEW_READY"),
      workspaceStatus: text(row.workspace_status, "READY"),
      patientSegmentationStatus: text(row.patient_segmentation_status, "PENDING"),
      patientCount:
        row.patient_count === null || row.patient_count === undefined
          ? undefined
          : Number(row.patient_count),
      labelingStatus: text(row.labeling_status, "NOT_CONFIGURED"),
      causalityStatus: text(row.causality_status, "NOT_CONFIGURED"),
      mrReviewStatus: text(row.mr_review_status, "PENDING"),
      products,
      clinicalEvents,
      screeningDecision: text(row.screening_final_decision, "INCLUDE"),
      screeningReviewedAt: text(row.screening_reviewed_at) || undefined,
      screeningReviewedBy: text(row.screening_reviewed_by) || undefined,
    };
  });
}


export interface ReviewWorkspaceDetail extends ReviewWorklistRecord {
  patientSegments: unknown[];
  labelAssessments: Array<{
    id: string;
    patientSegmentKey: string;
    reportedProduct: string;
    clinicalEvent: string;
    conclusion: string;
    referenceLabelKey?: string;
    referenceLabelVersion?: string;
    referenceEffectiveDate?: string;
    evidence?: string;
    rationale?: string;
  }>;
  causalityAssessments: Array<{
    id: string;
    patientSegmentKey: string;
    reportedProduct: string;
    clinicalEvent: string;
    methodKey?: string;
    methodVersion?: string;
    conclusion: string;
    evidence?: string;
    rationale?: string;
  }>;
  medicalReview?: {
    reviewStatus: string;
    finalDecision?: string;
    comments?: string;
    reviewedBy?: string;
    reviewedAt?: string;
    reviewVersion: number;
  };
  article: Record<string, unknown>;
  screeningResult: Record<string, unknown>;
  labelReferences: Awaited<ReturnType<typeof activeReviewReferenceData>>["labelReferences"];
  causalityMethods: Awaited<ReturnType<typeof activeReviewReferenceData>>["causalityMethods"];
}

export async function getReviewWorkspaceDetail(input: {
  principal: RequestPrincipal;
  workspaceId: string;
}): Promise<ReviewWorkspaceDetail> {
  const worklist = await listReviewWorklist({ principal: input.principal, limit: 500 });
  const base = worklist.find((record) => record.workspaceId === input.workspaceId);
  if (!base) throw new Error("Review workspace was not found in the active tenant.");

  const pool = getPostgresPool();
  const referenceData = await activeReviewReferenceData(input.principal.tenantId);
  const detail = await pool.query<Record<string, unknown>>(
    `SELECT
       workspace.patient_segments,
       package.article_identity,
       screening.result_payload,
       medical_review.review_status,
       medical_review.final_decision,
       medical_review.comments,
       medical_review.review_version,
       medical_review.reviewed_at::text AS medical_reviewed_at,
       mr.display_name AS medical_reviewer
     FROM literature_review_workspaces workspace
     JOIN literature_packages package
       ON package.id = workspace.package_id
      AND package.tenant_id = workspace.tenant_id
     JOIN screening_results screening
       ON screening.id = workspace.screening_result_id
      AND screening.tenant_id = workspace.tenant_id
     LEFT JOIN literature_medical_reviews medical_review
       ON medical_review.tenant_id = workspace.tenant_id
      AND medical_review.review_workspace_id = workspace.id
     LEFT JOIN application_users mr ON mr.id = medical_review.reviewed_by
     WHERE workspace.tenant_id = $1 AND workspace.id = $2
     LIMIT 1`,
    [input.principal.tenantId, input.workspaceId],
  );
  if (!detail.rows[0]) throw new Error("Review workspace detail was not found.");

  const labels = await pool.query<Record<string, unknown>>(
    `SELECT id, patient_segment_key, reported_product, clinical_event,
            conclusion, reference_label_key, reference_label_version,
            reference_effective_date::text AS reference_effective_date,
            evidence, rationale
     FROM literature_label_assessments
     WHERE tenant_id = $1 AND review_workspace_id = $2
     ORDER BY assessed_at, id`,
    [input.principal.tenantId, input.workspaceId],
  );

  const causality = await pool.query<Record<string, unknown>>(
    `SELECT id, patient_segment_key, reported_product, clinical_event,
            method_key, method_version, conclusion, evidence, rationale
     FROM literature_causality_assessments
     WHERE tenant_id = $1 AND review_workspace_id = $2
     ORDER BY assessed_at, id`,
    [input.principal.tenantId, input.workspaceId],
  );

  const row = detail.rows[0];
  const payload = isRecord(row.result_payload) ? row.result_payload : {};
  const screeningResult = isRecord(payload.result) ? payload.result : {};
  const evidenceText = (value: unknown) => {
    if (!isRecord(value)) return undefined;
    return text(value.sourceText) || undefined;
  };

  return {
    ...base,
    patientSegments: Array.isArray(row.patient_segments) ? row.patient_segments : [],
    article: isRecord(row.article_identity) ? row.article_identity : {},
    screeningResult,
    labelAssessments: labels.rows.map((label) => ({
      id: String(label.id),
      patientSegmentKey: text(label.patient_segment_key),
      reportedProduct: text(label.reported_product),
      clinicalEvent: text(label.clinical_event),
      conclusion: text(label.conclusion, "UNRESOLVED"),
      referenceLabelKey: text(label.reference_label_key) || undefined,
      referenceLabelVersion: text(label.reference_label_version) || undefined,
      referenceEffectiveDate: text(label.reference_effective_date) || undefined,
      evidence: evidenceText(label.evidence),
      rationale: text(label.rationale) || undefined,
    })),
    causalityAssessments: causality.rows.map((assessment) => ({
      id: String(assessment.id),
      patientSegmentKey: text(assessment.patient_segment_key),
      reportedProduct: text(assessment.reported_product),
      clinicalEvent: text(assessment.clinical_event),
      methodKey: text(assessment.method_key) || undefined,
      methodVersion: text(assessment.method_version) || undefined,
      conclusion: text(assessment.conclusion, "UNRESOLVED"),
      evidence: evidenceText(assessment.evidence),
      rationale: text(assessment.rationale) || undefined,
    })),
    labelReferences: referenceData.labelReferences,
    causalityMethods: referenceData.causalityMethods,
    medicalReview: row.review_status
      ? {
          reviewStatus: text(row.review_status),
          finalDecision: text(row.final_decision) || undefined,
          comments: text(row.comments) || undefined,
          reviewedBy: text(row.medical_reviewer) || undefined,
          reviewedAt: text(row.medical_reviewed_at) || undefined,
          reviewVersion: Number(row.review_version || 0),
        }
      : undefined,
  };
}
