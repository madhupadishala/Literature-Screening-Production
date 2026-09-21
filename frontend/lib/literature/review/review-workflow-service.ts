import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";
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
