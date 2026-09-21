import type {
  SafetyEventDraft,
  SafetyPatientDraft,
  SafetyProductDraft,
  SafetyReporterDraft,
  SafetySourceType,
  SafetyTestDraft,
} from "../common/safety-types";

export interface StructuredIntakeSubmission {
  idempotencyKey: string;
  sourceType: SafetySourceType;
  sourceSystem: string;
  intakeChannel: "MANUAL" | "API";
  receivedAt: string;
  externalReference?: string;
  countryCode?: string;
  languageCode?: string;
  initialReceiptDate?: string;
  latestReceiptDate?: string;
  sourcePayload?: Record<string, unknown>;
  intakePayload?: Record<string, unknown>;
  patients?: SafetyPatientDraft[];
  reporters?: SafetyReporterDraft[];
  products?: SafetyProductDraft[];
  events?: SafetyEventDraft[];
  tests?: SafetyTestDraft[];
}

export interface ManualIntakeSubmission
  extends Omit<StructuredIntakeSubmission, "sourceSystem" | "intakeChannel"> {
  sourceSystem?: "NEXUS_MANUAL";
}

export interface ApiIntakeSubmission
  extends Omit<StructuredIntakeSubmission, "intakeChannel"> {}

export interface DocumentIntakeSubmission {
  requestId: string;
  sourceType: SafetySourceType;
  receivedAt: string;
  fileName: string;
  contentType:
    | "application/pdf"
    | "application/msword"
    | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    | "text/plain";
  contentBase64: string;
  externalReference?: string;
  countryCode?: string;
  languageCode?: string;
  initialReceiptDate?: string;
  latestReceiptDate?: string;
  metadata?: Record<string, string>;
}
