export const SIGNAL_SOURCE_TYPES = [
  "SPONTANEOUS_CASES",
  "LITERATURE",
  "CLINICAL",
  "REGULATORY",
  "AGGREGATE",
  "OTHER",
] as const;

export const SIGNAL_STATUSES = [
  "DETECTED",
  "VALIDATED",
  "UNDER_EVALUATION",
  "CONFIRMED",
  "REFUTED",
  "CLOSED",
] as const;

export type SignalStatus = (typeof SIGNAL_STATUSES)[number];
export type SignalSourceType = (typeof SIGNAL_SOURCE_TYPES)[number];

export interface CreateSignalRequest {
  signalKey: string;
  productKey: string;
  eventTerm: string;
  sourceType: SignalSourceType;
  sourceReference?: string;
  detectionMethod: string;
  detectionSnapshot?: Record<string, unknown>;
  priority?: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  detectedAt: string;
  reason: string;
}

export interface RecordSignalAssessmentRequest {
  assessmentType:
    | "VALIDATION"
    | "PRIORITIZATION"
    | "EVALUATION"
    | "RECOMMENDATION"
    | "CLOSURE";
  outcome: string;
  rationale: string;
  evidence?: Record<string, unknown>;
  nextStatus?: Exclude<SignalStatus, "DETECTED">;
}
