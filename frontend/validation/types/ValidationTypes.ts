export type ValidationSeverity = "PASS" | "WARNING" | "FAIL";

export type ValidationCategory =
  | "PRODUCT_DETECTION"
  | "COMPANY_PRODUCT"
  | "EVENT_DETECTION"
  | "PATIENT_DETECTION"
  | "REPORTER_DETECTION"
  | "COUNTRY_DETECTION"
  | "COI_DETECTION"
  | "SERIOUSNESS_DETECTION"
  | "VALIDITY_ASSESSMENT"
  | "PREGNANCY_DETECTION"
  | "DEATH_DETECTION"
  | "SUSAR_DETECTION"
  | "MEDICAL_HISTORY"
  | "CONCOMITANT_DRUG"
  | "TREATMENT_DRUG"
  | "NARRATIVE_GENERATION"
  | "KNOWLEDGE_RETRIEVAL"
  | "TRANSLATION"
  | "WORKFLOW_ROUTING";

export type ValidationStatus = "NOT_STARTED" | "RUNNING" | "COMPLETED" | "FAILED";

export interface ValidationEvidence {
  sourceId?: string;
  sourceType?: "PMID" | "FULL_TEXT" | "ABSTRACT" | "KNOWLEDGE_BASE" | "REGULATORY_GUIDANCE" | "USER_RULE";
  sourceTitle?: string;
  retrievedText?: string;
  confidence?: number;
  embeddingDistance?: number;
  knowledgeVersion?: string;
  promptVersion?: string;
  modelName?: string;
}

export interface ExpectedValidationOutput {
  productNames?: string[];
  companyProducts?: string[];
  adverseEvents?: string[];
  patientPresent?: boolean;
  reporterPresent?: boolean;
  country?: string;
  coiExpected?: boolean;
  seriousExpected?: boolean;
  deathExpected?: boolean;
  susarExpected?: boolean;
  pregnancyExpected?: boolean;
  validCaseExpected?: boolean;
  medicalHistory?: string[];
  concomitantDrugs?: string[];
  treatmentDrugs?: string[];
  narrativeRequired?: boolean;
  workflowRoute?: string;
  translationRequired?: boolean;
}

export interface ActualValidationOutput extends ExpectedValidationOutput {
  confidence?: number;
  reasoning?: string;
  evidence?: ValidationEvidence[];
  warnings?: string[];
}

export interface ValidationScenario {
  id: string;
  title: string;
  category: ValidationCategory;
  pmid?: string;
  inputText?: string;
  language?: string;
  expected: ExpectedValidationOutput;
  actual?: ActualValidationOutput;
  tags?: string[];
  createdBy?: string;
  createdAt?: string;
}

export interface FieldValidationResult {
  field: keyof ExpectedValidationOutput;
  expected: unknown;
  actual: unknown;
  matched: boolean;
  confidence?: number;
  severity: ValidationSeverity;
  comment?: string;
}

export interface ScenarioValidationResult {
  scenarioId: string;
  title: string;
  category: ValidationCategory;
  status: ValidationSeverity;
  fieldResults: FieldValidationResult[];
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  confidence?: number;
  warnings: string[];
  evidence?: ValidationEvidence[];
}

export interface ValidationRunConfig {
  runId: string;
  sprint: string;
  datasetName: string;
  modelName?: string;
  promptVersion?: string;
  knowledgeVersion?: string;
  embeddingVersion?: string;
  strictMode?: boolean;
  createdAt?: string;
}

export interface ValidationRunResult {
  runId: string;
  sprint: string;
  datasetName: string;
  status: ValidationStatus;
  startedAt: string;
  completedAt?: string;
  totalScenarios: number;
  passed: number;
  warnings: number;
  failed: number;
  overallAccuracy: number;
  overallPrecision: number;
  overallRecall: number;
  overallF1Score: number;
  averageConfidence?: number;
  scenarioResults: ScenarioValidationResult[];
}