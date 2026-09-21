import "server-only";

import type { PoolClient } from "pg";
import { getPostgresPool } from "@/lib/database/postgres";
import { validateAuditReason } from "@/lib/audit/reason";
import {
  activeReviewReferenceData,
  expectednessFromReference,
} from "@/lib/literature/review/review-reference-service";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanOptional(value: unknown): string | undefined {
  const text = cleanText(value);
  return text || undefined;
}

function unique(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(cleanText).filter(Boolean))];
}

export interface PatientSegmentInput {
  patientSegmentKey: string;
  patientLabel?: string;
  identifiablePatientStatus: "PRESENT" | "ABSENT" | "UNRESOLVED";
  age?: string;
  sex?: string;
  country?: string;
  evidence?: string;
  products: string[];
  events: string[];
}

export interface LabelAssessmentInput {
  patientSegmentKey: string;
  reportedProduct: string;
  clinicalEvent: string;
  conclusion: "EXPECTED" | "UNEXPECTED" | "UNRESOLVED";
  referenceLabelKey?: string;
  referenceLabelVersion?: string;
  referenceEffectiveDate?: string;
  evidence?: string;
  rationale: string;
}

export interface CausalityAssessmentInput {
  patientSegmentKey: string;
  reportedProduct: string;
  clinicalEvent: string;
  methodKey?: string;
  methodVersion?: string;
  conclusion: string;
  evidence?: string;
  rationale: string;
}

async function getWorkspaceForUpdate(input: {
  principal: RequestPrincipal;
  workspaceId: string;
  client: PoolClient;
}) {
  const result = await input.client.query(
    `SELECT workspace.*, package.package_key
     FROM literature_review_workspaces workspace
     JOIN literature_packages package
       ON package.id = workspace.package_id
      AND package.tenant_id = workspace.tenant_id
     WHERE workspace.id = $1
       AND workspace.tenant_id = $2
     FOR UPDATE OF workspace, package`,
    [input.workspaceId, input.principal.tenantId],
  );
  if (!result.rows[0]) {
    throw new Error("Review workspace was not found in the active tenant.");
  }
  return result.rows[0] as {
    id: string;
    package_id: string;
    screening_result_id: string;
    status: string;
    patient_segmentation_status: string;
    patient_count: number | null;
    labeling_status: string;
    causality_status: string;
    mr_review_status: string;
    patient_segments: unknown;
    package_key: string;
    product_context: unknown;
  };
}



function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function screeningProductContext(input: {
  client: PoolClient;
  tenantId: string;
  screeningResultId: string;
}): Promise<Map<string, { productId?: string; countryOfInterest?: string }>> {
  const result = await input.client.query<{ result_payload: unknown }>(
    `SELECT result_payload
     FROM screening_results
     WHERE id = $1 AND tenant_id = $2
     LIMIT 1`,
    [input.screeningResultId, input.tenantId],
  );
  const payload = isRecord(result.rows[0]?.result_payload)
    ? result.rows[0].result_payload
    : {};
  const screening = isRecord(payload.result) ? payload.result : {};
  const assessments = Array.isArray(screening.companySuspectAssessments)
    ? screening.companySuspectAssessments.filter(isRecord)
    : [];

  const map = new Map<string, { productId?: string; countryOfInterest?: string }>();
  for (const assessment of assessments) {
    const reportedProduct = cleanText(assessment.reportedProduct);
    if (!reportedProduct) continue;
    const candidate = isRecord(assessment.selectedCandidate)
      ? assessment.selectedCandidate
      : undefined;
    map.set(reportedProduct, {
      productId: candidate ? cleanOptional(candidate.productId) : undefined,
      countryOfInterest: cleanOptional(assessment.countryOfInterest),
    });
  }
  return map;
}

function sameDate(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) return false;
  return left.slice(0, 10) === right.slice(0, 10);
}

function patientSegmentMap(value: unknown): Map<string, { products: string[]; events: string[] }> {
  const map = new Map<string, { products: string[]; events: string[] }>();
  if (!Array.isArray(value)) return map;
  for (const item of value) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const key = cleanText(row.patientSegmentKey);
    if (!key) continue;
    map.set(key, {
      products: unique(row.products),
      events: unique(row.events),
    });
  }
  return map;
}

function assertAssessmentPairInPatient(
  patientSegments: unknown,
  assessment: { patientSegmentKey: string; reportedProduct: string; clinicalEvent: string },
): void {
  const map = patientSegmentMap(patientSegments);
  const patient = map.get(assessment.patientSegmentKey);
  if (!patient) {
    throw new Error(`Patient segment ${assessment.patientSegmentKey} does not exist in the governed segmentation.`);
  }
  if (!patient.products.includes(assessment.reportedProduct)) {
    throw new Error(
      `Product "${assessment.reportedProduct}" is not assigned to patient segment ${assessment.patientSegmentKey}.`,
    );
  }
  if (!patient.events.includes(assessment.clinicalEvent)) {
    throw new Error(
      `Event "${assessment.clinicalEvent}" is not assigned to patient segment ${assessment.patientSegmentKey}.`,
    );
  }
}

export async function savePatientSegmentation(input: {
  principal: RequestPrincipal;
  workspaceId: string;
  patients: PatientSegmentInput[];
  reason: string;
}): Promise<void> {
  const audit = validateAuditReason(input.reason);
  if (!audit.valid) throw new Error(audit.message || "A specific audit reason is required.");
  if (!input.workspaceId?.trim()) throw new Error("workspaceId is required.");
  if (!Array.isArray(input.patients) || input.patients.length > 20) {
    throw new Error("Patient segmentation supports 0 to 20 patient segments.");
  }

  const seen = new Set<string>();
  const patients = input.patients.map((patient, index) => {
    const patientSegmentKey = cleanText(patient.patientSegmentKey) || `P${index + 1}`;
    if (seen.has(patientSegmentKey)) {
      throw new Error(`Duplicate patient segment key: ${patientSegmentKey}`);
    }
    seen.add(patientSegmentKey);
    if (!["PRESENT", "ABSENT", "UNRESOLVED"].includes(patient.identifiablePatientStatus)) {
      throw new Error(`Invalid identifiable patient status for ${patientSegmentKey}.`);
    }
    const products = unique(patient.products);
    const events = unique(patient.events);
    if (products.length === 0 && events.length === 0) {
      throw new Error(`Patient segment ${patientSegmentKey} must carry at least one product or event.`);
    }
    return {
      patientSegmentKey,
      patientLabel: cleanOptional(patient.patientLabel),
      identifiablePatientStatus: patient.identifiablePatientStatus,
      age: cleanOptional(patient.age),
      sex: cleanOptional(patient.sex),
      country: cleanOptional(patient.country),
      evidence: cleanOptional(patient.evidence),
      products,
      events,
    };
  });

  const pool = getPostgresPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const workspace = await getWorkspaceForUpdate({
      principal: input.principal,
      workspaceId: input.workspaceId,
      client,
    });

    if (workspace.status === "REVIEW_COMPLETE") {
      throw new Error("Completed Review workspace cannot be edited.");
    }

    await client.query(
      `DELETE FROM literature_label_assessments
       WHERE tenant_id = $1 AND review_workspace_id = $2`,
      [input.principal.tenantId, workspace.id],
    );
    await client.query(
      `DELETE FROM literature_causality_assessments
       WHERE tenant_id = $1 AND review_workspace_id = $2`,
      [input.principal.tenantId, workspace.id],
    );

    const downstreamStatus = patients.length === 0 ? "NOT_APPLICABLE" : "PENDING";

    await client.query(
      `UPDATE literature_review_workspaces
       SET patient_segments = $3::jsonb,
           patient_count = $4,
           patient_segmentation_status = 'COMPLETE',
           labeling_status = $5,
           causality_status = $5,
           status = 'IN_REVIEW',
           updated_by = $6,
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [
        workspace.id,
        input.principal.tenantId,
        JSON.stringify(patients),
        patients.length,
        downstreamStatus,
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
       WHERE package_id = $1 AND tenant_id = $2`,
      [
        workspace.package_id,
        input.principal.tenantId,
        JSON.stringify({
          reviewWorkspaceId: workspace.id,
          patientSegmentationStatus: "COMPLETE",
          patientCount: patients.length,
        }),
        input.principal.userId,
      ],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, package_id, actor_id, event_type, event_category, outcome, details
       ) VALUES ($1,$2,$3,'REVIEW_PATIENT_SEGMENTATION_SAVED',
         'LITERATURE_REVIEW','success',$4::jsonb)`,
      [
        input.principal.tenantId,
        workspace.package_id,
        input.principal.userId,
        JSON.stringify({
          reviewWorkspaceId: workspace.id,
          patientCount: patients.length,
          patientSegmentKeys: patients.map((patient) => patient.patientSegmentKey),
          downstreamAssessmentsReset: true,
          downstreamStatus,
          reason: audit.reason,
        }),
      ],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function saveLabelAssessments(input: {
  principal: RequestPrincipal;
  workspaceId: string;
  assessments: LabelAssessmentInput[];
  reason: string;
}): Promise<void> {
  const audit = validateAuditReason(input.reason);
  if (!audit.valid) throw new Error(audit.message || "A specific audit reason is required.");
  if (!Array.isArray(input.assessments) || input.assessments.length === 0) {
    throw new Error("At least one labeling assessment is required.");
  }

  const assessments = input.assessments.map((assessment) => {
    const patientSegmentKey = cleanText(assessment.patientSegmentKey);
    const reportedProduct = cleanText(assessment.reportedProduct);
    const clinicalEvent = cleanText(assessment.clinicalEvent);
    const rationale = cleanText(assessment.rationale);
    if (!patientSegmentKey || !reportedProduct || !clinicalEvent || !rationale) {
      throw new Error("Patient segment, product, event and labeling rationale are required.");
    }
    if (!["EXPECTED", "UNEXPECTED", "UNRESOLVED"].includes(assessment.conclusion)) {
      throw new Error("Invalid expectedness conclusion.");
    }
    const referenceLabelKey = cleanOptional(assessment.referenceLabelKey);
    const referenceLabelVersion = cleanOptional(assessment.referenceLabelVersion);
    const referenceEffectiveDate = cleanOptional(assessment.referenceEffectiveDate);
    if (
      assessment.conclusion !== "UNRESOLVED" &&
      (!referenceLabelKey || !referenceLabelVersion || !referenceEffectiveDate)
    ) {
      throw new Error(
        "EXPECTED or UNEXPECTED requires an approved reference label key, version and effective date.",
      );
    }
    return {
      patientSegmentKey,
      reportedProduct,
      clinicalEvent,
      conclusion: assessment.conclusion,
      referenceLabelKey,
      referenceLabelVersion,
      referenceEffectiveDate,
      evidence: cleanOptional(assessment.evidence),
      rationale,
    };
  });

  const referenceData = await activeReviewReferenceData(input.principal.tenantId);
  const pool = getPostgresPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const workspace = await getWorkspaceForUpdate({
      principal: input.principal,
      workspaceId: input.workspaceId,
      client,
    });
    if (workspace.patient_segmentation_status !== "COMPLETE") {
      throw new Error("Complete patient segmentation before labeling assessment.");
    }
    if (workspace.status === "REVIEW_COMPLETE") {
      throw new Error("Completed Review workspace cannot be edited.");
    }
    const productContext = await screeningProductContext({
      client,
      tenantId: input.principal.tenantId,
      screeningResultId: workspace.screening_result_id,
    });

    for (const assessment of assessments) {
      assertAssessmentPairInPatient(workspace.patient_segments, assessment);

      if (assessment.conclusion === "UNRESOLVED") continue;

      const productContext = isRecord(workspace.product_context)
        ? workspace.product_context
        : {};
      const allowedScope =
        productContext.validationFixture === true
          ? "VALIDATION_ONLY"
          : "PRODUCTION";
      const reference = referenceData.labelReferences.find(
        (candidate) =>
          candidate.usageScope === allowedScope &&
          candidate.labelKey === assessment.referenceLabelKey &&
          candidate.version === assessment.referenceLabelVersion,
      );
      if (!reference) {
        throw new Error(
          `Label reference ${assessment.referenceLabelKey || "—"} ${assessment.referenceLabelVersion || ""} is not an active governed Label / RSI configuration.`,
        );
      }

      if (!sameDate(reference.effectiveFrom, assessment.referenceEffectiveDate)) {
        throw new Error(
          "Label effective date must match the active governed reference version.",
        );
      }

      const context = productContext.get(assessment.reportedProduct);
      if (!context?.productId) {
        throw new Error(
          `Expectedness for ${assessment.reportedProduct} cannot be finalized without a governed Product Master match.`,
        );
      }
      if (context.productId !== reference.clientProductId) {
        throw new Error(
          `Label reference ${reference.labelKey} belongs to ${reference.clientProductId}, not the matched product ${context.productId}.`,
        );
      }
      if (!context.countryOfInterest) {
        throw new Error(
          "Expectedness cannot be finalized while Country of Incidence / applicable market is unresolved.",
        );
      }
      if (
        context.countryOfInterest.trim().toLowerCase() !==
        reference.country.trim().toLowerCase()
      ) {
        throw new Error(
          `Label reference market ${reference.country} does not match the governed country ${context.countryOfInterest}.`,
        );
      }

      const governedExpectedness = expectednessFromReference({
        clinicalEvent: assessment.clinicalEvent,
        reference,
      });
      if (governedExpectedness !== assessment.conclusion) {
        throw new Error(
          `Expectedness mismatch for ${assessment.clinicalEvent}: active Label / RSI resolves to ${governedExpectedness}, not ${assessment.conclusion}.`,
        );
      }
    }

    await client.query(
      `DELETE FROM literature_label_assessments
       WHERE tenant_id = $1 AND review_workspace_id = $2`,
      [input.principal.tenantId, workspace.id],
    );

    for (const assessment of assessments) {
      await client.query(
        `INSERT INTO literature_label_assessments (
           tenant_id, review_workspace_id, patient_segment_key,
           reported_product, clinical_event, conclusion,
           reference_label_key, reference_label_version, reference_effective_date,
           evidence, rationale, assessed_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)`,
        [
          input.principal.tenantId,
          workspace.id,
          assessment.patientSegmentKey,
          assessment.reportedProduct,
          assessment.clinicalEvent,
          assessment.conclusion,
          assessment.referenceLabelKey || null,
          assessment.referenceLabelVersion || null,
          assessment.referenceEffectiveDate || null,
          JSON.stringify({ sourceText: assessment.evidence || null }),
          assessment.rationale,
          input.principal.userId,
        ],
      );
    }

    const status = assessments.every((assessment) => assessment.conclusion === "UNRESOLVED")
      ? "UNRESOLVED"
      : "COMPLETE";

    await client.query(
      `UPDATE literature_review_workspaces
       SET labeling_status = $3,
           status = 'IN_REVIEW',
           updated_by = $4,
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [workspace.id, input.principal.tenantId, status, input.principal.userId],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, package_id, actor_id, event_type, event_category, outcome, details
       ) VALUES ($1,$2,$3,'REVIEW_LABELING_ASSESSMENTS_SAVED',
         'LITERATURE_REVIEW','success',$4::jsonb)`,
      [
        input.principal.tenantId,
        workspace.package_id,
        input.principal.userId,
        JSON.stringify({
          reviewWorkspaceId: workspace.id,
          assessmentCount: assessments.length,
          labelingStatus: status,
          reason: audit.reason,
        }),
      ],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function saveCausalityAssessments(input: {
  principal: RequestPrincipal;
  workspaceId: string;
  assessments: CausalityAssessmentInput[];
  reason: string;
}): Promise<void> {
  const audit = validateAuditReason(input.reason);
  if (!audit.valid) throw new Error(audit.message || "A specific audit reason is required.");
  if (!Array.isArray(input.assessments) || input.assessments.length === 0) {
    throw new Error("At least one causality assessment is required.");
  }

  const assessments = input.assessments.map((assessment) => {
    const patientSegmentKey = cleanText(assessment.patientSegmentKey);
    const reportedProduct = cleanText(assessment.reportedProduct);
    const clinicalEvent = cleanText(assessment.clinicalEvent);
    const conclusion = cleanText(assessment.conclusion).toUpperCase();
    const rationale = cleanText(assessment.rationale);
    if (!patientSegmentKey || !reportedProduct || !clinicalEvent || !conclusion || !rationale) {
      throw new Error("Patient segment, product, event, causality conclusion and rationale are required.");
    }
    const methodKey = cleanOptional(assessment.methodKey);
    const methodVersion = cleanOptional(assessment.methodVersion);
    if (conclusion !== "UNRESOLVED" && (!methodKey || !methodVersion)) {
      throw new Error(
        "A non-UNRESOLVED causality conclusion requires the approved method key and version.",
      );
    }
    return {
      patientSegmentKey,
      reportedProduct,
      clinicalEvent,
      conclusion,
      methodKey,
      methodVersion,
      evidence: cleanOptional(assessment.evidence),
      rationale,
    };
  });

  const referenceData = await activeReviewReferenceData(input.principal.tenantId);
  const pool = getPostgresPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const workspace = await getWorkspaceForUpdate({
      principal: input.principal,
      workspaceId: input.workspaceId,
      client,
    });
    if (workspace.patient_segmentation_status !== "COMPLETE") {
      throw new Error("Complete patient segmentation before causality assessment.");
    }
    if (workspace.status === "REVIEW_COMPLETE") {
      throw new Error("Completed Review workspace cannot be edited.");
    }
    for (const assessment of assessments) {
      assertAssessmentPairInPatient(workspace.patient_segments, assessment);

      if (assessment.conclusion === "UNRESOLVED" && !assessment.methodKey) continue;

      const productContext = isRecord(workspace.product_context)
        ? workspace.product_context
        : {};
      const allowedScope =
        productContext.validationFixture === true
          ? "VALIDATION_ONLY"
          : "PRODUCTION";
      const method = referenceData.causalityMethods.find(
        (candidate) =>
          candidate.usageScope === allowedScope &&
          candidate.methodKey === assessment.methodKey &&
          candidate.version === assessment.methodVersion,
      );
      if (!method) {
        throw new Error(
          `Causality method ${assessment.methodKey || "—"} ${assessment.methodVersion || ""} is not an active governed method.`,
        );
      }
      if (
        assessment.conclusion !== "UNRESOLVED" &&
        !method.allowedConclusions.includes(assessment.conclusion)
      ) {
        throw new Error(
          `Causality conclusion ${assessment.conclusion} is not allowed by ${method.methodKey} ${method.version}.`,
        );
      }
    }

    await client.query(
      `DELETE FROM literature_causality_assessments
       WHERE tenant_id = $1 AND review_workspace_id = $2`,
      [input.principal.tenantId, workspace.id],
    );

    for (const assessment of assessments) {
      await client.query(
        `INSERT INTO literature_causality_assessments (
           tenant_id, review_workspace_id, patient_segment_key,
           reported_product, clinical_event, method_key, method_version,
           conclusion, evidence, rationale, assessed_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`,
        [
          input.principal.tenantId,
          workspace.id,
          assessment.patientSegmentKey,
          assessment.reportedProduct,
          assessment.clinicalEvent,
          assessment.methodKey || null,
          assessment.methodVersion || null,
          assessment.conclusion,
          JSON.stringify({ sourceText: assessment.evidence || null }),
          assessment.rationale,
          input.principal.userId,
        ],
      );
    }

    const status = assessments.every((assessment) => assessment.conclusion === "UNRESOLVED")
      ? "UNRESOLVED"
      : "COMPLETE";

    await client.query(
      `UPDATE literature_review_workspaces
       SET causality_status = $3,
           status = 'IN_REVIEW',
           updated_by = $4,
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [workspace.id, input.principal.tenantId, status, input.principal.userId],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, package_id, actor_id, event_type, event_category, outcome, details
       ) VALUES ($1,$2,$3,'REVIEW_CAUSALITY_ASSESSMENTS_SAVED',
         'LITERATURE_REVIEW','success',$4::jsonb)`,
      [
        input.principal.tenantId,
        workspace.package_id,
        input.principal.userId,
        JSON.stringify({
          reviewWorkspaceId: workspace.id,
          assessmentCount: assessments.length,
          causalityStatus: status,
          reason: audit.reason,
        }),
      ],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function saveMedicalReview(input: {
  principal: RequestPrincipal;
  workspaceId: string;
  status: "APPROVED" | "REVIEW_REQUIRED" | "EXCLUDED";
  finalDecision: string;
  comments: string;
  reason: string;
}): Promise<void> {
  const audit = validateAuditReason(input.reason);
  if (!audit.valid) throw new Error(audit.message || "A specific audit reason is required.");
  if (!["APPROVED", "REVIEW_REQUIRED", "EXCLUDED"].includes(input.status)) {
    throw new Error("Invalid Medical Review status.");
  }
  const comments = cleanText(input.comments);
  const finalDecision = cleanText(input.finalDecision).toUpperCase();
  if (!comments || comments.length < 5) {
    throw new Error("Medical Review comments are required.");
  }
  if (!finalDecision) throw new Error("Medical Review final decision is required.");

  const pool = getPostgresPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const workspace = await getWorkspaceForUpdate({
      principal: input.principal,
      workspaceId: input.workspaceId,
      client,
    });

    if (workspace.patient_segmentation_status !== "COMPLETE") {
      throw new Error("Medical Review requires completed patient segmentation.");
    }
    const patientCount = workspace.patient_count || 0;

    if (input.status === "APPROVED") {
      if (patientCount < 1) {
        throw new Error("APPROVED Medical Review requires at least one patient segment.");
      }
      if (
        ["NOT_CONFIGURED", "PENDING", "NOT_APPLICABLE"].includes(workspace.labeling_status) ||
        ["NOT_CONFIGURED", "PENDING", "NOT_APPLICABLE"].includes(workspace.causality_status)
      ) {
        throw new Error(
          "APPROVED Medical Review requires governed labeling and causality assessment.",
        );
      }
    }

    if (input.status === "EXCLUDED" && patientCount === 0) {
      if (
        workspace.labeling_status !== "NOT_APPLICABLE" ||
        workspace.causality_status !== "NOT_APPLICABLE"
      ) {
        throw new Error(
          "Zero-patient Review exclusion requires labeling and causality to be NOT_APPLICABLE.",
        );
      }
    }

    const existing = await client.query<{ review_version: number }>(
      `SELECT review_version
       FROM literature_medical_reviews
       WHERE tenant_id = $1 AND review_workspace_id = $2
       FOR UPDATE`,
      [input.principal.tenantId, workspace.id],
    );
    const nextVersion = (existing.rows[0]?.review_version || 0) + 1;

    await client.query(
      `INSERT INTO literature_medical_reviews (
         tenant_id, review_workspace_id, review_status, final_decision,
         comments, reviewed_by, reviewed_at, review_version
       ) VALUES ($1,$2,$3,$4,$5,$6,now(),$7)
       ON CONFLICT (tenant_id, review_workspace_id)
       DO UPDATE SET
         review_status = EXCLUDED.review_status,
         final_decision = EXCLUDED.final_decision,
         comments = EXCLUDED.comments,
         reviewed_by = EXCLUDED.reviewed_by,
         reviewed_at = EXCLUDED.reviewed_at,
         review_version = EXCLUDED.review_version,
         updated_at = now()`,
      [
        input.principal.tenantId,
        workspace.id,
        input.status,
        finalDecision,
        comments,
        input.principal.userId,
        nextVersion,
      ],
    );

    const reviewComplete = input.status === "APPROVED" || input.status === "EXCLUDED";
    const workspaceStatus = reviewComplete ? "REVIEW_COMPLETE" : "IN_REVIEW";
    const workflowState = reviewComplete ? "REVIEW_COMPLETE" : "REVIEW_IN_PROGRESS";

    await client.query(
      `UPDATE literature_review_workspaces
       SET status = $3,
           mr_review_status = $4,
           updated_by = $5,
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [
        workspace.id,
        input.principal.tenantId,
        workspaceStatus,
        input.status,
        input.principal.userId,
      ],
    );

    await client.query(
      `UPDATE literature_packages
       SET status = $3, updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [workspace.package_id, input.principal.tenantId, workflowState],
    );

    await client.query(
      `UPDATE literature_workflow_state
       SET workflow_state = $3,
           state_version = state_version + 1,
           state_payload = state_payload || $4::jsonb,
           updated_by = $5,
           updated_at = now()
       WHERE package_id = $1 AND tenant_id = $2`,
      [
        workspace.package_id,
        input.principal.tenantId,
        workflowState,
        JSON.stringify({
          reviewWorkspaceId: workspace.id,
          medicalReviewStatus: input.status,
          medicalReviewDecision: finalDecision,
          medicalReviewVersion: nextVersion,
          medicalReviewedAt: new Date().toISOString(),
        }),
        input.principal.userId,
      ],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, package_id, actor_id, event_type, event_category, outcome, details
       ) VALUES ($1,$2,$3,'MEDICAL_REVIEW_SAVED',
         'LITERATURE_MEDICAL_REVIEW','success',$4::jsonb)`,
      [
        input.principal.tenantId,
        workspace.package_id,
        input.principal.userId,
        JSON.stringify({
          reviewWorkspaceId: workspace.id,
          reviewStatus: input.status,
          finalDecision,
          reviewVersion: nextVersion,
          workflowState,
          reason: audit.reason,
          comments,
        }),
      ],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
