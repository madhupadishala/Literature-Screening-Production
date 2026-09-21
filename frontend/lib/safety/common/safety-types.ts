export const SAFETY_BACKBONE_SCHEMA_VERSION = "clinixai.nexus.safety.v1";
export const E2B_PROFILE = "ICH_E2B_R3";

export const E2B_R3_SECTIONS = {
  CASE_IDENTIFICATION_AND_SOURCE: "C",
  PATIENT: "D",
  REACTIONS_EVENTS: "E",
  TESTS_PROCEDURES: "F",
  DRUGS: "G",
  NARRATIVE_AND_FURTHER_INFORMATION: "H",
} as const;

export type SafetySourceType =
  | "LITERATURE"
  | "SPONTANEOUS"
  | "SOLICITED"
  | "CLINICAL_TRIAL"
  | "REGISTRY"
  | "PARTNER"
  | "REGULATORY_AUTHORITY"
  | "DIGITAL"
  | "OTHER";

export type IntakeStatus =
  | "RECEIVED"
  | "IN_TRIAGE"
  | "VALIDITY_REVIEW"
  | "DUPLICATE_REVIEW"
  | "READY_FOR_CASE"
  | "CASE_CREATED"
  | "NO_CASE"
  | "REJECTED";

export type SafetyCaseStatus =
  | "OPEN"
  | "IN_PROCESS"
  | "QC_REVIEW"
  | "MEDICAL_REVIEW"
  | "FINALIZED"
  | "SUBMITTED"
  | "CLOSED"
  | "VOID";

export type ProductRole =
  | "SUSPECT"
  | "INTERACTING"
  | "CONCOMITANT"
  | "DRUG_NOT_ADMINISTERED"
  | "UNSPECIFIED";

export interface SourceLineage {
  sourceSystem: string;
  sourceRecordType: string;
  sourceRecordId: string;
  sourceVersion?: number;
  sourceSha256?: string;
  parentRecords?: Array<{
    type: string;
    id: string;
    version?: number;
    sha256?: string;
  }>;
}

export interface SafetyPatientDraft {
  patientKey: string;
  patientReference?: string;
  sex?: "MALE" | "FEMALE" | "UNKNOWN" | "NOT_SPECIFIED";
  ageValue?: number;
  ageUnit?: string;
  ageGroup?: string;
  dateOfBirth?: string;
  deathDate?: string;
  weightKg?: number;
  heightCm?: number;
  pregnancyStatus?: string;
  medicalHistory?: unknown[];
  parentInformation?: Record<string, unknown>;
  e2bD?: Record<string, unknown>;
}

export interface SafetyReporterDraft {
  reporterKey: string;
  primarySource: boolean;
  qualification?: string;
  organization?: string;
  countryCode?: string;
  reporterPayload?: Record<string, unknown>;
  e2bC2?: Record<string, unknown>;
}

export interface SafetyProductDraft {
  productKey: string;
  reportedName: string;
  roleCharacterization: ProductRole;
  activeSubstances?: unknown[];
  authorization?: Record<string, unknown>;
  indication?: Record<string, unknown>;
  dosage?: unknown[];
  route?: Record<string, unknown>;
  therapyDates?: Record<string, unknown>;
  batchLotNumber?: string;
  actionTaken?: string;
  rechallenge?: Record<string, unknown>;
  e2bG?: Record<string, unknown>;
}

export interface SafetyEventDraft {
  eventKey: string;
  reportedTerm: string;
  meddraTerm?: string;
  meddraCode?: string;
  meddraVersion?: string;
  onsetDate?: string;
  endDate?: string;
  outcome?: string;
  seriousness?: boolean;
  seriousnessCriteria?: Record<string, boolean>;
  medicallyConfirmed?: boolean;
  countryCode?: string;
  e2bE?: Record<string, unknown>;
}

export interface SafetyTestDraft {
  testKey: string;
  testName: string;
  testDate?: string;
  resultValue?: string;
  resultUnit?: string;
  referenceRange?: string;
  comments?: string;
  e2bF?: Record<string, unknown>;
}

export interface IntakeDraft {
  source: {
    sourceKey: string;
    sourceType: SafetySourceType;
    sourceSystem: string;
    externalReference?: string;
    receivedAt: string;
    countryCode?: string;
    languageCode?: string;
    sourcePayload: Record<string, unknown>;
    sourceSha256: string;
  };
  intake: {
    intakeKey: string;
    sourceRecordKey: string;
    intakeChannel: string;
    status: IntakeStatus;
    initialReceiptDate?: string;
    latestReceiptDate?: string;
    countryCode?: string;
    languageCode?: string;
    payload: Record<string, unknown>;
    lineage: SourceLineage;
    lineageSha256: string;
  };
  patients: SafetyPatientDraft[];
  reporters: SafetyReporterDraft[];
  products: SafetyProductDraft[];
  events: SafetyEventDraft[];
  tests: SafetyTestDraft[];
}

export interface E2BR3CasePayload {
  profile: typeof E2B_PROFILE;
  schemaVersion: typeof SAFETY_BACKBONE_SCHEMA_VERSION;
  C: Record<string, unknown>;
  D: Record<string, unknown>;
  E: Array<Record<string, unknown>>;
  F: Array<Record<string, unknown>>;
  G: Array<Record<string, unknown>>;
  H: Record<string, unknown>;
  nexus: {
    tenantId: string;
    caseId: string;
    caseKey: string;
    intakeRecordId: string;
    version: number;
    lineage: SourceLineage;
  };
}
