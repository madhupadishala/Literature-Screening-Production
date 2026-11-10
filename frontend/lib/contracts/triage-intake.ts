/**
 * Triage & Intake Service Contract
 *
 * Defines the interface for PV case triage and document intake processing.
 * Implemented by:
 * - Frontend lib/safety/triage/* (triage evaluation workflow)
 * - Frontend lib/safety/intake/* (document intake processing)
 * - Agentic_AI AG26 (Intake Triage agent - ML classification)
 * - Agentic_AI AG03, AG04 (Patient/Reporter identification)
 */

export interface TriageInput {
  documentId: string;
  documentText: string;
  documentType: "literature" | "spontaneous" | "clinical" | "regulatory" | "other";
  metadata?: Record<string, unknown>;
}

export interface TriageResult {
  triageId: string;
  classification: "valid" | "invalid" | "needs_review";
  priority: "high" | "medium" | "low";
  confidence: number; // 0-1
  reasons: string[];
  extractedData: {
    patient?: PatientInfo;
    reporter?: ReporterInfo;
    products: ProductInfo[];
    adverseEvents: AdverseEventInfo[];
    seriousness?: SeriousnessAssessment;
  };
  processingTimeMs: number;
}

export interface PatientInfo {
  age?: number;
  ageUnit?: "year" | "month" | "day";
  sex?: "male" | "female" | "unknown";
  weight?: number;
  height?: number;
  medicalHistory?: string[];
}

export interface ReporterInfo {
  type: "healthcare_professional" | "consumer" | "regulatory" | "literature" | "other";
  qualification?: string;
  country?: string;
  contactInfo?: Record<string, string>;
}

export interface ProductInfo {
  name: string;
  role: "suspect" | "concomitant" | "interacting";
  strength?: string;
  dose?: string;
  route?: string;
  frequency?: string;
  indication?: string;
  startDate?: string;
  endDate?: string;
}

export interface AdverseEventInfo {
  term: string;
  meddraCode?: string;
  meddraVersion?: string;
  seriousness: "serious" | "non-serious";
  onsetDate?: string;
  outcome?: "recovered" | "recovering" | "not_recovered" | "fatal" | "unknown";
}

export interface SeriousnessAssessment {
  isSerious: boolean;
  criteria: {
    death: boolean;
    lifeThreatening: boolean;
    hospitalization: boolean;
    disability: boolean;
    congenitalAnomaly: boolean;
    other: boolean;
  };
}

export interface IntakeInput {
  sourceId: string;
  sourceType: "email" | "fax" | "portal" | "literature" | "regulatory" | "phone" | "other";
  documents: IntakeDocument[];
  metadata?: Record<string, unknown>;
}

export interface IntakeDocument {
  id: string;
  fileName: string;
  mimeType: string;
  content?: string; // extracted text
  url?: string; // original file location
  hash: string;
}

export interface IntakeResult {
  intakeId: string;
  status: "received" | "processing" | "completed" | "failed";
  triageResults: TriageResult[];
  createdCases: string[]; // case IDs
  processingTimeMs: number;
  errors?: string[];
}

export interface TriageIntakeService {
  /**
   * Process a single document for triage
   */
  triageDocument(input: TriageInput): Promise<TriageResult>;

  /**
   * Process multiple documents for triage
   */
  triageDocuments(inputs: TriageInput[]): Promise<TriageResult[]>;

  /**
   * Process full intake (documents -> triage -> case creation)
   */
  processIntake(input: IntakeInput): Promise<IntakeResult>;

  /**
   * Get triage rules/configuration
   */
  getTriageConfig(): Promise<{
    rules: string[];
    thresholds: Record<string, number>;
  }>;

  /**
   * Update triage configuration
   */
  updateTriageConfig(config: { rules: string[]; thresholds: Record<string, number> }): Promise<void>;
}