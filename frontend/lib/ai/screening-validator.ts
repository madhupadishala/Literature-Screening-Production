export type ScreeningClassification =
  | "valid_case"
  | "invalid_case"
  | "special_situation_only"
  | "needs_manual_review";

export type ScreeningRecommendedNextStep =
  | "send_to_intake"
  | "reject"
  | "manual_review";

export interface ScreeningAIResult {
  validity: {
    isValidCase: boolean;
    hasIdentifiablePatient: boolean;
    hasIdentifiableReporter: boolean;
    hasCompanySuspectProduct: boolean;
    hasAdverseEvent: boolean;
    reasoning: string[];
  };
  patient: {
    identifiers: string[];
    age?: string;
    sex?: string;
    country?: string;
  };
  reporter: {
    primaryReporter?: string;
    reporterType?: string;
    country?: string;
  };
  products: {
    companySuspects: string[];
    coSuspects: string[];
    concomitants: string[];
    treatmentProducts: string[];
  };
  events: {
    adverseEvents: string[];
    seriousnessCriteria: string[];
    isSerious: boolean;
  };
  specialSituations: string[];
  countryOfInterest: {
    country?: string;
    isCOI: boolean;
    reasoning?: string;
  };
  classification: ScreeningClassification;
  confidence: number;
  reviewerNotes: string[];
  recommendedNextStep: ScreeningRecommendedNextStep;
}

const fallbackScreeningResult: ScreeningAIResult = {
  validity: {
    isValidCase: false,
    hasIdentifiablePatient: false,
    hasIdentifiableReporter: false,
    hasCompanySuspectProduct: false,
    hasAdverseEvent: false,
    reasoning: ["Unable to parse screening AI response. Manual review required."],
  },
  patient: {
    identifiers: [],
  },
  reporter: {},
  products: {
    companySuspects: [],
    coSuspects: [],
    concomitants: [],
    treatmentProducts: [],
  },
  events: {
    adverseEvents: [],
    seriousnessCriteria: [],
    isSerious: false,
  },
  specialSituations: [],
  countryOfInterest: {
    isCOI: false,
  },
  classification: "needs_manual_review",
  confidence: 0,
  reviewerNotes: ["Fallback result generated due to invalid AI output."],
  recommendedNextStep: "manual_review",
};

function normalizeBoolean(value: unknown): boolean {
  return value === true;
}

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

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function normalizeClassification(value: unknown): ScreeningClassification {
  if (
    value === "valid_case" ||
    value === "invalid_case" ||
    value === "special_situation_only" ||
    value === "needs_manual_review"
  ) {
    return value;
  }

  return "needs_manual_review";
}

function normalizeNextStep(value: unknown): ScreeningRecommendedNextStep {
  if (
    value === "send_to_intake" ||
    value === "reject" ||
    value === "manual_review"
  ) {
    return value;
  }

  return "manual_review";
}

export function validateScreeningAIResult(rawResponse: string): ScreeningAIResult {
  try {
    const parsed = JSON.parse(rawResponse) as Partial<ScreeningAIResult>;

    return {
      validity: {
        isValidCase: normalizeBoolean(parsed.validity?.isValidCase),
        hasIdentifiablePatient: normalizeBoolean(
          parsed.validity?.hasIdentifiablePatient,
        ),
        hasIdentifiableReporter: normalizeBoolean(
          parsed.validity?.hasIdentifiableReporter,
        ),
        hasCompanySuspectProduct: normalizeBoolean(
          parsed.validity?.hasCompanySuspectProduct,
        ),
        hasAdverseEvent: normalizeBoolean(parsed.validity?.hasAdverseEvent),
        reasoning: normalizeStringArray(parsed.validity?.reasoning),
      },
      patient: {
        identifiers: normalizeStringArray(parsed.patient?.identifiers),
        age: normalizeOptionalString(parsed.patient?.age),
        sex: normalizeOptionalString(parsed.patient?.sex),
        country: normalizeOptionalString(parsed.patient?.country),
      },
      reporter: {
        primaryReporter: normalizeOptionalString(
          parsed.reporter?.primaryReporter,
        ),
        reporterType: normalizeOptionalString(parsed.reporter?.reporterType),
        country: normalizeOptionalString(parsed.reporter?.country),
      },
      products: {
        companySuspects: normalizeStringArray(parsed.products?.companySuspects),
        coSuspects: normalizeStringArray(parsed.products?.coSuspects),
        concomitants: normalizeStringArray(parsed.products?.concomitants),
        treatmentProducts: normalizeStringArray(
          parsed.products?.treatmentProducts,
        ),
      },
      events: {
        adverseEvents: normalizeStringArray(parsed.events?.adverseEvents),
        seriousnessCriteria: normalizeStringArray(
          parsed.events?.seriousnessCriteria,
        ),
        isSerious: normalizeBoolean(parsed.events?.isSerious),
      },
      specialSituations: normalizeStringArray(parsed.specialSituations),
      countryOfInterest: {
        country: normalizeOptionalString(parsed.countryOfInterest?.country),
        isCOI: normalizeBoolean(parsed.countryOfInterest?.isCOI),
        reasoning: normalizeOptionalString(parsed.countryOfInterest?.reasoning),
      },
      classification: normalizeClassification(parsed.classification),
      confidence: normalizeConfidence(parsed.confidence),
      reviewerNotes: normalizeStringArray(parsed.reviewerNotes),
      recommendedNextStep: normalizeNextStep(parsed.recommendedNextStep),
    };
  } catch {
    return fallbackScreeningResult;
  }
}