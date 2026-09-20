import type {
  CompanySuspectAssessment,
  PresentationQualifierRole,
  ReportedProductRole,
  SuspectProductEvidence,
} from "@/lib/pharmaceutical-intelligence/types";
import type {
  EvidenceStatus,
  IcsrCriteriaAssessment,
  PatientSafetyAssessment,
  PopulationType,
  SafetyEvidenceExtraction,
} from "@/lib/pv-decision-intelligence/types";

export type HitsClassification =
  | "hit"
  | "no_hit"
  | "needs_manual_review";

export type HitsRecommendedNextStep =
  | "send_to_screening"
  | "reject"
  | "manual_review";

export interface HitsAIResult {
  isHit: boolean;
  confidence: number;
  classification: HitsClassification;
  reasons: string[];
  detectedProducts: string[];
  detectedEvents: string[];
  detectedSpecialSituations: string[];
  extractedSuspectEvidence: SuspectProductEvidence[];
  safetyEvidence: SafetyEvidenceExtraction;
  patientSafetyAssessment: PatientSafetyAssessment;
  icsrAssessment: IcsrCriteriaAssessment;
  companySuspectAssessments: CompanySuspectAssessment[];
  recommendedNextStep: HitsRecommendedNextStep;
  qcRequired: boolean;
  duplicateSuspected: boolean;
  workflowStage: "HITS_COMPLETED";
}

const unresolvedSafetyEvidence: SafetyEvidenceExtraction = {
  populationType: "UNRESOLVED",
  patientIdentifiable: "UNRESOLVED",
  reporterIdentifiable: "UNRESOLVED",
  medicinalProductExposure: "UNRESOLVED",
  adverseEventOrReaction: "UNRESOLVED",
  specialSituation: "UNRESOLVED",
};

const unresolvedPatientSafety: PatientSafetyAssessment = {
  relevance: "UNRESOLVED",
  humanSafetyInformation: null,
  populationType: "UNRESOLVED",
  medicinalProductExposure: "UNRESOLVED",
  adverseEventOrReaction: "UNRESOLVED",
  specialSituation: "UNRESOLVED",
  manualReviewRequired: true,
  reasons: ["Patient-safety evidence has not yet been deterministically assessed."],
  evidence: {},
  appliedKnowledgeObjectIds: ["VAL-005"],
};

const unresolvedIcsr: IcsrCriteriaAssessment = {
  identifiablePatient: "UNRESOLVED",
  identifiableReporter: "UNRESOLVED",
  suspectProduct: "UNRESOLVED",
  adverseEventOrSpecialSituation: "UNRESOLVED",
  minimumCriteriaSatisfied: null,
  conclusion: "UNRESOLVED",
  manualReviewRequired: true,
  missingOrUnresolvedCriteria: [
    "identifiablePatient",
    "identifiableReporter",
    "suspectProduct",
    "adverseEventOrSpecialSituation",
  ],
  reasons: ["Generic minimum ICSR criteria have not yet been deterministically assessed."],
  evidence: {},
  appliedKnowledgeObjectIds: ["VAL-002", "VAL-003", "VAL-005"],
};

const fallbackResult: HitsAIResult = {
  isHit: false,
  confidence: 0,
  classification: "needs_manual_review",
  reasons: ["Unable to parse AI response."],
  detectedProducts: [],
  detectedEvents: [],
  detectedSpecialSituations: [],
  extractedSuspectEvidence: [],
  safetyEvidence: unresolvedSafetyEvidence,
  patientSafetyAssessment: unresolvedPatientSafety,
  icsrAssessment: unresolvedIcsr,
  companySuspectAssessments: [],
  recommendedNextStep: "manual_review",
  qcRequired: true,
  duplicateSuspected: false,
  workflowStage: "HITS_COMPLETED",
};

function normalizeConfidence(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  if (value > 1) {
    return Math.min(value / 100, 1);
  }

  return Math.max(0, Math.min(value, 1));
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is string =>
      typeof item === "string",
  );
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalEvidenceValue(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = optionalString(record, key);
  if (!value) return undefined;
  const sentinel = value.toUpperCase().replace(/[\s-]+/g, "_");
  if (["UNRESOLVED", "UNKNOWN", "NOT_AVAILABLE", "N/A", "NA"].includes(sentinel)) {
    return undefined;
  }
  return value;
}

function evidenceStatus(value: unknown): EvidenceStatus {
  return ["PRESENT", "ABSENT", "UNRESOLVED", "CONFLICTING"].includes(String(value))
    ? (value as EvidenceStatus)
    : "UNRESOLVED";
}

function populationType(value: unknown): PopulationType {
  return ["HUMAN", "ANIMAL", "MIXED", "UNRESOLVED"].includes(String(value))
    ? (value as PopulationType)
    : "UNRESOLVED";
}

export function normalizeSafetyEvidence(value: unknown): SafetyEvidenceExtraction {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...unresolvedSafetyEvidence };
  }
  const record = value as Record<string, unknown>;
  return {
    populationType: populationType(record.populationType),
    patientIdentifiable: evidenceStatus(record.patientIdentifiable),
    reporterIdentifiable: evidenceStatus(record.reporterIdentifiable),
    medicinalProductExposure: evidenceStatus(record.medicinalProductExposure),
    adverseEventOrReaction: evidenceStatus(record.adverseEventOrReaction),
    specialSituation: evidenceStatus(record.specialSituation),
    patientEvidence: optionalString(record, "patientEvidence"),
    reporterEvidence: optionalString(record, "reporterEvidence"),
    productEvidence: optionalString(record, "productEvidence"),
    eventEvidence: optionalString(record, "eventEvidence"),
    specialSituationEvidence: optionalString(record, "specialSituationEvidence"),
  };
}

export function normalizeSuspectEvidence(value: unknown): SuspectProductEvidence[] {
  if (!Array.isArray(value)) return [];
  const roles: PresentationQualifierRole[] = [
    "PRODUCT_PRESENTATION",
    "ADMINISTRATION_CIRCUMSTANCE",
    "NOT_REPORTED",
    "UNCLEAR",
  ];
  const productRoles: ReportedProductRole[] = [
    "SUSPECT",
    "CONCOMITANT",
    "TREATMENT",
    "EXPOSURE",
    "PRODUCT_MENTION",
    "UNRESOLVED",
  ];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const reportedProduct = typeof record.reportedProduct === "string"
      ? record.reportedProduct.trim()
      : "";
    if (!reportedProduct) return [];

    const optional = (key: string) =>
      typeof record[key] === "string" && String(record[key]).trim()
        ? String(record[key]).trim()
        : undefined;
    const role = roles.includes(record.presentationQualifierRole as PresentationQualifierRole)
      ? (record.presentationQualifierRole as PresentationQualifierRole)
      : "UNCLEAR";
    const productRole = productRoles.includes(record.role as ReportedProductRole)
      ? (record.role as ReportedProductRole)
      : "UNRESOLVED";
    const stringList = (key: string) => Array.isArray(record[key])
      ? (record[key] as unknown[]).filter((entry): entry is string => typeof entry === "string")
      : undefined;

    return [{
      reportedProduct,
      reportedChemicalName: optional("reportedChemicalName"),
      reportedComposition: optional("reportedComposition"),
      reportedDosageForm: optional("reportedDosageForm"),
      reportedFormulation: optional("reportedFormulation"),
      reportedAdministrationRoute: optional("reportedAdministrationRoute"),
      presentationQualifierRole: role,
      countryOfInterest: optionalEvidenceValue(record, "countryOfInterest"),
      relevantDate: optional("relevantDate"),
      sourceEvidence: optional("sourceEvidence"),
      role: productRole,
      roleEvidence: optional("roleEvidence"),
      evidenceLocation: optional("evidenceLocation") as SuspectProductEvidence["evidenceLocation"],
      components: stringList("components"),
      conflictingEvidence: stringList("conflictingEvidence"),
    }];
  });
}

function normalizeClassification(value: unknown): HitsClassification {
  switch (value) {
    case "hit":
    case "no_hit":
    case "needs_manual_review":
      return value;
    default:
      return "needs_manual_review";
  }
}

function normalizeNextStep(value: unknown): HitsRecommendedNextStep {
  switch (value) {
    case "send_to_screening":
    case "reject":
    case "manual_review":
      return value;
    default:
      return "manual_review";
  }
}

export function parseHitsAIResult(rawResponse: string): HitsAIResult {
  try {
    const parsed = JSON.parse(rawResponse) as Partial<HitsAIResult>;
    const confidence = normalizeConfidence(parsed.confidence);

    return {
      isHit: Boolean(parsed.isHit),
      confidence,
      classification: normalizeClassification(parsed.classification),
      reasons: normalizeStringArray(parsed.reasons),
      detectedProducts: normalizeStringArray(parsed.detectedProducts),
      detectedEvents: normalizeStringArray(parsed.detectedEvents),
      detectedSpecialSituations: normalizeStringArray(parsed.detectedSpecialSituations),
      extractedSuspectEvidence: normalizeSuspectEvidence(parsed.extractedSuspectEvidence),
      safetyEvidence: normalizeSafetyEvidence(parsed.safetyEvidence),
      patientSafetyAssessment: unresolvedPatientSafety,
      icsrAssessment: unresolvedIcsr,
      companySuspectAssessments: [],
      recommendedNextStep: normalizeNextStep(parsed.recommendedNextStep),
      qcRequired: confidence < 0.80,
      duplicateSuspected: Boolean(parsed.duplicateSuspected),
      workflowStage: "HITS_COMPLETED",
    };
  } catch {
    return fallbackResult;
  }
}
