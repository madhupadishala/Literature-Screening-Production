export const INTAKE_DISPOSITION_TYPES = [
  "CREATE_NEXUS_CASE",
  "EXPORT_EXTERNAL",
  "FOLLOW_UP_EXISTING_CASE",
  "DUPLICATE",
  "INCOMPLETE_FOLLOW_UP",
  "NON_CASE",
  "HOLD",
] as const;

export type IntakeDispositionType =
  (typeof INTAKE_DISPOSITION_TYPES)[number];

export interface IntakeDispositionRequest {
  dispositionType: IntakeDispositionType;
  rationale: string;
  destinationSystem?: string;
  externalCaseReference?: string;
  caseKey?: string;
  metadata?: Record<string, unknown>;
}
