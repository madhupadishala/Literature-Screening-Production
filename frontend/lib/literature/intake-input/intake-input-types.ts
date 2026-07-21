export const INTAKE_INPUT_SCHEMA_VERSION = "clinixai.literature.intake-input.v1";

export interface GenerateIntakeInputRequest {
  packageId: string;
  reason: string;
}

export interface IntakeInputExportSummary {
  exportId: string;
  packageId: string;
  exportVersion: number;
  schemaVersion: string;
  fileName: string;
  sha256: string;
  generatedAt: string;
  generatedBy?: string;
  reused: boolean;
}

export interface IntakeInputDownload extends IntakeInputExportSummary {
  payload: Record<string, unknown>;
  content: string;
}
