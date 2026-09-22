import type {
  SafetyEventDraft,
  SafetyPatientDraft,
  SafetyProductDraft,
  SafetyReporterDraft,
  SafetyTestDraft,
} from "@/lib/safety/common/safety-types";

export interface CaseIdentificationDraft {
  caseKey: string;
  reportType?: string;
  studyType?: string;
  countryCode?: string;
  initialReceiptDate: string;
  latestReceiptDate: string;
  seriousnessStatus: "SERIOUS" | "NON_SERIOUS" | "UNRESOLVED";
  expeditedReportingRequired?: boolean | null;
}

export interface CaseDraftPayload {
  identification: CaseIdentificationDraft;
  reporters: SafetyReporterDraft[];
  patient: SafetyPatientDraft;
  events: SafetyEventDraft[];
  tests: SafetyTestDraft[];
  products: SafetyProductDraft[];
  medicalHistory: unknown[];
  additionalInformation: Record<string, unknown>;
}

export const CASE_ASSESSMENT_TYPES = [
  "CAUSALITY",
  "REPORTER_CAUSALITY",
  "COMPANY_CAUSALITY",
  "EXPECTEDNESS",
  "LISTEDNESS",
  "SERIOUSNESS_SUPPORT",
] as const;

export type CaseAssessmentType =
  (typeof CASE_ASSESSMENT_TYPES)[number];

export const CASE_NARRATIVE_STAGES = [
  "SOURCE_FACTS",
  "SYSTEM_DRAFT",
  "PROCESSOR",
  "QC",
  "MEDICAL_REVIEW",
  "FINAL",
] as const;

export type CaseNarrativeStage =
  (typeof CASE_NARRATIVE_STAGES)[number];

export interface CaseAssistSuggestion {
  suggestionType:
    | "MISSING_INFORMATION"
    | "SERIOUSNESS_SUPPORT"
    | "CAUSALITY_SUPPORT"
    | "EXPECTEDNESS_SUPPORT"
    | "CODING_REVIEW"
    | "NARRATIVE_DRAFT";
  payload: Record<string, unknown>;
  confidence: number;
  evidence: Record<string, unknown>;
}
