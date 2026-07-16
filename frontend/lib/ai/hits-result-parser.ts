export type HitsClassification = "hit" | "no_hit" | "needs_manual_review";

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
}

const fallbackResult: HitsAIResult = {
  isHit: false,
  confidence: 0,
  classification: "needs_manual_review",
  reasons: ["Unable to parse AI response. Manual review required."],
  detectedProducts: [],
  detectedEvents: [],
  detectedSpecialSituations: [],
  recommendedNextStep: "manual_review",
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

  return value.filter((item): item is string => typeof item === "string");
}

function normalizeClassification(value: unknown): HitsClassification {
  if (value === "hit" || value === "no_hit" || value === "needs_manual_review") {
    return value;
  }

  return "needs_manual_review";
}

function normalizeNextStep(value: unknown): HitsRecommendedNextStep {
  if (
    value === "send_to_screening" ||
    value === "reject" ||
    value === "manual_review"
  ) {
    return value;
  }

  return "manual_review";
}

export function parseHitsAIResult(rawResponse: string): HitsAIResult {
  try {
    const parsed = JSON.parse(rawResponse) as Partial<HitsAIResult>;

    return {
      isHit: Boolean(parsed.isHit),
      confidence: normalizeConfidence(parsed.confidence),
      classification: normalizeClassification(parsed.classification),
      reasons: normalizeStringArray(parsed.reasons),
      detectedProducts: normalizeStringArray(parsed.detectedProducts),
      detectedEvents: normalizeStringArray(parsed.detectedEvents),
      detectedSpecialSituations: normalizeStringArray(
        parsed.detectedSpecialSituations,
      ),
      recommendedNextStep: normalizeNextStep(parsed.recommendedNextStep),
    };
  } catch {
    return fallbackResult;
  }
}