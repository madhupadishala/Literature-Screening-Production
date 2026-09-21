import { canonicalSha256 } from "./canonical-json";
import type {
  IntakeDraft,
  ProductRole,
  SafetyEventDraft,
  SafetyPatientDraft,
  SafetyProductDraft,
} from "./safety-types";
import { validateIntakeDraft } from "./safety-validation";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function safeKey(value: string, fallback: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function patientDrafts(reviewAssessment: Record<string, unknown>): SafetyPatientDraft[] {
  const segments = array(reviewAssessment.patient_segments);
  return segments.map((segmentValue, index) => {
    const segment = record(segmentValue);
    const key =
      text(segment.patientSegmentKey) ||
      text(segment.patient_segment_key) ||
      text(segment.segmentKey) ||
      `patient-${index + 1}`;

    return {
      patientKey: safeKey(key, `patient-${index + 1}`),
      patientReference: text(segment.patientReference) || text(segment.patient_reference),
      sex: text(segment.sex)?.toUpperCase() as SafetyPatientDraft["sex"],
      ageValue:
        typeof segment.age === "number"
          ? segment.age
          : typeof segment.ageValue === "number"
            ? segment.ageValue
            : undefined,
      ageUnit: text(segment.ageUnit) || text(segment.age_unit),
      ageGroup: text(segment.ageGroup) || text(segment.age_group),
      medicalHistory: array(segment.medicalHistory || segment.medical_history),
      e2bD: segment,
    };
  });
}

function productRole(value: unknown): ProductRole {
  const role = text(value)?.toUpperCase();
  if (role === "SUSPECT" || role === "INTERACTING" || role === "CONCOMITANT") return role;
  return "UNSPECIFIED";
}

function productDrafts(screeningAssessment: Record<string, unknown>): SafetyProductDraft[] {
  const result = record(screeningAssessment.result);
  const screening = record(result.result);
  const assessments = array(screening.companySuspectAssessments);

  return assessments
    .map((value, index) => {
      const assessment = record(value);
      const name = text(assessment.reportedProduct);
      if (!name) return null;

      return {
        productKey: `product-${index + 1}`,
        reportedName: name,
        roleCharacterization: productRole(assessment.role || assessment.characterization),
        e2bG: assessment,
      } satisfies SafetyProductDraft;
    })
    .filter((value): value is SafetyProductDraft => Boolean(value));
}

function eventDrafts(screeningAssessment: Record<string, unknown>): SafetyEventDraft[] {
  const result = record(screeningAssessment.result);
  const screening = record(result.result);
  const regulatoryEvidence = record(screening.regulatoryEvidence);
  const clinicalEvents = array(regulatoryEvidence.clinicalEvents);
  const eventNames =
    clinicalEvents.length > 0
      ? clinicalEvents.map((value) => text(record(value).event)).filter(Boolean)
      : array(screening.detectedEvents).map(text).filter(Boolean);

  return eventNames.map((event, index) => ({
    eventKey: `event-${index + 1}`,
    reportedTerm: event!,
    e2bE: {
      source: "LITERATURE_SCREENING",
      reportedTerm: event,
    },
  }));
}

export interface LiteratureIntakeAdapterInput {
  exportId: string;
  exportVersion: number;
  exportSha256: string;
  generatedAt: string;
  payload: Record<string, unknown>;
}

export function literatureIntakeToSafetyDraft(
  input: LiteratureIntakeAdapterInput,
): IntakeDraft {
  const payload = input.payload;
  const packageRecord = record(payload.package);
  const article = record(payload.article);
  const reviewAssessment = record(payload.review_assessment);
  const screeningAssessment = record(payload.screening_assessment);
  const governance = record(payload.governance);
  const sourceLineage = record(governance.source_lineage);

  const packageId = text(packageRecord.package_id) || input.exportId;
  const packageKey = text(packageRecord.package_key) || packageId;
  const externalReference =
    text(packageRecord.external_reference) ||
    text(article.pmid) ||
    text(article.doi) ||
    packageKey;

  const lineage = {
    sourceSystem: "CLINIXAI_LITERATURE_INTELLIGENCE",
    sourceRecordType: "INTAKE_INPUT_EXPORT",
    sourceRecordId: input.exportId,
    sourceVersion: input.exportVersion,
    sourceSha256: input.exportSha256,
    parentRecords: [
      {
        type: "LITERATURE_PACKAGE",
        id: packageId,
      },
      ...(text(sourceLineage.screening_result_id)
        ? [{
            type: "SCREENING_RESULT",
            id: text(sourceLineage.screening_result_id)!,
            version:
              typeof sourceLineage.screening_result_version === "number"
                ? sourceLineage.screening_result_version
                : undefined,
          }]
        : []),
      ...(text(sourceLineage.review_workspace_id)
        ? [{
            type: "REVIEW_WORKSPACE",
            id: text(sourceLineage.review_workspace_id)!,
          }]
        : []),
    ],
  };

  const draft: IntakeDraft = {
    source: {
      sourceKey: `literature:${packageId}`,
      sourceType: "LITERATURE",
      sourceSystem: "CLINIXAI_LITERATURE_INTELLIGENCE",
      externalReference,
      receivedAt: input.generatedAt,
      sourcePayload: payload,
      sourceSha256: input.exportSha256,
    },
    intake: {
      intakeKey: `LIT-${safeKey(packageKey, packageId)}`,
      sourceRecordKey: input.exportId,
      intakeChannel: "LITERATURE_HANDOFF",
      status: "RECEIVED",
      payload: {
        article,
        productContext: record(payload.product_context),
        screeningAssessment,
        reviewAssessment,
        duplicateIntelligence: payload.duplicate_intelligence ?? [],
      },
      lineage,
      lineageSha256: canonicalSha256(lineage),
    },
    patients: patientDrafts(reviewAssessment),
    reporters: [],
    products: productDrafts(screeningAssessment),
    events: eventDrafts(screeningAssessment),
    tests: [],
  };

  return validateIntakeDraft(draft);
}
