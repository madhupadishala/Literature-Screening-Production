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

  companySuspectAssessments: CompanySuspectAssessment[];

  recommendedNextStep: HitsRecommendedNextStep;

  qcRequired: boolean;

  duplicateSuspected: boolean;

  workflowStage: "HITS_COMPLETED";
}

const fallbackResult: HitsAIResult = {
  isHit: false,

  confidence: 0,

  classification:
    "needs_manual_review",

  reasons: [
    "Unable to parse AI response.",
  ],

  detectedProducts: [],

  detectedEvents: [],

  detectedSpecialSituations: [],

  extractedSuspectEvidence: [],

  companySuspectAssessments: [],

  recommendedNextStep:
    "manual_review",

  qcRequired: true,

  duplicateSuspected: false,

  workflowStage:
    "HITS_COMPLETED",
};

function normalizeConfidence(
  value: unknown,
): number {
  if (
    typeof value !== "number" ||
    Number.isNaN(value)
  ) {
    return 0;
  }

  if (value > 1) {
    return Math.min(value / 100, 1);
  }

  return Math.max(
    0,
    Math.min(value, 1),
  );
}

function normalizeStringArray(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is string =>
      typeof item === "string",
  );
}

export function normalizeSuspectEvidence(value: unknown): SuspectProductEvidence[] {
  if (!Array.isArray(value)) return [];
  const roles: PresentationQualifierRole[] = [
    "PRODUCT_PRESENTATION",
    "ADMINISTRATION_CIRCUMSTANCE",
    "NOT_REPORTED",
    "UNCLEAR",
  ];
  const productRoles: ReportedProductRole[] = ["SUSPECT", "CONCOMITANT", "TREATMENT", "EXPOSURE", "PRODUCT_MENTION", "UNRESOLVED"];
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
      countryOfInterest: optional("countryOfInterest"),
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

function normalizeClassification(
  value: unknown,
): HitsClassification {
  switch (value) {
    case "hit":
    case "no_hit":
    case "needs_manual_review":
      return value;

    default:
      return "needs_manual_review";
  }
}

function normalizeNextStep(
  value: unknown,
): HitsRecommendedNextStep {
  switch (value) {
    case "send_to_screening":
    case "reject":
    case "manual_review":
      return value;

    default:
      return "manual_review";
  }
}

export function parseHitsAIResult(
  rawResponse: string,
): HitsAIResult {
  try {
    const parsed =
      JSON.parse(rawResponse) as Partial<HitsAIResult>;

    const confidence =
      normalizeConfidence(
        parsed.confidence,
      );

    return {
      isHit:
        Boolean(parsed.isHit),

      confidence,

      classification:
        normalizeClassification(
          parsed.classification,
        ),

      reasons:
        normalizeStringArray(
          parsed.reasons,
        ),

      detectedProducts:
        normalizeStringArray(
          parsed.detectedProducts,
        ),

      detectedEvents:
        normalizeStringArray(
          parsed.detectedEvents,
        ),

      detectedSpecialSituations:
        normalizeStringArray(
          parsed.detectedSpecialSituations,
        ),

      extractedSuspectEvidence:
        normalizeSuspectEvidence(
          parsed.extractedSuspectEvidence,
        ),

      companySuspectAssessments: [],

      recommendedNextStep:
        normalizeNextStep(
          parsed.recommendedNextStep,
        ),

      qcRequired:
        confidence < 0.80,

      duplicateSuspected:
        Boolean(
          parsed.duplicateSuspected,
        ),

      workflowStage:
        "HITS_COMPLETED",
    };
  } catch {
    return fallbackResult;
  }
}
import type {
  CompanySuspectAssessment,
  PresentationQualifierRole,
  ReportedProductRole,
  SuspectProductEvidence,
} from "@/lib/pharmaceutical-intelligence/types";
