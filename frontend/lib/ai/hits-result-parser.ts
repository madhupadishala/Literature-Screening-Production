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