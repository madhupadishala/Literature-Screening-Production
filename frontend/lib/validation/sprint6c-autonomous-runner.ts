import "server-only";

import { createHash } from "node:crypto";

import { getPostgresPool } from "@/lib/database/postgres";
import { saveHitsReview } from "@/lib/literature/hits/hits-review-repository";
import {
  executeScreening,
  saveScreeningReview,
} from "@/lib/literature/screening/screening-workflow-service";
import { runPatientExtraction } from "@/lib/literature/review/patient-extraction-service";
import {
  saveCausalityAssessments,
  saveLabelAssessments,
  saveMedicalReview,
  savePatientSegmentation,
} from "@/lib/literature/review/review-mutation-service";
import { activeReviewReferenceData } from "@/lib/literature/review/review-reference-service";
import { generateIntakeInput } from "@/lib/literature/intake-input/intake-input-service";
import { createSprint6CPositiveFixture } from "@/lib/validation/sprint6c-fixture-service";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";

const AUTOMATION_REASON =
  "Autonomous Sprint 6C validation harness execution on synthetic validation-only data under explicit owner authorization.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function assertTrue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export interface Sprint6CAutonomousReport {
  status: "PASSED";
  fixture: {
    packageId: string;
    packageKey: string;
    searchId: string;
    validationPackageId: string;
  };
  checkpoints: Array<{
    checkpoint: string;
    status: "PASSED";
    details: Record<string, unknown>;
  }>;
  intake: {
    exportId: string;
    exportVersion: number;
    sha256: string;
  };
  validationReportArtifactSha256: string;
  automationDisclosure: {
    syntheticValidationOnly: boolean;
    automatedReviewerSimulation: boolean;
    productionHumanGatesUnchanged: boolean;
  };
}

async function latestHits(input: {
  tenantId: string;
  packageId: string;
}): Promise<{
  id: string;
  result_version: number;
  result_payload: Record<string, unknown>;
}> {
  const result = await getPostgresPool().query<{
    id: string;
    result_version: number;
    result_payload: Record<string, unknown>;
  }>(
    `SELECT id, result_version, result_payload
     FROM hits_results
     WHERE tenant_id = $1 AND package_id = $2
     ORDER BY result_version DESC, created_at DESC
     LIMIT 1`,
    [input.tenantId, input.packageId],
  );
  if (!result.rows[0]) throw new Error("Sprint 6C Hits result was not created.");
  return result.rows[0];
}

async function reviewWorkspace(input: {
  tenantId: string;
  packageId: string;
  screeningResultId: string;
}): Promise<string> {
  const result = await getPostgresPool().query<{ id: string }>(
    `SELECT id
     FROM literature_review_workspaces
     WHERE tenant_id = $1 AND package_id = $2 AND screening_result_id = $3
     ORDER BY created_at DESC
     LIMIT 1`,
    [input.tenantId, input.packageId, input.screeningResultId],
  );
  if (!result.rows[0]) throw new Error("Sprint 6C Review workspace was not created.");
  return result.rows[0].id;
}

export async function runSprint6CAutonomousValidation(input: {
  principal: RequestPrincipal;
}): Promise<Sprint6CAutonomousReport> {
  const checkpoints: Sprint6CAutonomousReport["checkpoints"] = [];
  const pool = getPostgresPool();

  await pool.query(
    `INSERT INTO audit_events (
       tenant_id, actor_id, event_type, event_category, outcome, details
     ) VALUES ($1,$2,'SPRINT_6C_AUTONOMOUS_VALIDATION_STARTED',
       'LITERATURE_VALIDATION','started',$3::jsonb)`,
    [
      input.principal.tenantId,
      input.principal.userId,
      JSON.stringify({
        validationAutomation: true,
        syntheticValidationOnly: true,
        productionHumanGatesUnchanged: true,
        reason: AUTOMATION_REASON,
      }),
    ],
  );

  const fixture = await createSprint6CPositiveFixture({
    principal: input.principal,
    reason: AUTOMATION_REASON,
  });
  checkpoints.push({
    checkpoint: "FIXTURE_CREATED_AND_HITS_AI_EXECUTED",
    status: "PASSED",
    details: {
      packageId: fixture.packageId,
      packageKey: fixture.packageKey,
      searchId: fixture.searchId,
      validationPackageId: fixture.validationPackageId,
    },
  });

  const hits = await latestHits({
    tenantId: input.principal.tenantId,
    packageId: fixture.packageId,
  });
  const hitsPayload = isRecord(hits.result_payload) ? hits.result_payload : {};
  const hitsResult = isRecord(hitsPayload.result) ? hitsPayload.result : {};
  assertTrue(
    text(hitsPayload.status) !== "HITS_EXECUTION_FAILED",
    "Sprint 6C Hits AI execution failed.",
  );
  const patientSafety = isRecord(hitsResult.patientSafetyAssessment)
    ? hitsResult.patientSafetyAssessment
    : {};
  assertTrue(
    text(patientSafety.relevance) === "RELEVANT",
    `Sprint 6C expected Hits patient-safety relevance RELEVANT, received ${text(patientSafety.relevance) || "UNRESOLVED"}.`,
  );
  const hitCompanyAssessments = Array.isArray(hitsResult.companySuspectAssessments)
    ? hitsResult.companySuspectAssessments.filter(isRecord)
    : [];
  const hitCompanyProduct = hitCompanyAssessments.find((assessment) => {
    const candidate = isRecord(assessment.selectedCandidate)
      ? assessment.selectedCandidate
      : {};
    return text(candidate.productId) === "DEMO-PROD-001";
  });
  assertTrue(
    hitCompanyProduct,
    "Sprint 6C Hits AI did not match DEMO-PROD-001.",
  );

  await saveHitsReview({
    principal: input.principal,
    review: {
      packageId: fixture.packageId,
      hitsResultId: hits.id,
      status: "approved",
      comments:
        "AUTOMATED VALIDATION HARNESS: synthetic fixture only. Hits AI output met the controlled positive-path assertions; production human review rules remain unchanged.",
      expectedVersion: 0,
    },
  });
  checkpoints.push({
    checkpoint: "HITS_VALIDATION_GATE",
    status: "PASSED",
    details: {
      hitsResultId: hits.id,
      hitsResultVersion: hits.result_version,
      reviewerMode: "AUTOMATED_VALIDATION_SIMULATION",
    },
  });

  const screening = await executeScreening({
    principal: input.principal,
    request: {
      packageId: fixture.packageId,
      reason:
        "Run governed Screening AI for the Sprint 6C synthetic positive validation fixture.",
    },
  });
  assertTrue(
    screening.executionStatus === "completed",
    `Sprint 6C Screening execution did not complete: ${screening.error || screening.executionStatus}.`,
  );
  assertTrue(
    screening.decision === "INCLUDE",
    `Sprint 6C positive fixture expected Screening INCLUDE, received ${screening.decision} (${screening.reason}).`,
  );
  assertTrue(
    screening.screeningResultId,
    "Sprint 6C Screening result ID is missing.",
  );

  const confirmedCompanyProduct = (screening.companySuspectAssessments || []).find(
    (assessment) =>
      assessment.selectedCandidate?.productId === "DEMO-PROD-001" &&
      assessment.companySuspect === true &&
      assessment.conclusion === "CONFIRMED",
  );
  assertTrue(
    confirmedCompanyProduct,
    "Sprint 6C Screening did not confirm DEMO-PROD-001 as the company suspect product.",
  );
  assertTrue(
    normalize(confirmedCompanyProduct.countryOfInterest || "") === "india",
    "Sprint 6C Screening did not establish India as Country of Incidence.",
  );

  await saveScreeningReview({
    principal: input.principal,
    review: {
      packageId: fixture.packageId,
      screeningResultId: screening.screeningResultId,
      status: "approved",
      finalDecision: "INCLUDE",
      comments:
        "AUTOMATED VALIDATION HARNESS: synthetic fixture satisfied governed positive-path Screening assertions. This is not a production medical decision.",
      expectedVersion: 0,
    },
  });
  checkpoints.push({
    checkpoint: "SCREENING_AI_AND_VALIDATION_GATE",
    status: "PASSED",
    details: {
      screeningResultId: screening.screeningResultId,
      resultVersion: screening.resultVersion,
      decision: screening.decision,
      companyProductId: confirmedCompanyProduct.selectedCandidate?.productId,
      countryOfIncidence: confirmedCompanyProduct.countryOfInterest,
    },
  });

  const workspaceId = await reviewWorkspace({
    tenantId: input.principal.tenantId,
    packageId: fixture.packageId,
    screeningResultId: screening.screeningResultId,
  });

  const extraction = await runPatientExtraction({
    principal: input.principal,
    workspaceId,
    reason:
      "Run source-linked patient extraction for the Sprint 6C synthetic validation fixture.",
  });
  assertTrue(
    extraction.classification === "SINGLE_PATIENT",
    `Sprint 6C expected SINGLE_PATIENT extraction, received ${extraction.classification}.`,
  );
  assertTrue(
    extraction.patients.length === 1,
    `Sprint 6C expected one extracted patient, received ${extraction.patients.length}.`,
  );

  const suggestion = extraction.patients[0];
  assertTrue(
    normalize(suggestion.country || "") === "india",
    "Sprint 6C patient extraction did not retain direct India location evidence.",
  );
  const sourceProduct = suggestion.products.find((product) =>
    normalize(product.name).includes("paracetamol"),
  );
  const sourceEvent = suggestion.events.find((event) =>
    normalize(event.name).includes("urticaria"),
  );
  assertTrue(
    sourceProduct,
    "Sprint 6C patient extraction did not retain source-linked paracetamol evidence.",
  );
  assertTrue(
    sourceEvent,
    "Sprint 6C patient extraction did not retain source-linked urticaria evidence.",
  );

  const reportedProduct =
    confirmedCompanyProduct.reportedProduct || sourceProduct.name;
  const controlledEvent = "Urticaria";
  await savePatientSegmentation({
    principal: input.principal,
    workspaceId,
    patients: [
      {
        patientSegmentKey: "P1",
        patientLabel: "Patient 1",
        identifiablePatientStatus: suggestion.identifiablePatientStatus,
        age: suggestion.age,
        sex: suggestion.sex,
        country: suggestion.country,
        evidence: [
          `Patient [${suggestion.patientEvidence.location}]: ${suggestion.patientEvidence.quote}`,
          `Product [${sourceProduct.evidence.location}]: ${sourceProduct.evidence.quote}`,
          `Event [${sourceEvent.evidence.location}]: ${sourceEvent.evidence.quote}`,
          "Normalization: source-supported urticaria mapped to controlled event term Urticaria for validation.",
        ].join("\n"),
        products: [reportedProduct],
        events: [controlledEvent],
      },
    ],
    reason:
      "Confirm source-linked patient segmentation for the Sprint 6C synthetic validation fixture.",
  });
  checkpoints.push({
    checkpoint: "PATIENT_EXTRACTION_AND_SEGMENTATION",
    status: "PASSED",
    details: {
      patientExtractionRunId: extraction.runId,
      extractionVersion: extraction.runVersion,
      sourceSha256: extraction.sourceSha256,
      patientCount: 1,
      reportedProduct,
      clinicalEvent: controlledEvent,
      country: suggestion.country,
    },
  });

  const referenceData = await activeReviewReferenceData(input.principal.tenantId);
  const labelReference = referenceData.labelReferences.find(
    (reference) =>
      reference.usageScope === "VALIDATION_ONLY" &&
      reference.clientProductId === "DEMO-PROD-001" &&
      normalize(reference.country) === "india" &&
      reference.eventTerms.some((event) => normalize(event) === "urticaria"),
  );
  assertTrue(
    labelReference,
    "Sprint 6C validation-only Label/RSI reference is unavailable.",
  );

  await saveLabelAssessments({
    principal: input.principal,
    workspaceId,
    assessments: [
      {
        patientSegmentKey: "P1",
        reportedProduct,
        clinicalEvent: controlledEvent,
        conclusion: "EXPECTED",
        referenceLabelKey: labelReference.labelKey,
        referenceLabelVersion: labelReference.version,
        referenceEffectiveDate: labelReference.effectiveFrom.slice(0, 10),
        evidence:
          "Synthetic validation-only CCSI lists Urticaria as an expected event for DEMO-PROD-001 in India.",
        rationale:
          "Expectedness resolved deterministically against the active VALIDATION_ONLY label reference for the controlled fixture.",
      },
    ],
    reason:
      "Complete validation-only expectedness assessment for the Sprint 6C synthetic fixture.",
  });

  const causalityMethod = referenceData.causalityMethods.find(
    (method) =>
      method.usageScope === "VALIDATION_ONLY" &&
      method.methodKey === "VAL-STRUCTURED-CLINICAL-JUDGEMENT",
  );
  assertTrue(
    causalityMethod,
    "Sprint 6C validation-only causality method is unavailable.",
  );
  assertTrue(
    causalityMethod.allowedConclusions.includes("POSSIBLY_RELATED"),
    "Sprint 6C causality method does not allow POSSIBLY_RELATED.",
  );

  await saveCausalityAssessments({
    principal: input.principal,
    workspaceId,
    assessments: [
      {
        patientSegmentKey: "P1",
        reportedProduct,
        clinicalEvent: controlledEvent,
        methodKey: causalityMethod.methodKey,
        methodVersion: causalityMethod.version,
        conclusion: "POSSIBLY_RELATED",
        evidence:
          "Synthetic source states urticaria developed two hours after paracetamol administration and resolved after withdrawal with antihistamine treatment.",
        rationale:
          "Validation-only structured clinical judgement: compatible chronology and positive dechallenge are present; the controlled conclusion is used solely to exercise the configured causality workflow.",
      },
    ],
    reason:
      "Complete validation-only causality assessment for the Sprint 6C synthetic fixture.",
  });
  checkpoints.push({
    checkpoint: "EXPECTEDNESS_AND_CAUSALITY",
    status: "PASSED",
    details: {
      expectedness: "EXPECTED",
      labelKey: labelReference.labelKey,
      labelVersion: labelReference.version,
      causality: "POSSIBLY_RELATED",
      causalityMethod: causalityMethod.methodKey,
      causalityMethodVersion: causalityMethod.version,
    },
  });

  await saveMedicalReview({
    principal: input.principal,
    workspaceId,
    status: "APPROVED",
    finalDecision: "INTAKE_READY",
    comments:
      "AUTOMATED VALIDATION HARNESS: synthetic positive fixture completed patient, expectedness, and causality assertions. Approval simulates the MR gate for validation only and is not a production medical review.",
    reason:
      "Complete the Sprint 6C synthetic Medical Review validation gate under automated validation simulation.",
  });
  checkpoints.push({
    checkpoint: "MEDICAL_REVIEW_VALIDATION_GATE",
    status: "PASSED",
    details: {
      reviewWorkspaceId: workspaceId,
      status: "APPROVED",
      finalDecision: "INTAKE_READY",
      reviewerMode: "AUTOMATED_VALIDATION_SIMULATION",
    },
  });

  const intake = await generateIntakeInput({
    principal: input.principal,
    request: {
      packageId: fixture.packageId,
      reason:
        "Generate governed Intake output for the completed Sprint 6C synthetic end-to-end validation fixture.",
    },
  });

  const exported = await pool.query<{ payload: Record<string, unknown> }>(
    `SELECT payload
     FROM intake_input_exports
     WHERE tenant_id = $1 AND id = $2
     LIMIT 1`,
    [input.principal.tenantId, intake.exportId],
  );
  const intakePayload = exported.rows[0]?.payload || {};
  const reviewAssessment = isRecord(intakePayload.review_assessment)
    ? intakePayload.review_assessment
    : {};
  const productContext = isRecord(intakePayload.product_context)
    ? intakePayload.product_context
    : {};
  assertTrue(
    productContext.validationFixture === true,
    "Sprint 6C Intake lost validationFixture provenance.",
  );
  assertTrue(
    text(reviewAssessment.medical_review_status) === "APPROVED",
    "Sprint 6C Intake does not carry approved Medical Review lineage.",
  );
  const patientSegments = Array.isArray(reviewAssessment.patient_segments)
    ? reviewAssessment.patient_segments
    : [];
  assertTrue(
    patientSegments.length === 1,
    "Sprint 6C Intake does not contain the confirmed single patient segment.",
  );
  checkpoints.push({
    checkpoint: "INTAKE_GENERATION_AND_LINEAGE",
    status: "PASSED",
    details: {
      intakeExportId: intake.exportId,
      exportVersion: intake.exportVersion,
      intakeSha256: intake.sha256,
      patientSegmentCount: patientSegments.length,
      medicalReviewStatus: reviewAssessment.medical_review_status,
      validationFixture: productContext.validationFixture,
    },
  });

  const reportCore = {
    schemaVersion: "clinixai.validation.sprint6c.v1",
    generatedAt: new Date().toISOString(),
    fixture: {
      packageId: fixture.packageId,
      packageKey: fixture.packageKey,
      searchId: fixture.searchId,
      validationPackageId: fixture.validationPackageId,
    },
    checkpoints,
    intake: {
      exportId: intake.exportId,
      exportVersion: intake.exportVersion,
      sha256: intake.sha256,
    },
    automationDisclosure: {
      syntheticValidationOnly: true,
      automatedReviewerSimulation: true,
      productionHumanGatesUnchanged: true,
    },
  };
  const reportContent = JSON.stringify(reportCore);
  const reportSha = sha256(reportContent);

  await pool.query(
    `INSERT INTO evidence_artifacts (
       tenant_id, package_id, artifact_type, storage_backend, storage_key,
       media_type, sha256, size_bytes, metadata
     ) VALUES ($1,$2,'SPRINT_6C_VALIDATION_REPORT_JSON','postgresql',$3,
       'application/json',$4,$5,$6::jsonb)`,
    [
      input.principal.tenantId,
      fixture.packageId,
      `validation/sprint6c/${fixture.packageId}/report.json`,
      reportSha,
      Buffer.byteLength(reportContent, "utf8"),
      JSON.stringify(reportCore),
    ],
  );

  await pool.query(
    `INSERT INTO audit_events (
       tenant_id, package_id, actor_id, event_type, event_category, outcome, details
     ) VALUES ($1,$2,$3,'SPRINT_6C_AUTONOMOUS_VALIDATION_PASSED',
       'LITERATURE_VALIDATION','success',$4::jsonb)`,
    [
      input.principal.tenantId,
      fixture.packageId,
      input.principal.userId,
      JSON.stringify({
        ...reportCore,
        validationReportArtifactSha256: reportSha,
        reason: AUTOMATION_REASON,
      }),
    ],
  );

  return {
    status: "PASSED",
    ...reportCore,
    validationReportArtifactSha256: reportSha,
  };
}
