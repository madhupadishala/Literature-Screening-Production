import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

import { validateAuditReason } from "@/lib/audit/reason";
import { draftPatientSegmentation as runPatientSegmentationAI } from "@/lib/ai/patient-segmentation-agent";
import { getPostgresPool } from "@/lib/database/postgres";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";

import type {
  CausalityAssessmentInput,
  LabelAssessmentInput,
  MedicalReviewInput,
  PatientSegment,
  ReviewWorkspaceDetail,
} from "./review-types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => text(item)).filter(Boolean)
    : [];
}

function auditReason(value: unknown): string {
  const validation = validateAuditReason(value);
  if (!validation.valid) {
    throw new Error(validation.message || "A specific audit reason is required.");
  }
  return validation.reason;
}

function normalizeSegments(value: unknown): PatientSegment[] {
  if (!Array.isArray(value)) throw new Error("patientSegments must be an array.");
  if (value.length > 25) throw new Error("A maximum of 25 patient segments is supported.");

  const seen = new Set<string>();
  return value.map((raw, index) => {
    if (!isRecord(raw)) throw new Error("Invalid patient segment.");
    const segmentKey = text(raw.segmentKey, `PATIENT-${index + 1}`);
    if (seen.has(segmentKey.toLowerCase())) {
      throw new Error(`Duplicate patient segment key: ${segmentKey}`);
    }
    seen.add(segmentKey.toLowerCase());

    const identifiable = text(raw.identifiablePatient).toUpperCase();
    if (!["PRESENT", "ABSENT", "UNRESOLVED"].includes(identifiable)) {
      throw new Error(`Invalid identifiable patient status for ${segmentKey}.`);
    }

    const products = [...new Set(stringList(raw.products))];
    const events = [...new Set(stringList(raw.events))];
    const relationships = Array.isArray(raw.relationships)
      ? raw.relationships.map((relationship) => {
          if (!isRecord(relationship)) throw new Error("Invalid product-event relationship.");
          const product = text(relationship.product);
          const event = text(relationship.event);
          const evidence = text(relationship.evidence);
          const role = text(relationship.role).toUpperCase();
          if (!product || !event || !evidence) {
            throw new Error("Each product-event relationship requires product, event and source evidence.");
          }
          if (!["SUSPECT", "INTERACTING", "CONCOMITANT", "UNKNOWN"].includes(role)) {
            throw new Error(`Invalid product role for ${product} / ${event}.`);
          }
          if (!products.some((item) => item.toLowerCase() === product.toLowerCase())) {
            products.push(product);
          }
          if (!events.some((item) => item.toLowerCase() === event.toLowerCase())) {
            events.push(event);
          }
          return {
            product,
            event,
            evidence,
            role: role as PatientSegment["relationships"][number]["role"],
          };
        })
      : [];

    const age =
      typeof raw.age === "number" && Number.isFinite(raw.age) && raw.age >= 0
        ? raw.age
        : undefined;
    const ageUnitRaw = text(raw.ageUnit).toLowerCase();
    const ageUnit = ["years", "months", "days"].includes(ageUnitRaw)
      ? (ageUnitRaw as PatientSegment["ageUnit"])
      : undefined;
    const sexRaw = text(raw.sex).toLowerCase();
    const sex = ["female", "male", "other", "unknown"].includes(sexRaw)
      ? (sexRaw as PatientSegment["sex"])
      : "unknown";

    return {
      segmentKey,
      patientDescriptor: text(raw.patientDescriptor, `Patient ${index + 1}`),
      identifiablePatient: identifiable as PatientSegment["identifiablePatient"],
      age,
      ageUnit,
      sex,
      products,
      events,
      relationships,
      sourceEvidence: stringList(raw.sourceEvidence),
      confidence:
        typeof raw.confidence === "number" && Number.isFinite(raw.confidence)
          ? Math.max(0, Math.min(100, raw.confidence))
          : undefined,
      reviewerNotes: text(raw.reviewerNotes) || undefined,
    };
  });
}

function requiredPairs(segments: PatientSegment[]): Array<{
  segmentKey: string;
  product: string;
  event: string;
}> {
  const keys = new Set<string>();
  const pairs: Array<{ segmentKey: string; product: string; event: string }> = [];
  for (const segment of segments) {
    for (const relationship of segment.relationships) {
      if (relationship.role === "CONCOMITANT") continue;
      const key = [
        segment.segmentKey.toLowerCase(),
        relationship.product.toLowerCase(),
        relationship.event.toLowerCase(),
      ].join("|");
      if (keys.has(key)) continue;
      keys.add(key);
      pairs.push({
        segmentKey: segment.segmentKey,
        product: relationship.product,
        event: relationship.event,
      });
    }
  }
  return pairs;
}

async function workspaceRow(
  client: PoolClient,
  tenantId: string,
  workspaceId: string,
  forUpdate = false,
): Promise<Record<string, unknown>> {
  const result = await client.query<Record<string, unknown>>(
    `SELECT
       workspace.*,
       package.package_key,
       package.external_reference,
       package.article_identity,
       workflow.workflow_state,
       screening.id AS screening_result_id_resolved,
       screening.result_version AS screening_result_version,
       screening.result_payload,
       screening.confidence AS screening_confidence,
       review.reviewed_at::text AS screening_reviewed_at,
       reviewer.display_name AS screening_reviewed_by
     FROM literature_review_workspaces workspace
     JOIN literature_packages package
       ON package.id = workspace.package_id
      AND package.tenant_id = workspace.tenant_id
     JOIN literature_workflow_state workflow
       ON workflow.package_id = package.id
      AND workflow.tenant_id = package.tenant_id
     JOIN screening_results screening
       ON screening.id = workspace.screening_result_id
      AND screening.tenant_id = workspace.tenant_id
     JOIN screening_reviews review
       ON review.tenant_id = workspace.tenant_id
      AND review.package_id = workspace.package_id
      AND review.screening_result_id = workspace.screening_result_id
     LEFT JOIN application_users reviewer ON reviewer.id = review.reviewed_by
     WHERE workspace.tenant_id = $1 AND workspace.id = $2
     ${forUpdate ? "FOR UPDATE OF workspace" : ""}`,
    [tenantId, workspaceId],
  );
  if (!result.rows[0]) {
    throw new Error("Review workspace was not found in the active tenant.");
  }
  return result.rows[0];
}

function screeningContext(row: Record<string, unknown>) {
  const payload = isRecord(row.result_payload) ? row.result_payload : {};
  const result = isRecord(payload.result) ? payload.result : {};
  const assessments = Array.isArray(result.companySuspectAssessments)
    ? result.companySuspectAssessments.filter(isRecord)
    : [];
  const products = [
    ...new Set(
      assessments
        .map((assessment) => text(assessment.reportedProduct))
        .filter(Boolean),
    ),
  ];
  const regulatory = isRecord(result.regulatoryEvidence)
    ? result.regulatoryEvidence
    : {};
  const events = Array.isArray(regulatory.clinicalEvents)
    ? regulatory.clinicalEvents
        .filter(isRecord)
        .map((event) => text(event.event))
        .filter(Boolean)
    : stringList(result.detectedEvents);
  return {
    result,
    products,
    events: [...new Set(events)],
  };
}

async function recalculateAssessmentStatuses(
  client: PoolClient,
  tenantId: string,
  workspaceId: string,
  segments: PatientSegment[],
): Promise<{ labelingStatus: string; causalityStatus: string }> {
  const pairs = requiredPairs(segments);
  if (pairs.length === 0) {
    await client.query(
      `UPDATE literature_review_workspaces
       SET labeling_status = 'NOT_CONFIGURED',
           causality_status = 'NOT_CONFIGURED',
           updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, workspaceId],
    );
    return {
      labelingStatus: "NOT_CONFIGURED",
      causalityStatus: "NOT_CONFIGURED",
    };
  }

  const labelRows = await client.query<{
    patient_segment_key: string;
    reported_product: string;
    clinical_event: string;
    conclusion: string;
  }>(
    `SELECT patient_segment_key, reported_product, clinical_event, conclusion
     FROM literature_label_assessments
     WHERE tenant_id = $1 AND review_workspace_id = $2`,
    [tenantId, workspaceId],
  );
  const causalityRows = await client.query<{
    patient_segment_key: string;
    reported_product: string;
    clinical_event: string;
    conclusion: string;
  }>(
    `SELECT patient_segment_key, reported_product, clinical_event, conclusion
     FROM literature_causality_assessments
     WHERE tenant_id = $1 AND review_workspace_id = $2`,
    [tenantId, workspaceId],
  );

  const keyOf = (segmentKey: string, product: string, event: string) =>
    [segmentKey.toLowerCase(), product.toLowerCase(), event.toLowerCase()].join("|");
  const requiredKeys = new Set(
    pairs.map((pair) => keyOf(pair.segmentKey, pair.product, pair.event)),
  );
  const labels = new Map(
    labelRows.rows.map((row) => [
      keyOf(row.patient_segment_key, row.reported_product, row.clinical_event),
      row.conclusion,
    ]),
  );
  const causalities = new Map(
    causalityRows.rows.map((row) => [
      keyOf(row.patient_segment_key, row.reported_product, row.clinical_event),
      row.conclusion,
    ]),
  );

  const labelComplete = [...requiredKeys].every((key) => labels.has(key));
  const causalityComplete = [...requiredKeys].every((key) => causalities.has(key));
  const labelingStatus = !labelComplete
    ? "PENDING"
    : [...requiredKeys].some((key) => labels.get(key) === "UNRESOLVED")
      ? "UNRESOLVED"
      : "COMPLETE";
  const causalityStatus = !causalityComplete
    ? "PENDING"
    : [...requiredKeys].some(
          (key) => causalities.get(key)?.toUpperCase() === "UNRESOLVED",
        )
      ? "UNRESOLVED"
      : "COMPLETE";

  await client.query(
    `UPDATE literature_review_workspaces
     SET labeling_status = $3, causality_status = $4, updated_at = now()
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, workspaceId, labelingStatus, causalityStatus],
  );
  return { labelingStatus, causalityStatus };
}

export async function getReviewWorkspaceDetail(input: {
  principal: RequestPrincipal;
  workspaceId: string;
}): Promise<ReviewWorkspaceDetail> {
  const client = await getPostgresPool().connect();
  try {
    const row = await workspaceRow(
      client,
      input.principal.tenantId,
      input.workspaceId,
    );
    const article = isRecord(row.article_identity) ? row.article_identity : {};
    const context = screeningContext(row);
    const segments = normalizeSegments(
      Array.isArray(row.patient_segments) ? row.patient_segments : [],
    );

    const labels = await client.query<Record<string, unknown>>(
      `SELECT assessment.*, user_account.display_name AS assessed_by_name
       FROM literature_label_assessments assessment
       LEFT JOIN application_users user_account ON user_account.id = assessment.assessed_by
       WHERE assessment.tenant_id = $1 AND assessment.review_workspace_id = $2
       ORDER BY assessment.patient_segment_key, assessment.reported_product, assessment.clinical_event`,
      [input.principal.tenantId, input.workspaceId],
    );
    const causalities = await client.query<Record<string, unknown>>(
      `SELECT assessment.*, user_account.display_name AS assessed_by_name
       FROM literature_causality_assessments assessment
       LEFT JOIN application_users user_account ON user_account.id = assessment.assessed_by
       WHERE assessment.tenant_id = $1 AND assessment.review_workspace_id = $2
       ORDER BY assessment.patient_segment_key, assessment.reported_product, assessment.clinical_event`,
      [input.principal.tenantId, input.workspaceId],
    );
    const mr = await client.query<Record<string, unknown>>(
      `SELECT review.*, user_account.display_name AS reviewed_by_name
       FROM literature_medical_reviews review
       LEFT JOIN application_users user_account ON user_account.id = review.reviewed_by
       WHERE review.tenant_id = $1 AND review.review_workspace_id = $2
       LIMIT 1`,
      [input.principal.tenantId, input.workspaceId],
    );

    return {
      workspaceId: String(row.id),
      packageId: String(row.package_id),
      packageKey: text(row.package_key),
      pmid: text(article.pmid) || text(row.external_reference, "—"),
      doi: text(article.doi) || undefined,
      title: text(article.title, "Untitled article"),
      abstract: text(article.abstract),
      authors: stringList(article.authors),
      publicationDate: text(article.publicationDate) || undefined,
      workflowState: text(row.workflow_state, "REVIEW_READY"),
      workspaceStatus: text(row.status, "READY"),
      workspaceVersion: Number(row.workspace_version || 1),
      patientSegmentationStatus: text(row.patient_segmentation_status, "PENDING"),
      patientCount:
        row.patient_count === null || row.patient_count === undefined
          ? undefined
          : Number(row.patient_count),
      patientSegments: segments,
      labelingStatus: text(row.labeling_status, "NOT_CONFIGURED"),
      causalityStatus: text(row.causality_status, "NOT_CONFIGURED"),
      mrReviewStatus: text(row.mr_review_status, "PENDING"),
      screening: {
        resultId: String(row.screening_result_id_resolved),
        resultVersion: Number(row.screening_result_version || 1),
        decision: text(context.result.decision),
        confidence:
          typeof row.screening_confidence === "number"
            ? row.screening_confidence
            : row.screening_confidence
              ? Number(row.screening_confidence)
              : undefined,
        reviewedAt: text(row.screening_reviewed_at) || undefined,
        reviewedBy: text(row.screening_reviewed_by) || undefined,
        products: context.products,
        events: context.events,
      },
      labelAssessments: labels.rows.map((assessment) => ({
        id: String(assessment.id),
        patientSegmentKey: text(assessment.patient_segment_key),
        reportedProduct: text(assessment.reported_product),
        clinicalEvent: text(assessment.clinical_event),
        conclusion: text(assessment.conclusion) as LabelAssessmentInput["conclusion"],
        referenceLabelKey: text(assessment.reference_label_key) || undefined,
        referenceLabelVersion: text(assessment.reference_label_version) || undefined,
        referenceEffectiveDate:
          assessment.reference_effective_date
            ? String(assessment.reference_effective_date).slice(0, 10)
            : undefined,
        evidence: isRecord(assessment.evidence) ? assessment.evidence : {},
        rationale: text(assessment.rationale),
        assessedAt: String(assessment.assessed_at),
        assessedBy: text(assessment.assessed_by_name) || undefined,
      })),
      causalityAssessments: causalities.rows.map((assessment) => ({
        id: String(assessment.id),
        patientSegmentKey: text(assessment.patient_segment_key),
        reportedProduct: text(assessment.reported_product),
        clinicalEvent: text(assessment.clinical_event),
        methodKey: text(assessment.method_key) || undefined,
        methodVersion: text(assessment.method_version) || undefined,
        conclusion: text(assessment.conclusion, "UNRESOLVED"),
        evidence: isRecord(assessment.evidence) ? assessment.evidence : {},
        rationale: text(assessment.rationale),
        assessedAt: String(assessment.assessed_at),
        assessedBy: text(assessment.assessed_by_name) || undefined,
      })),
      medicalReview: mr.rows[0]
        ? {
            status: text(mr.rows[0].review_status, "PENDING"),
            finalDecision: text(mr.rows[0].final_decision) || undefined,
            comments: text(mr.rows[0].comments) || undefined,
            reviewedAt: text(mr.rows[0].reviewed_at) || undefined,
            reviewedBy: text(mr.rows[0].reviewed_by_name) || undefined,
            reviewVersion: Number(mr.rows[0].review_version || 0),
          }
        : undefined,
    };
  } finally {
    client.release();
  }
}

export async function generatePatientSegmentationDraft(input: {
  principal: RequestPrincipal;
  workspaceId: string;
  reason: string;
}): Promise<ReviewWorkspaceDetail> {
  const reason = auditReason(input.reason);
  const client = await getPostgresPool().connect();
  try {
    const row = await workspaceRow(
      client,
      input.principal.tenantId,
      input.workspaceId,
    );
    const article = isRecord(row.article_identity) ? row.article_identity : {};
    const context = screeningContext(row);
    const correlationId = `review-segmentation-${randomUUID()}`;
    const generated = await runPatientSegmentationAI({
      tenantId: input.principal.tenantId,
      pmid: text(article.pmid) || text(row.external_reference),
      title: text(article.title),
      abstract: text(article.abstract),
      authors: stringList(article.authors),
      screeningProducts: context.products,
      screeningEvents: context.events,
      correlationId,
    });
    const segments = normalizeSegments(generated.segments);

    await client.query("BEGIN");
    await workspaceRow(client, input.principal.tenantId, input.workspaceId, true);
    await client.query(
      `UPDATE literature_review_workspaces
       SET status = 'IN_REVIEW',
           patient_segmentation_status = 'IN_PROGRESS',
           patient_count = $3,
           patient_segments = $4::jsonb,
           workspace_version = workspace_version + 1,
           updated_by = $5,
           updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [
        input.principal.tenantId,
        input.workspaceId,
        segments.length,
        JSON.stringify(segments),
        input.principal.userId,
      ],
    );
    await client.query(
      `UPDATE literature_workflow_state
       SET workflow_state = 'REVIEW_IN_PROGRESS',
           state_version = state_version + 1,
           state_payload = state_payload || $3::jsonb,
           updated_by = $4,
           updated_at = now()
       WHERE tenant_id = $1 AND package_id = $2`,
      [
        input.principal.tenantId,
        row.package_id,
        JSON.stringify({
          reviewWorkspaceId: input.workspaceId,
          patientSegmentationStatus: "IN_PROGRESS",
          patientCount: segments.length,
          segmentationAiRequestId: generated.aiExecution.requestId,
        }),
        input.principal.userId,
      ],
    );
    await client.query(
      `INSERT INTO audit_events (
         tenant_id, package_id, actor_id, event_type, event_category,
         outcome, correlation_id, details
       ) VALUES ($1,$2,$3,'PATIENT_SEGMENTATION_DRAFT_GENERATED',
         'LITERATURE_REVIEW','success',$4,$5::jsonb)`,
      [
        input.principal.tenantId,
        row.package_id,
        input.principal.userId,
        correlationId,
        JSON.stringify({
          reviewWorkspaceId: input.workspaceId,
          patientCount: segments.length,
          reason,
          aiExecution: generated.aiExecution,
          draftOnly: true,
        }),
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  return getReviewWorkspaceDetail({
    principal: input.principal,
    workspaceId: input.workspaceId,
  });
}

export async function savePatientSegmentation(input: {
  principal: RequestPrincipal;
  workspaceId: string;
  patientSegments: unknown;
  complete: boolean;
  reason: string;
  expectedVersion?: number;
}): Promise<ReviewWorkspaceDetail> {
  const reason = auditReason(input.reason);
  const segments = normalizeSegments(input.patientSegments);
  if (input.complete && segments.length === 0 && reason.length < 20) {
    throw new Error("Confirming zero reportable patients requires a specific rationale.");
  }
  if (
    input.complete &&
    segments.some((segment) => segment.relationships.length === 0)
  ) {
    throw new Error(
      "Each confirmed patient segment requires at least one evidence-supported product-event relationship.",
    );
  }

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const row = await workspaceRow(
      client,
      input.principal.tenantId,
      input.workspaceId,
      true,
    );
    const currentVersion = Number(row.workspace_version || 1);
    if (
      input.expectedVersion !== undefined &&
      input.expectedVersion !== currentVersion
    ) {
      throw new Error(
        `Review workspace version conflict. Expected ${input.expectedVersion}, current version is ${currentVersion}.`,
      );
    }
    const status = input.complete ? "COMPLETE" : "IN_PROGRESS";
    await client.query(
      `UPDATE literature_review_workspaces
       SET status = 'IN_REVIEW',
           patient_segmentation_status = $3,
           patient_count = $4,
           patient_segments = $5::jsonb,
           workspace_version = workspace_version + 1,
           updated_by = $6,
           updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [
        input.principal.tenantId,
        input.workspaceId,
        status,
        segments.length,
        JSON.stringify(segments),
        input.principal.userId,
      ],
    );
    const derived = await recalculateAssessmentStatuses(
      client,
      input.principal.tenantId,
      input.workspaceId,
      segments,
    );
    await client.query(
      `UPDATE literature_workflow_state
       SET workflow_state = 'REVIEW_IN_PROGRESS',
           state_version = state_version + 1,
           state_payload = state_payload || $3::jsonb,
           updated_by = $4,
           updated_at = now()
       WHERE tenant_id = $1 AND package_id = $2`,
      [
        input.principal.tenantId,
        row.package_id,
        JSON.stringify({
          reviewWorkspaceId: input.workspaceId,
          patientSegmentationStatus: status,
          patientCount: segments.length,
          labelingStatus: derived.labelingStatus,
          causalityStatus: derived.causalityStatus,
        }),
        input.principal.userId,
      ],
    );
    await client.query(
      `INSERT INTO audit_events (
         tenant_id, package_id, actor_id, event_type, event_category,
         outcome, details
       ) VALUES ($1,$2,$3,$4,'LITERATURE_REVIEW','success',$5::jsonb)`,
      [
        input.principal.tenantId,
        row.package_id,
        input.principal.userId,
        input.complete
          ? "PATIENT_SEGMENTATION_CONFIRMED"
          : "PATIENT_SEGMENTATION_SAVED",
        JSON.stringify({
          reviewWorkspaceId: input.workspaceId,
          patientCount: segments.length,
          patientSegments: segments,
          reason,
          previousWorkspaceVersion: currentVersion,
        }),
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  return getReviewWorkspaceDetail({
    principal: input.principal,
    workspaceId: input.workspaceId,
  });
}

export async function saveLabelAssessment(input: {
  principal: RequestPrincipal;
  workspaceId: string;
  assessment: LabelAssessmentInput;
}): Promise<ReviewWorkspaceDetail> {
  const assessment = input.assessment;
  const conclusion = text(assessment.conclusion).toUpperCase();
  if (!["EXPECTED", "UNEXPECTED", "UNRESOLVED"].includes(conclusion)) {
    throw new Error("Expectedness must be EXPECTED, UNEXPECTED, or UNRESOLVED.");
  }
  const rationale = auditReason(assessment.rationale);
  if (
    conclusion !== "UNRESOLVED" &&
    (!text(assessment.referenceLabelKey) ||
      !text(assessment.referenceLabelVersion) ||
      !text(assessment.referenceEffectiveDate))
  ) {
    throw new Error(
      "EXPECTED or UNEXPECTED requires the controlled Label / RSI key, version and effective date.",
    );
  }

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const row = await workspaceRow(
      client,
      input.principal.tenantId,
      input.workspaceId,
      true,
    );
    const segments = normalizeSegments(row.patient_segments);
    if (text(row.patient_segmentation_status) !== "COMPLETE") {
      throw new Error("Confirm patient segmentation before expectedness assessment.");
    }
    const pair = requiredPairs(segments).find(
      (item) =>
        item.segmentKey.toLowerCase() === assessment.patientSegmentKey.toLowerCase() &&
        item.product.toLowerCase() === assessment.reportedProduct.toLowerCase() &&
        item.event.toLowerCase() === assessment.clinicalEvent.toLowerCase(),
    );
    if (!pair) {
      throw new Error("The requested product-event pair is not part of confirmed patient segmentation.");
    }

    await client.query(
      `INSERT INTO literature_label_assessments (
         tenant_id, review_workspace_id, patient_segment_key,
         reported_product, clinical_event, conclusion,
         reference_label_key, reference_label_version, reference_effective_date,
         evidence, rationale, assessed_by, assessed_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,now())
       ON CONFLICT (
         tenant_id, review_workspace_id, patient_segment_key,
         lower(reported_product), lower(clinical_event)
       ) DO UPDATE SET
         conclusion = EXCLUDED.conclusion,
         reference_label_key = EXCLUDED.reference_label_key,
         reference_label_version = EXCLUDED.reference_label_version,
         reference_effective_date = EXCLUDED.reference_effective_date,
         evidence = EXCLUDED.evidence,
         rationale = EXCLUDED.rationale,
         assessed_by = EXCLUDED.assessed_by,
         assessed_at = now()`,
      [
        input.principal.tenantId,
        input.workspaceId,
        pair.segmentKey,
        pair.product,
        pair.event,
        conclusion,
        text(assessment.referenceLabelKey) || null,
        text(assessment.referenceLabelVersion) || null,
        text(assessment.referenceEffectiveDate) || null,
        JSON.stringify(assessment.evidence || {}),
        rationale,
        input.principal.userId,
      ],
    );
    const derived = await recalculateAssessmentStatuses(
      client,
      input.principal.tenantId,
      input.workspaceId,
      segments,
    );
    await client.query(
      `UPDATE literature_review_workspaces
       SET workspace_version = workspace_version + 1,
           updated_by = $3,
           updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [input.principal.tenantId, input.workspaceId, input.principal.userId],
    );
    await client.query(
      `INSERT INTO audit_events (
         tenant_id, package_id, actor_id, event_type, event_category,
         outcome, details
       ) VALUES ($1,$2,$3,'LABEL_EXPECTEDNESS_ASSESSMENT_SAVED',
         'LITERATURE_REVIEW','success',$4::jsonb)`,
      [
        input.principal.tenantId,
        row.package_id,
        input.principal.userId,
        JSON.stringify({
          reviewWorkspaceId: input.workspaceId,
          patientSegmentKey: pair.segmentKey,
          product: pair.product,
          event: pair.event,
          conclusion,
          referenceLabelKey: text(assessment.referenceLabelKey) || null,
          referenceLabelVersion: text(assessment.referenceLabelVersion) || null,
          referenceEffectiveDate: text(assessment.referenceEffectiveDate) || null,
          rationale,
          labelingStatus: derived.labelingStatus,
        }),
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  return getReviewWorkspaceDetail({
    principal: input.principal,
    workspaceId: input.workspaceId,
  });
}

export async function saveCausalityAssessment(input: {
  principal: RequestPrincipal;
  workspaceId: string;
  assessment: CausalityAssessmentInput;
}): Promise<ReviewWorkspaceDetail> {
  const assessment = input.assessment;
  const conclusion = text(assessment.conclusion, "UNRESOLVED").toUpperCase();
  const rationale = auditReason(assessment.rationale);
  if (
    conclusion !== "UNRESOLVED" &&
    (!text(assessment.methodKey) || !text(assessment.methodVersion))
  ) {
    throw new Error(
      "A causality conclusion requires the approved method key and method version. Use UNRESOLVED when no controlled method is configured.",
    );
  }

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const row = await workspaceRow(
      client,
      input.principal.tenantId,
      input.workspaceId,
      true,
    );
    const segments = normalizeSegments(row.patient_segments);
    if (text(row.patient_segmentation_status) !== "COMPLETE") {
      throw new Error("Confirm patient segmentation before causality assessment.");
    }
    const pair = requiredPairs(segments).find(
      (item) =>
        item.segmentKey.toLowerCase() === assessment.patientSegmentKey.toLowerCase() &&
        item.product.toLowerCase() === assessment.reportedProduct.toLowerCase() &&
        item.event.toLowerCase() === assessment.clinicalEvent.toLowerCase(),
    );
    if (!pair) {
      throw new Error("The requested product-event pair is not part of confirmed patient segmentation.");
    }

    await client.query(
      `INSERT INTO literature_causality_assessments (
         tenant_id, review_workspace_id, patient_segment_key,
         reported_product, clinical_event, method_key, method_version,
         conclusion, evidence, rationale, assessed_by, assessed_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,now())
       ON CONFLICT (
         tenant_id, review_workspace_id, patient_segment_key,
         lower(reported_product), lower(clinical_event)
       ) DO UPDATE SET
         method_key = EXCLUDED.method_key,
         method_version = EXCLUDED.method_version,
         conclusion = EXCLUDED.conclusion,
         evidence = EXCLUDED.evidence,
         rationale = EXCLUDED.rationale,
         assessed_by = EXCLUDED.assessed_by,
         assessed_at = now()`,
      [
        input.principal.tenantId,
        input.workspaceId,
        pair.segmentKey,
        pair.product,
        pair.event,
        text(assessment.methodKey) || null,
        text(assessment.methodVersion) || null,
        conclusion,
        JSON.stringify(assessment.evidence || {}),
        rationale,
        input.principal.userId,
      ],
    );
    const derived = await recalculateAssessmentStatuses(
      client,
      input.principal.tenantId,
      input.workspaceId,
      segments,
    );
    await client.query(
      `UPDATE literature_review_workspaces
       SET workspace_version = workspace_version + 1,
           updated_by = $3,
           updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [input.principal.tenantId, input.workspaceId, input.principal.userId],
    );
    await client.query(
      `INSERT INTO audit_events (
         tenant_id, package_id, actor_id, event_type, event_category,
         outcome, details
       ) VALUES ($1,$2,$3,'CAUSALITY_ASSESSMENT_SAVED',
         'LITERATURE_REVIEW','success',$4::jsonb)`,
      [
        input.principal.tenantId,
        row.package_id,
        input.principal.userId,
        JSON.stringify({
          reviewWorkspaceId: input.workspaceId,
          patientSegmentKey: pair.segmentKey,
          product: pair.product,
          event: pair.event,
          methodKey: text(assessment.methodKey) || null,
          methodVersion: text(assessment.methodVersion) || null,
          conclusion,
          rationale,
          causalityStatus: derived.causalityStatus,
        }),
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  return getReviewWorkspaceDetail({
    principal: input.principal,
    workspaceId: input.workspaceId,
  });
}

export async function saveMedicalReview(input: {
  principal: RequestPrincipal;
  workspaceId: string;
  review: MedicalReviewInput;
}): Promise<ReviewWorkspaceDetail> {
  const comments = auditReason(input.review.comments);
  const decision = input.review.decision;
  if (!["APPROVE_FOR_INTAKE", "EXCLUDE", "REVIEW_REQUIRED"].includes(decision)) {
    throw new Error("Invalid Medical Review decision.");
  }

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const row = await workspaceRow(
      client,
      input.principal.tenantId,
      input.workspaceId,
      true,
    );
    const segments = normalizeSegments(row.patient_segments);
    const pairCount = requiredPairs(segments).length;
    const segmentationStatus = text(row.patient_segmentation_status);
    const labelingStatus = text(row.labeling_status);
    const causalityStatus = text(row.causality_status);

    if (decision === "APPROVE_FOR_INTAKE") {
      if (segmentationStatus !== "COMPLETE" || segments.length === 0 || pairCount === 0) {
        throw new Error(
          "Medical Review approval requires confirmed patient segmentation with at least one governed product-event relationship.",
        );
      }
      if (!["COMPLETE", "UNRESOLVED"].includes(labelingStatus)) {
        throw new Error("Complete the labeling / expectedness assessment before Medical Review approval.");
      }
      if (!["COMPLETE", "UNRESOLVED"].includes(causalityStatus)) {
        throw new Error("Complete the causality assessment before Medical Review approval.");
      }
      if (
        (labelingStatus === "UNRESOLVED" || causalityStatus === "UNRESOLVED") &&
        input.review.unresolvedAcknowledged !== true
      ) {
        throw new Error(
          "Medical Reviewer acknowledgement is required when expectedness or causality remains unresolved.",
        );
      }
    }

    const status =
      decision === "APPROVE_FOR_INTAKE"
        ? "APPROVED"
        : decision === "EXCLUDE"
          ? "EXCLUDED"
          : "REVIEW_REQUIRED";
    const workspaceStatus =
      decision === "REVIEW_REQUIRED" ? "IN_REVIEW" : "REVIEW_COMPLETE";
    const workflowState =
      decision === "REVIEW_REQUIRED" ? "REVIEW_IN_PROGRESS" : "REVIEW_COMPLETE";

    const existing = await client.query<{ review_version: number }>(
      `SELECT review_version
       FROM literature_medical_reviews
       WHERE tenant_id = $1 AND review_workspace_id = $2
       FOR UPDATE`,
      [input.principal.tenantId, input.workspaceId],
    );
    const nextVersion = (existing.rows[0]?.review_version || 0) + 1;

    await client.query(
      `INSERT INTO literature_medical_reviews (
         tenant_id, review_workspace_id, review_status, final_decision,
         comments, reviewed_by, reviewed_at, review_version
       ) VALUES ($1,$2,$3,$4,$5,$6,now(),1)
       ON CONFLICT (tenant_id, review_workspace_id)
       DO UPDATE SET
         review_status = EXCLUDED.review_status,
         final_decision = EXCLUDED.final_decision,
         comments = EXCLUDED.comments,
         reviewed_by = EXCLUDED.reviewed_by,
         reviewed_at = now(),
         review_version = literature_medical_reviews.review_version + 1,
         updated_at = now()`,
      [
        input.principal.tenantId,
        input.workspaceId,
        status,
        decision,
        comments,
        input.principal.userId,
      ],
    );
    await client.query(
      `UPDATE literature_review_workspaces
       SET status = $3,
           mr_review_status = $4,
           workspace_version = workspace_version + 1,
           updated_by = $5,
           updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [
        input.principal.tenantId,
        input.workspaceId,
        workspaceStatus,
        status,
        input.principal.userId,
      ],
    );
    await client.query(
      `UPDATE literature_packages
       SET status = $3, updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [input.principal.tenantId, row.package_id, workflowState],
    );
    await client.query(
      `UPDATE literature_workflow_state
       SET workflow_state = $3,
           state_version = state_version + 1,
           state_payload = state_payload || $4::jsonb,
           updated_by = $5,
           updated_at = now()
       WHERE tenant_id = $1 AND package_id = $2`,
      [
        input.principal.tenantId,
        row.package_id,
        workflowState,
        JSON.stringify({
          reviewWorkspaceId: input.workspaceId,
          medicalReviewStatus: status,
          medicalReviewDecision: decision,
          medicalReviewVersion: nextVersion,
          unresolvedAcknowledged: input.review.unresolvedAcknowledged === true,
        }),
        input.principal.userId,
      ],
    );
    await client.query(
      `INSERT INTO audit_events (
         tenant_id, package_id, actor_id, event_type, event_category,
         outcome, details
       ) VALUES ($1,$2,$3,'MEDICAL_REVIEW_SAVED',
         'LITERATURE_MEDICAL_REVIEW','success',$4::jsonb)`,
      [
        input.principal.tenantId,
        row.package_id,
        input.principal.userId,
        JSON.stringify({
          reviewWorkspaceId: input.workspaceId,
          reviewStatus: status,
          finalDecision: decision,
          reviewVersion: nextVersion,
          comments,
          unresolvedAcknowledged: input.review.unresolvedAcknowledged === true,
          labelingStatus,
          causalityStatus,
          patientCount: segments.length,
        }),
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  return getReviewWorkspaceDetail({
    principal: input.principal,
    workspaceId: input.workspaceId,
  });
}
