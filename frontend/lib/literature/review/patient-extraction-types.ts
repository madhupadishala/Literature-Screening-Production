export type PatientExtractionClassification =
  | "SINGLE_PATIENT"
  | "MULTIPLE_PATIENTS"
  | "NO_PATIENT"
  | "UNRESOLVED";

export type PatientEvidenceStatus =
  | "PRESENT"
  | "ABSENT"
  | "UNRESOLVED";

export type PatientEvidenceLocation = "TITLE" | "ABSTRACT";

export interface SourceLinkedEvidence {
  location: PatientEvidenceLocation;
  quote: string;
}

export interface PatientExtractionEntity {
  name: string;
  evidence: SourceLinkedEvidence;
}

export interface PatientExtractionSuggestion {
  suggestionKey: string;
  patientLabel: string;
  identifiablePatientStatus: PatientEvidenceStatus;
  patientEvidence: SourceLinkedEvidence;
  age?: string;
  ageEvidence?: SourceLinkedEvidence;
  sex?: string;
  sexEvidence?: SourceLinkedEvidence;
  country?: string;
  countryEvidence?: SourceLinkedEvidence;
  products: PatientExtractionEntity[];
  events: PatientExtractionEntity[];
}

export interface PatientExtractionResult {
  classification: PatientExtractionClassification;
  confidence: number;
  rationale: string;
  patients: PatientExtractionSuggestion[];
  warnings: string[];
  sourceGovernanceCorrections: string[];
}

export interface PatientExtractionExecution extends PatientExtractionResult {
  runId: string;
  runVersion: number;
  sourceSha256: string;
  provider: string;
  model: string;
  requestId: string;
  createdAt: string;
}
