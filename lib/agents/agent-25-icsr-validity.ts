/**
 * agent-25-icsr-validity.ts
 *
 * Agent 25: ICSR Validity Assessment (AG25)
 *
 * Validates ICSR completeness per ICH E2B(R3) minimum criteria.
 * Determines if a case meets minimum requirements for regulatory submission.
 * Provides the final gate before duplicate detection and downstream processing.
 *
 * Compliance: FDA 21 CFR Part 11, EU GVP Module VI, ICH E2B(R3), GAMP 5
 */

import { BaseAgent, AgentExecutionInput, AgentResult, AgentCapabilities } from './base-agent';
import { HybridInferenceRouter } from '../infrastructure/hybrid-inference-router';
import { AuditLedgerService } from '../audit/audit-ledger-service';
import { ZDRStore } from '../infrastructure/redis-zdr-store';
import { createHash } from 'crypto';

// ============================================================================
// TYPES & INTERFACES (Per ICH E2B(R3) Minimum Criteria)
// ============================================================================

export type ValidityStatus = 'VALID' | 'INVALID' | 'UNRESOLVED';

export type ValidityCriterionKey =
  | 'IDENTIFIABLE_PATIENT'
  | 'IDENTIFIABLE_REPORTER'
  | 'SUSPECT_PRODUCT'
  | 'ADVERSE_EVENT'
  | 'VALID_REPORTER_QUALIFICATION'
  | 'VALID_COUNTRY'
  | 'VALID_EVENT_TERM';

export interface ValidityCriterionAssessment {
  key: ValidityCriterionKey;
  status: 'MET' | 'NOT_MET' | 'UNRESOLVED';
  evidence: string[];
  reason: string;
}

export interface ValiditySnapshot {
  criteria: ValidityCriterionAssessment[];
  overallStatus: ValidityStatus;
  metCount: number;
  totalCount: number;
  blockingIssues: string[];
  warningIssues: string[];
  submissionReady: boolean;
}

export interface Agent25Input {
  intakeRecordId: string;
  tenantId: string;
  entities: {
    patients: Array<Record<string, unknown>>;
    reporters: Array<Record<string, unknown>>;
    products: Array<Record<string, unknown>>;
    events: Array<Record<string, unknown>>;
    sourcePayload?: Record<string, unknown>;
    intakePayload?: Record<string, unknown>;
  };
  upstreamValidations?: {
    patientIdentification?: { overallStatus: string; criticalFieldsPresent: number };
    countryIncident?: { primaryCountry: { status: string }; crossBorder: boolean };
  };
}

export interface Agent25Output {
  trace_id: string;
  intakeRecordId: string;
  systemSnapshot: ValiditySnapshot;
  humanDecisionRequired: boolean;
  execution_tier: 'HEURISTIC' | 'LOCAL' | 'CLOUD' | 'DLQ';
  model_name: string;
  model_hash: string;
  total_latency_ms: number;
}

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

// ============================================================================
// AGENT 25 IMPLEMENTATION
// ============================================================================

export class IcsrValidityAgent extends BaseAgent {
  constructor(config: {
    tenant_id: string;
    inference_router: HybridInferenceRouter;
    audit_ledger: AuditLedgerService;
    zdr_store: ZDRStore;
  }) {
    super({
      agent_id: 'agent-25-icsr-validity',
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
      agent_id: 'agent-25-icsr-validity',
      name: 'ICSR Validity Assessment Agent (AG25)',
      description: 'Validates ICSR minimum criteria per ICH E2B(R3); determines submission readiness',
      input_schema: {
        type: 'object',
        properties: {
          intakeRecordId: { type: 'string' },
          tenantId: { type: 'string' },
          entities: {
            type: 'object',
            properties: {
              patients: { type: 'array', items: { type: 'object' } },
              reporters: { type: 'array', items: { type: 'object' } },
              products: { type: 'array', items: { type: 'object' } },
              events: { type: 'array', items: { type: 'object' } },
              sourcePayload: { type: 'object' },
              intakePayload: { type: 'object' },
            },
            required: ['patients', 'reporters', 'products', 'events'],
          },
          upstreamValidations: { type: 'object' },
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
      estimated_latency_ms: 1000,
      max_concurrent: 30,
    };
  }

  async execute(input: AgentExecutionInput): Promise<AgentResult> {
    const startTime = Date.now();
    const inputPayload = input.payload as { intakeRecordId: string; tenantId: string; entities: { patients: Array<Record<string, unknown>>; reporters: Array<Record<string, unknown>>; products: Array<Record<string, unknown>>; events: Array<Record<string, unknown>>; sourcePayload?: Record<string, unknown>; intakePayload?: Record<string, unknown> }; upstreamValidations?: { patientIdentification?: { overallStatus: string; criticalFieldsPresent: number }; countryIncident?: { primaryCountry: { status: string }; crossBorder: boolean } } };

    try {
      const { intakeRecordId, entities, upstreamValidations } = inputPayload;
      const { patients, reporters, products, events } = entities;

      const criteria: ValidityCriterionAssessment[] = [];

      // --- 1. IDENTIFIABLE PATIENT ---
      const patient = entities.patients?.find((p) => {
        return Boolean(
          text(p.patient_initials) || text(p.initials) || text(p.patient_reference) ||
          text(p.sex) || text(p.gender) ||
          numberValue(p.age_value) !== null ||
          text(p.age_group) ||
          text(p.date_of_birth) ||
          numberValue(p.weight_kg) !== null ||
          numberValue(p.height_cm) !== null
        );
      });

      criteria.push({
        key: 'IDENTIFIABLE_PATIENT',
        status: patient ? 'MET' : 'NOT_MET',
        evidence: patient
          ? [
              text(patient.patient_initials) && `Initials: ${text(patient.patient_initials)}`,
              text(patient.sex) && `Sex: ${text(patient.sex)}`,
              numberValue(patient.age_value) !== null && `Age: ${numberValue(patient.age_value)} ${text(patient.age_unit)}`,
            ].filter(Boolean) as string[]
          : [],
        reason: patient
          ? 'At least one patient record contains identifying characteristics.'
          : 'No patient record contains sufficient identifying characteristics.',
      });

      // --- 2. IDENTIFIABLE REPORTER ---
      const reporter = reporters?.find((r) => {
        const payload = { ...objectValues(r.reporter_payload), ...objectValues(r.e2b_c2_payload) };
        return Boolean(
          text(r.qualification) || text(r.organization) ||
          text(payload.name) || text(payload.initials) ||
          text(payload.email) || text(payload.phone)
        );
      });

      criteria.push({
        key: 'IDENTIFIABLE_REPORTER',
        status: reporter ? 'MET' : 'NOT_MET',
        evidence: reporter
          ? [
              text(reporter.qualification) && `Qualification: ${text(reporter.qualification)}`,
              text(reporter.organization) && `Organisation: ${text(reporter.organization)}`,
              text(reporter.country_code) && `Country: ${text(reporter.country_code)}`,
            ].filter(Boolean) as string[]
          : [],
        reason: reporter
          ? 'At least one reporter contains a qualifying identifiable characteristic.'
          : 'No reporter currently contains a qualifying identifiable characteristic.',
      });

      // --- 3. SUSPECT PRODUCT ---
      const suspects = products.filter(
        (item) =>
          ['SUSPECT', 'INTERACTING'].includes(text(item.role_characterization)) &&
          Boolean(text(item.reported_name)),
      );

      criteria.push({
        key: 'SUSPECT_PRODUCT',
        status: suspects.length > 0 ? 'MET' : 'NOT_MET',
        evidence: suspects.map((item) => `${text(item.role_characterization)}: ${text(item.reported_name)}`),
        reason: suspects.length
          ? 'At least one suspect/interacting medicinal product is recorded.'
          : 'No suspect/interacting medicinal product is currently recorded.',
      });

      // --- 4. ADVERSE EVENT ---
      const eventRecords = events.filter((item) => Boolean(text(item.reported_term)));

      criteria.push({
        key: 'ADVERSE_EVENT',
        status: eventRecords.length > 0 ? 'MET' : 'NOT_MET',
        evidence: eventRecords.map((item) => text(item.reported_term)),
        reason: eventRecords.length
          ? 'At least one reaction/event term is recorded.'
          : 'No reaction/event term is currently recorded.',
      });

      // --- 5. VALID REPORTER QUALIFICATION ---
      const qualifiedReporter = reporters.find((r) =>
        ['PHYSICIAN', 'PHARMACIST', 'NURSE', 'OTHER_HEALTH_PROFESSIONAL', 'LAWYER', 'CONSUMER']
          .includes(text(r.qualification).toUpperCase())
      );

      criteria.push({
        key: 'VALID_REPORTER_QUALIFICATION',
        status: qualifiedReporter ? 'MET' : 'NOT_MET',
        evidence: qualifiedReporter
          ? [`Qualification: ${text(qualifiedReporter.qualification)}`]
          : [],
        reason: qualifiedReporter
          ? `Reporter qualification "${text(qualifiedReporter.qualification)}" is a valid ICH E2B(R3) qualification.`
          : 'No reporter has a valid ICH E2B(R3) qualification.',
      });

      // --- 6. VALID COUNTRY ---
      const hasValidCountry = entities.reporters.some((r) =>
        Boolean(text(r.country_code)) &&
        text(r.country_code).trim().length === 2
      );

      criteria.push({
        key: 'VALID_COUNTRY',
        status: hasValidCountry ? 'MET' : 'NOT_MET',
        evidence: hasValidCountry
          ? entities.reporters.filter(r => text(r.country_code)).map(r => `Country: ${text(r.country_code)}`)
          : [],
        reason: hasValidCountry
          ? 'At least one reporter has a valid ISO 3166-1 alpha-2 country code.'
          : 'No reporter has a valid ISO 3166-1 alpha-2 country code.',
      });

      // --- 7. VALID EVENT TERM ---
      const hasValidTerm = events.some((e) => Boolean(text(e.reported_term)));

      criteria.push({
        key: 'VALID_EVENT_TERM',
        status: hasValidTerm ? 'MET' : 'NOT_MET',
        evidence: hasValidTerm
          ? events.filter(e => text(e.reported_term)).map(e => text(e.reported_term))
          : [],
        reason: hasValidTerm
          ? 'At least one event has a valid reported term.'
          : 'No event has a valid reported term.',
      });

      // --- Determine overall validity ---
      const metCount = criteria.filter(c => c.status === 'MET').length;
      const totalCount = criteria.length;
      const notMetCount = criteria.filter(c => c.status === 'NOT_MET').length;
      const unresolvedCount = criteria.filter(c => c.status === 'UNRESOLVED').length;

      // Critical criteria that must be MET for VALID
      const criticalKeys: ValidityCriterionKey[] = [
        'IDENTIFIABLE_PATIENT',
        'IDENTIFIABLE_REPORTER',
        'SUSPECT_PRODUCT',
        'ADVERSE_EVENT',
      ];

      const allCriticalMet = criticalKeys.every(key =>
        criteria.find(c => c.key === key)?.status === 'MET'
      );

      let overallStatus: ValidityStatus;
      if (allCriticalMet) {
        overallStatus = 'VALID';
      } else if (notMetCount > 0) {
        overallStatus = 'INVALID';
      } else {
        overallStatus = 'UNRESOLVED';
      }

      // Blocking issues (critical criteria NOT MET)
      const blockingIssues = criteria
        .filter(c => c.status === 'NOT_MET' && criticalKeys.includes(c.key))
        .map(c => `${c.key}: ${c.reason}`);

      // Warning issues (non-critical NOT MET or UNRESOLVED)
      const warningIssues = criteria
        .filter(c => (c.status === 'NOT_MET' && !criticalKeys.includes(c.key)) || c.status === 'UNRESOLVED')
        .map(c => `${c.key}: ${c.reason}`);

      // Submission ready: VALID overall + no blocking + no unresolved critical
      const submissionReady = overallStatus === 'VALID' && blockingIssues.length === 0 && unresolvedCount === 0;

      const systemSnapshot = {
        criteria,
        overallStatus,
        metCount: criteria.filter(c => c.status === 'MET').length,
        totalCount: criteria.length,
        blockingIssues,
        warningIssues,
        submissionReady,
      };

      const output = {
        trace_id: `trc_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 8)}`,
        intakeRecordId: inputPayload.intakeRecordId || `rec_${Date.now().toString(36)}`,
        systemSnapshot,
        humanDecisionRequired: overallStatus !== 'VALID',
        execution_tier: 'HEURISTIC' as const,
        model_name: 'heuristic-validity-v1',
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
      agent_id: 'agent-25-icsr-validity',
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

export function createIcsrValidityAgent(config: {
  tenant_id: string;
  inference_router: HybridInferenceRouter;
  audit_ledger: AuditLedgerService;
  zdr_store: ZDRStore;
}): IcsrValidityAgent {
  return new IcsrValidityAgent(config);
}