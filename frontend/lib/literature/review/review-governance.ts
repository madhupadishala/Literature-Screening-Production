import type {
  CausalityAssessmentInput,
  LabelAssessmentInput,
  MedicalReviewDecision,
  PatientSegment,
} from "./review-types";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function assertConfirmedPatientSegmentation(
  segments: PatientSegment[],
): void {
  if (
    segments.some(
      (segment) =>
        segment.relationships.length === 0 ||
        segment.relationships.some(
          (relationship) =>
            !text(relationship.product) ||
            !text(relationship.event) ||
            !text(relationship.evidence),
        ),
    )
  ) {
    throw new Error(
      "Each confirmed patient segment requires at least one evidence-supported product-event relationship.",
    );
  }
}

export function assertExpectednessAssessment(
  assessment: LabelAssessmentInput,
): void {
  if (!["EXPECTED", "UNEXPECTED", "UNRESOLVED"].includes(assessment.conclusion)) {
    throw new Error("Expectedness must be EXPECTED, UNEXPECTED, or UNRESOLVED.");
  }
  if (
    assessment.conclusion !== "UNRESOLVED" &&
    (!text(assessment.referenceLabelKey) ||
      !text(assessment.referenceLabelVersion) ||
      !text(assessment.referenceEffectiveDate))
  ) {
    throw new Error(
      "EXPECTED or UNEXPECTED requires the controlled Label / RSI key, version and effective date.",
    );
  }
}

export function assertCausalityAssessment(
  assessment: CausalityAssessmentInput,
): void {
  const conclusion = text(assessment.conclusion).toUpperCase();
  if (!conclusion) {
    throw new Error("Causality conclusion is required.");
  }
  if (
    conclusion !== "UNRESOLVED" &&
    (!text(assessment.methodKey) || !text(assessment.methodVersion))
  ) {
    throw new Error(
      "A causality conclusion requires the approved method key and method version. Use UNRESOLVED when no controlled method is configured.",
    );
  }
}

export function assertMedicalReviewGate(input: {
  decision: MedicalReviewDecision;
  patientSegmentationStatus: string;
  patientCount: number;
  governedPairCount: number;
  labelingStatus: string;
  causalityStatus: string;
  unresolvedAcknowledged: boolean;
}): void {
  if (input.decision !== "APPROVE_FOR_INTAKE") return;

  if (
    input.patientSegmentationStatus !== "COMPLETE" ||
    input.patientCount <= 0 ||
    input.governedPairCount <= 0
  ) {
    throw new Error(
      "Medical Review approval requires confirmed patient segmentation with at least one governed product-event relationship.",
    );
  }
  if (!["COMPLETE", "UNRESOLVED"].includes(input.labelingStatus)) {
    throw new Error(
      "Complete the labeling / expectedness assessment before Medical Review approval.",
    );
  }
  if (!["COMPLETE", "UNRESOLVED"].includes(input.causalityStatus)) {
    throw new Error(
      "Complete the causality assessment before Medical Review approval.",
    );
  }
  if (
    (input.labelingStatus === "UNRESOLVED" ||
      input.causalityStatus === "UNRESOLVED") &&
    !input.unresolvedAcknowledged
  ) {
    throw new Error(
      "Medical Reviewer acknowledgement is required when expectedness or causality remains unresolved.",
    );
  }
}
