/**
 * agent-3-patient-identification.ts
 *
 * Agent 3: Patient Identification (AG03)
 *
 * Extracts and validates patient identification per ICH E2B(R3) Section A.1.
 * Performs deterministic validation: patient initials, sex, age/age group,
 * date of birth, weight, height, and medical history presence.
 *
 * Compliance: FDA 21 CFR Part 11, EU GVP Module VI, ICH E2B(R3), GAMP 5
 */

import { BaseAgent, AgentExecutionInput, AgentResult, AgentCapabilities } from './base-agent';
import { HybridInferenceRouter } from '../infrastructure/hybrid-inference-router';
import { AuditLedgerService } from '../audit/audit-ledger-service';
import { ZDRStore } from '../infrastructure/redis-zdr-store';
import { createHash } from 'crypto';

// ============================================================================
// TYPES & INTERFACES (Per ICH E2B(R3) Section A.1)
// ============================================================================

export type PatientIdentificationStatus = 'COMPLETE' | 'PARTIAL' | 'MISSING';

export type PatientIdentificationField =
  | 'PATIENT_INITIALS'
  | 'SEX'
  | 'AGE'
  | 'AGE_GROUP'
  | 'DATE_OF_BIRTH'
  | 'WEIGHT'
  | 'HEIGHT'
  | 'MEDICAL_HISTORY';

export interface PatientIdentificationAssessment {
  field: PatientIdentificationField;
  status: PatientIdentificationStatus;
  value?: string;
  evidence: string[];
  reason: string;
}

export interface PatientIdentificationSnapshot {
  assessments: PatientIdentificationAssessment[];
  completenessScore: number;  // 0-100
  criticalFieldsPresent: number;
  totalCriticalFields: number;
  overallStatus: 'COMPLETE' | 'PARTIAL' | 'MISSING';
  followUpRequired: boolean;
  followUpReasons: string[];
}

export interface Agent3Input {
  intakeRecordId: string;
  tenantId: string;
  entities: {
    patients: Array<Record<string, unknown>>;
    sourcePayload?: Record<string, unknown>;
    intakePayload?: Record<string, unknown>;
  };
}

export interface Agent3Output {
  trace_id: string;
  intakeRecordId: string;
  systemSnapshot: PatientIdentificationSnapshot;
  humanDecisionRequired: boolean;
  execution_tier: 'HEURISTIC' | 'LOCAL' | 'CLOUD' | 'DLQ';
  model_name: string;
  model_hash: string;
  total_latency_ms: number;
}

// ============================================================================
// HELPER FUNCTIONS (Ported from AG03 canonical)
// ============================================================================

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function objectValues(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// Canonical patient identification fields per ICH E2B(R3) A.1
const CRITICAL_FIELDS: PatientIdentificationField[] = [
  'PATIENT_INITIALS',
  'SEX',
  'AGE',
  'AGE_GROUP',
  'DATE_OF_BIRTH',
  'WEIGHT',
  'HEIGHT',
  'MEDICAL_HISTORY',
];

function assessPatientField(
  patient: Record<string, unknown>,
  field: PatientIdentificationField
): PatientIdentificationAssessment {
  const evidence: string[] = [];
  let status: PatientIdentificationStatus = 'MISSING';
  let value: string | undefined;
  let reason: string;

  switch (field) {
    case 'PATIENT_INITIALS': {
      const initials = text(patient.patient_initials) || text(patient.initials) || text(patient.patient_reference);
      if (initials) {
        status = 'COMPLETE';
        value = initials;
        evidence.push(`Initials: ${initials}`);
        reason = 'Patient initials are provided.';
      } else {
        reason = 'Patient initials are missing.';
      }
      break;
    }

    case 'SEX': {
      const sex = text(patient.sex) || text(patient.gender);
      if (sex) {
        status = 'COMPLETE';
        value = sex.toUpperCase();
        evidence.push(`Sex: ${value}`);
        reason = 'Patient sex is provided.';
      } else {
        reason = 'Patient sex is missing.';
      }
      break;
    }

    case 'AGE': {
      const ageValue = numberValue(patient.age_value);
      const ageUnit = text(patient.age_unit).toUpperCase();
      if (ageValue !== null && ageUnit) {
        status = 'COMPLETE';
        value = `${ageValue} ${ageUnit}`;
        evidence.push(`Age: ${value}`);
        reason = 'Patient age is provided.';
      } else {
        reason = 'Patient age is missing or incomplete.';
      }
      break;
    }

    case 'AGE_GROUP': {
      const ageGroup = text(patient.age_group);
      if (ageGroup) {
        status = 'COMPLETE';
        value = ageGroup.toUpperCase();
        evidence.push(`Age group: ${value}`);
        reason = 'Patient age group is provided.';
      } else {
        reason = 'Patient age group is missing.';
      }
      break;
    }

    case 'DATE_OF_BIRTH': {
      const dob = text(patient.date_of_birth);
      if (dob) {
        status = 'COMPLETE';
        value = dob;
        evidence.push(`Date of birth: ${dob}`);
        reason = 'Date of birth is provided.';
      } else {
        reason = 'Date of birth is missing.';
      }
      break;
    }

    case 'WEIGHT': {
      const weightValue = numberValue(patient.weight_kg);
      const weightUnit = text(patient.weight_unit).toUpperCase();
      if (weightValue !== null) {
        status = 'COMPLETE';
        value = `${weightValue} ${weightUnit || 'KG'}`;
        evidence.push(`Weight: ${value}`);
        reason = 'Patient weight is provided.';
      } else {
        reason = 'Patient weight is missing.';
      }
      break;
    }

    case 'HEIGHT': {
      const heightValue = numberValue(patient.height_cm);
      const heightUnit = text(patient.height_unit).toUpperCase();
      if (heightValue !== null) {
        status = 'COMPLETE';
        value = `${heightValue} ${heightUnit || 'CM'}`;
        evidence.push(`Height: ${value}`);
        reason = 'Patient height is provided.';
      } else {
        reason = 'Patient height is missing.';
      }
      break;
    }

    case 'MEDICAL_HISTORY': {
      const medHistory = text(patient.medical_history) || text(patient.past_medical_history);
      if (medHistory) {
        status = 'COMPLETE';
        value = medHistory.substring(0, 200);
        evidence.push(`Medical history: ${value}`);
        reason = 'Medical history is provided.';
      } else {
        reason = 'Medical history is missing.';
      }
      break;
    }
  }

  return {
    field,
    status,
    value,
    evidence,
    reason: reason || 'Field not assessed.',
  };
}

function findBestPatient(patients: Array<Record<string, unknown>>): Record<string, unknown> | null {
  if (!patients || patients.length === 0) return null;

  // Prefer the patient with the most complete data
  let bestPatient = null;
  let bestScore = -1;

  for (const patient of patients) {
    let score = 0;
    if (text(patient.patient_initials) || text(patient.initials) || text(patient.patient_reference)) score++;
    if (text(patient.sex) || text(patient.gender)) score++;
    if (numberValue(patient.age_value) !== null) score++;
    if (text(patient.age_group)) score++;
    if (text(patient.date_of_birth)) score++;
    if (numberValue(patient.weight_kg) !== null) score++;
    if (numberValue(patient.height_cm) !== null) score++;
    if (text(patient.medical_history) || text(patient.past_medical_history)) score++;

    if (score > bestScore) {
      bestScore = score;
      bestPatient = patient;
    }
  }

  return bestPatient;
}

// ============================================================================
// AGENT 3 IMPLEMENTATION
// ============================================================================

export class PatientIdentificationAgent extends BaseAgent {
  constructor(config: {
    tenant_id: string;
    inference_router: HybridInferenceRouter;
    audit_ledger: AuditLedgerService;
    zdr_store: ZDRStore;
  }) {
    super({
      agent_id: 'agent-3-patient-identification',
      tenant_id: config.tenant_id,
      inference_router: config.inference_router,
      audit_ledger: config.audit_ledger,
      zdr_store: config.zdr_store,
      max_retries: 1,
      timeout_ms: 10000,
      enable_audit: true,
      deterministic_seed: 42,
    });
  }

  getCapabilities(): AgentCapabilities {
    return {
      agent_id: 'agent-3-patient-identification',
      name: 'Patient Identification Agent (AG03)',
      description: 'Extracts and validates patient identification per ICH E2B(R3) Section A.1: initials, sex, age, age group, DOB, weight, height, medical history',
      input_schema: {
        type: 'object',
        properties: {
          intakeRecordId: { type: 'string' },
          tenantId: { type: 'string' },
          entities: {
            type: 'object',
            properties: {
              patients: { type: 'array', items: { type: 'object' } },
              sourcePayload: { type: 'object' },
              intakePayload: { type: 'object' },
            },
            required: ['patients'],
          },
        },
        required: ['intakeRecordId', 'tenantId', 'entities'],
      },
      output_schema: {
        type: 'object',
        properties: {
          trace_id: { type: 'string' },
          intakeRecordId: { type: 'string' },
          systemSnapshot: { type: 'object' },
          humanDecisionRequired: { type: 'boolean' },
          execution_tier: { type: 'string', enum: ['HEURISTIC', 'LOCAL', 'CLOUD', 'DLQ'] },
          model_name: { type: 'string' },
          model_hash: { type: 'string' },
          total_latency_ms: { type: 'integer' },
        },
      },
      supported_tiers: ['HEURISTIC'],
      required_services: ['audit-ledger', 'zdr-store'],
      estimated_latency_ms: 1500,
      max_concurrent: 20,
    };
  }

  async execute(input: AgentExecutionInput): Promise<AgentResult> {
    const startTime = Date.now();
    const inputPayload = input.payload as { intakeRecordId: string; tenantId: string; entities: { patients: Array<Record<string, unknown>>; sourcePayload?: Record<string, unknown>; intakePayload?: Record<string, unknown> } };

    try {
      const { intakeRecordId, entities } = inputPayload;
      const patients = entities.patients || [];

      // Find the best patient record
      const bestPatient = findBestPatient(patients);

      // Assess all critical fields
      const assessments: PatientIdentificationAssessment[] = [];

      if (bestPatient) {
        for (const field of CRITICAL_FIELDS) {
          assessments.push(assessPatientField(bestPatient, field));
        }
      } else {
        // No patient record found - all fields missing
        for (const field of CRITICAL_FIELDS) {
          assessments.push({
            field,
            status: 'MISSING',
            evidence: [],
            reason: 'No patient record found in intake data.',
          });
        }
      }

      // Calculate completeness
      const criticalFieldsPresent = assessments.filter(a => a.status === 'COMPLETE').length;
      const totalCriticalFields = CRITICAL_FIELDS.length;
      const completenessScore = Math.round((criticalFieldsPresent / CRITICAL_FIELDS.length) * 100);

      // Determine overall status
      let overallStatus: 'COMPLETE' | 'PARTIAL' | 'MISSING';
      if (criticalFieldsPresent === CRITICAL_FIELDS.length) {
        overallStatus = 'COMPLETE';
      } else if (criticalFieldsPresent === 0) {
        overallStatus = 'MISSING';
      } else {
        overallStatus = 'PARTIAL';
      }

      // Determine follow-up reasons
      const followUpReasons: string[] = [];
      for (const assessment of assessments) {
        if (assessment.status !== 'COMPLETE') {
          followUpReasons.push(assessment.reason);
        }
      }

      const followUpRequired = followUpReasons.length > 0;

      // Human decision required if any critical field missing
      const humanDecisionRequired = overallStatus !== 'COMPLETE';

      const systemSnapshot = {
        assessments,
        completenessScore,
        criticalFieldsPresent,
        totalCriticalFields,
        overallStatus,
        followUpRequired,
        followUpReasons,
      };

      const output = {
        trace_id: `trc_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 8)}`,
        intakeRecordId: inputPayload.intakeRecordId || `rec_${Date.now().toString(36)}`,
        systemSnapshot,
        humanDecisionRequired,
        execution_tier: 'HEURISTIC' as const,
        model_name: 'heuristic-patient-id-v1',
        model_hash: 'heuristic-deterministic',
        total_latency_ms: Date.now() - startTime,
      };

      return this.createResult(true, output, Date.now() - startTime);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createResult(false, null, Date.now() - startTime, errorMessage);
    }
  }

  private createResult(success: boolean, output: any, executionTime: number, error?: string): AgentResult {
    return {
      success,
      agent_id: 'agent-3-patient-identification',
      trace_id: '',
      output,
      error,
      execution_tier: 'HEURISTIC',
      latency_ms: executionTime,
      merkle_entry_hash: createHash('sha256').update(JSON.stringify({ success, output, executionTime })).digest('hex'),
      execution_metadata: { timestamp: new Date().toISOString() },
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createPatientIdentificationAgent(config: {
  tenant_id: string;
  inference_router: HybridInferenceRouter;
  audit_ledger: AuditLedgerService;
  zdr_store: ZDRStore;
}): PatientIdentificationAgent {
  return new PatientIdentificationAgent(config);
}