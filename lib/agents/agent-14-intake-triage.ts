/**
 * agent-14-intake-triage.ts
 *
 * Agent 14: Intake Triage
 *
 * Wraps AG26 canonical implementation for PV case triage and document intake processing.
 * Performs deterministic rule-based triage: minimum ICSR criteria, seriousness assessment,
 * special situation detection, priority assignment, and follow-up recommendation.
 *
 * Compliance: FDA 21 CFR Part 11, EU GVP Module VI, ICH E2B(R3), GAMP 5
 */

import { BaseAgent, AgentExecutionInput, AgentResult, AgentCapabilities } from './base-agent';
import { HybridInferenceRouter } from '../infrastructure/hybrid-inference-router';
import { AuditLedgerService } from '../audit/audit-ledger-service';
import { ZDRStore } from '../infrastructure/redis-zdr-store';
import { createHash } from 'crypto';

// ============================================================================
// TYPES & INTERFACES (Mirror AG26 canonical types)
// ============================================================================

export type MinimumCriterionStatus = 'MET' | 'MISSING' | 'UNRESOLVED';

export type MinimumCriterionKey =
  | 'IDENTIFIABLE_PATIENT'
  | 'IDENTIFIABLE_REPORTER'
  | 'SUSPECT_PRODUCT'
  | 'ADVERSE_EVENT';

export interface MinimumCriterionAssessment {
  key: MinimumCriterionKey;
  status: MinimumCriterionStatus;
  evidence: string[];
  reason: string;
}

export const SERIOUSNESS_CRITERIA = [
  'DEATH',
  'LIFE_THREATENING',
  'HOSPITALIZATION_OR_PROLONGATION',
  'DISABILITY_OR_INCAPACITY',
  'CONGENITAL_ANOMALY_OR_BIRTH_DEFECT',
  'IMPORTANT_MEDICAL_EVENT',
] as const;

export type SeriousnessCriterion = typeof SERIOUSNESS_CRITERIA[number];

export const SPECIAL_SITUATIONS = [
  'PREGNANCY',
  'BREASTFEEDING',
  'PEDIATRIC',
  'ELDERLY',
  'OVERDOSE',
  'OFF_LABEL_USE',
  'MISUSE',
  'ABUSE',
  'MEDICATION_ERROR',
  'OCCUPATIONAL_EXPOSURE',
  'LACK_OF_THERAPEUTIC_EFFICACY',
  'FALSIFIED_MEDICINAL_PRODUCT',
] as const;

export type SpecialSituation = typeof SPECIAL_SITUATIONS[number];

export type TriageOutcome =
  | 'READY_FOR_DUPLICATE_REVIEW'
  | 'FOLLOW_UP_REQUIRED'
  | 'NOT_VALID_ICSR'
  | 'HOLD_FOR_CLARIFICATION';

export interface TriageSystemSnapshot {
  criteria: MinimumCriterionAssessment[];
  validityRecommendation: 'VALID' | 'UNRESOLVED';
  seriousnessRecommendation: 'SERIOUS' | 'NON_SERIOUS' | 'UNRESOLVED';
  seriousnessEvidence: Partial<Record<SeriousnessCriterion, string[]>>;
  detectedSpecialSituations: SpecialSituation[];
  followUpRecommended: boolean;
  followUpReasons: string[];
  priorityRecommendation: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
}

export interface Agent14Input {
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
}

export interface Agent14Output {
  trace_id: string;
  intakeRecordId: string;
  systemSnapshot: TriageSystemSnapshot;
  humanDecisionRequired: boolean;
  execution_tier: 'HEURISTIC' | 'LOCAL' | 'CLOUD' | 'DLQ';
  model_name: string;
  model_hash: string;
  total_latency_ms: number;
}

// ============================================================================
// HELPER FUNCTIONS (Ported from AG26 triage-evaluator.ts)
// ============================================================================

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function objectValues(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function criterion(
  key: MinimumCriterionAssessment['key'],
  met: boolean,
  evidence: string[],
  reason: string,
): MinimumCriterionAssessment {
  return {
    key,
    status: met ? 'MET' : 'MISSING',
    evidence,
    reason,
  };
}

function patientCriterion(
  patients: Array<Record<string, unknown>>,
): MinimumCriterionAssessment {
  const patient = patients.find((item) => {
    return Boolean(
      text(item.patient_reference) ||
        text(item.sex) ||
        numberValue(item.age_value) !== null ||
        text(item.age_group) ||
        item.date_of_birth ||
        item.death_date ||
        numberValue(item.weight_kg) !== null ||
        numberValue(item.height_cm) !== null,
    );
  });

  return criterion(
    'IDENTIFIABLE_PATIENT',
    Boolean(patient),
    patient
      ? [
          text(patient.patient_reference) && `Reference: ${text(patient.patient_reference)}`,
          text(patient.sex) && `Sex: ${text(patient.sex)}`,
          numberValue(patient.age_value) !== null &&
            `Age: ${String(numberValue(patient.age_value))} ${text(patient.age_unit)}`.trim(),
          text(patient.age_group) && `Age group: ${text(patient.age_group)}`,
        ].filter(Boolean) as string[]
      : [],
    patient
      ? 'At least one patient record contains identifying characteristics.'
      : 'No patient record contains sufficient identifying characteristics.',
  );
}

function reporterCriterion(
  reporters: Array<Record<string, unknown>>,
): MinimumCriterionAssessment {
  const reporter = reporters.find((item) => {
    const payload = {
      ...objectValues(item.reporter_payload),
      ...objectValues(item.e2b_c2_payload),
    };

    return Boolean(
      text(item.qualification) ||
        text(item.organization) ||
        text(payload.name) ||
        text(payload.initials) ||
        text(payload.email) ||
        text(payload.phone) ||
        text(payload.address) ||
        text(payload.city) ||
        text(payload.region) ||
        text(payload.country),
    );
  });

  return criterion(
    'IDENTIFIABLE_REPORTER',
    Boolean(reporter),
    reporter
      ? [
          text(reporter.qualification) &&
            `Qualification: ${text(reporter.qualification)}`,
          text(reporter.organization) &&
            `Organisation: ${text(reporter.organization)}`,
          text(reporter.country_code) &&
            `Country: ${text(reporter.country_code)}`,
        ].filter(Boolean) as string[]
      : [],
    reporter
      ? 'At least one reporter contains a qualifying identifiable characteristic.'
      : 'No reporter currently contains a qualifying identifiable characteristic.',
  );
}

function productCriterion(
  products: Array<Record<string, unknown>>,
): MinimumCriterionAssessment {
  const suspects = products.filter(
    (item) =>
      ['SUSPECT', 'INTERACTING'].includes(text(item.role_characterization)) &&
      Boolean(text(item.reported_name)),
  );

  return criterion(
    'SUSPECT_PRODUCT',
    suspects.length > 0,
    suspects.map(
      (item) =>
        `${text(item.role_characterization)}: ${text(item.reported_name)}`,
    ),
    suspects.length
      ? 'At least one suspect/interacting medicinal product is recorded.'
      : 'No suspect/interacting medicinal product is currently recorded.',
  );
}

function eventCriterion(
  events: Array<Record<string, unknown>>,
): MinimumCriterionAssessment {
  const eventRecords = events.filter((item) => Boolean(text(item.reported_term)));

  return criterion(
    'ADVERSE_EVENT',
    eventRecords.length > 0,
    eventRecords.map((item) => text(item.reported_term)),
    eventRecords.length
      ? 'At least one reaction/event term is recorded.'
      : 'No reaction/event term is currently recorded.',
  );
}

function seriousness(
  events: Array<Record<string, unknown>>,
): {
  recommendation: 'SERIOUS' | 'NON_SERIOUS' | 'UNRESOLVED';
  evidence: Partial<Record<SeriousnessCriterion, string[]>>;
} {
  const evidence: Partial<Record<SeriousnessCriterion, string[]>> = {};
  let explicitNonSerious = false;
  let unresolved = false;

  for (const event of events) {
    const term = text(event.reported_term) || 'Unspecified event';
    if (event.seriousness === true) {
      const criteria =
        event.seriousness_criteria &&
        typeof event.seriousness_criteria === 'object' &&
        !Array.isArray(event.seriousness_criteria)
          ? (event.seriousness_criteria as Record<string, unknown>)
          : {};

      const aliases: Record<SeriousnessCriterion, string[]> = {
        DEATH: ['DEATH', 'death'],
        LIFE_THREATENING: ['LIFE_THREATENING', 'lifeThreatening', 'life_threatening'],
        HOSPITALIZATION_OR_PROLONGATION: [
          'HOSPITALIZATION_OR_PROLONGATION',
          'hospitalization',
          'hospitalisation',
          'prolongedHospitalization',
          'prolonged_hospitalization',
        ],
        DISABILITY_OR_INCAPACITY: [
          'DISABILITY_OR_INCAPACITY',
          'disability',
          'incapacity',
        ],
        CONGENITAL_ANOMALY_OR_BIRTH_DEFECT: [
          'CONGENITAL_ANOMALY_OR_BIRTH_DEFECT',
          'congenitalAnomaly',
          'congenital_anomaly',
          'birthDefect',
          'birth_defect',
        ],
        IMPORTANT_MEDICAL_EVENT: [
          'IMPORTANT_MEDICAL_EVENT',
          'importantMedicalEvent',
          'important_medical_event',
          'medicallyImportant',
          'medically_important',
        ],
      };

      let mapped = false;
      for (const key of SERIOUSNESS_CRITERIA) {
        if (aliases[key].some((alias) => criteria[alias] === true)) {
          evidence[key] = [...(evidence[key] ?? []), term];
          mapped = true;
        }
      }
      if (!mapped) {
        evidence.IMPORTANT_MEDICAL_EVENT = [
          ...(evidence.IMPORTANT_MEDICAL_EVENT ?? []),
          `${term} (seriousness marked serious; specific criterion not captured)`,
        ];
      }
    } else if (event.seriousness === false) {
      explicitNonSerious = true;
    } else {
      unresolved = true;
    }
  }

  if (Object.keys(evidence).length > 0) {
    return { recommendation: 'SERIOUS', evidence };
  }
  if (events.length > 0 && explicitNonSerious && !unresolved) {
    return { recommendation: 'NON_SERIOUS', evidence };
  }
  return { recommendation: 'UNRESOLVED', evidence };
}

function collectStringValues(value: unknown, output: string[]): void {
  if (typeof value === 'string') {
    if (value.trim()) output.push(value.trim());
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStringValues(item, output));
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((item) =>
      collectStringValues(item, output),
    );
  }
}

function corpus(snapshot: {
  patients: Array<Record<string, unknown>>;
  reporters: Array<Record<string, unknown>>;
  products: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  sourcePayload?: Record<string, unknown>;
  intakePayload?: Record<string, unknown>;
}): string {
  const values: string[] = [];
  collectStringValues(snapshot.patients, values);
  collectStringValues(snapshot.reporters, values);
  collectStringValues(snapshot.products, values);
  collectStringValues(snapshot.events, values);
  collectStringValues(snapshot.sourcePayload ?? {}, values);
  collectStringValues(snapshot.intakePayload ?? {}, values);
  return values.join(' ').toLowerCase();
}

function detectSpecialSituations(
  snapshot: {
    patients: Array<Record<string, unknown>>;
    reporters: Array<Record<string, unknown>>;
    products: Array<Record<string, unknown>>;
    events: Array<Record<string, unknown>>;
    sourcePayload?: Record<string, unknown>;
    intakePayload?: Record<string, unknown>;
  },
): SpecialSituation[] {
  const value = corpus(snapshot);
  const found = new Set<SpecialSituation>();

  const rules: Array<[SpecialSituation, RegExp]> = [
    [
      'PREGNANCY',
      /\b(?:pregnant (?:patient|woman|female)|during pregnancy|pregnancy exposure|exposed during pregnancy|in[- ]utero)\b/i,
    ],
    ['BREASTFEEDING', /\bbreast[- ]?feed(?:ing)?|lactat(?:ion|ing)\b/i],
    ['OVERDOSE', /\boverdos(?:e|ed|ing)\b/i],
    ['OFF_LABEL_USE', /\boff[- ]?label\b/i],
    ['MISUSE', /\bmisuse\b/i],
    ['ABUSE', /\bdrug abuse|abuse of\b/i],
    ['MEDICATION_ERROR', /\bmedication error|prescribing error|dispensing error|administration error\b/i],
    ['OCCUPATIONAL_EXPOSURE', /\boccupational exposure\b/i],
    ['LACK_OF_THERAPEUTIC_EFFICACY', /\black of (?:therapeutic )?efficacy|lack of effect|ineffective\b/i],
    ['FALSIFIED_MEDICINAL_PRODUCT', /\bfalsified medicinal product|counterfeit medicine\b/i],
  ];

  for (const [situation, rule] of rules) {
    if (rule.test(value)) found.add(situation);
  }

  for (const patient of snapshot.patients) {
    const age = numberValue(patient.age_value);
    const unit = text(patient.age_unit).toLowerCase();
    const ageGroup = text(patient.age_group).toLowerCase();

    if (
      ageGroup.includes('paediatric') ||
      ageGroup.includes('pediatric') ||
      (age !== null && unit.startsWith('year') && age < 18)
    ) {
      found.add('PEDIATRIC');
    }

    if (
      ageGroup.includes('elderly') ||
      ageGroup.includes('geriatric') ||
      (age !== null && unit.startsWith('year') && age >= 65)
    ) {
      found.add('ELDERLY');
    }

    const pregnancyStatus = text(patient.pregnancy_status).toUpperCase();
    if (
      ['PREGNANT', 'YES', 'EXPOSED', 'ONGOING_PREGNANCY'].includes(
        pregnancyStatus,
      )
    ) {
      found.add('PREGNANCY');
    }
  }

  return SPECIAL_SITUATIONS.filter((item) => found.has(item));
}

// ============================================================================
// AGENT 14 IMPLEMENTATION
// ============================================================================

export class IntakeTriageAgent extends BaseAgent {
  constructor(config: {
    tenant_id: string;
    inference_router: HybridInferenceRouter;
    audit_ledger: AuditLedgerService;
    zdr_store: ZDRStore;
  }) {
    super({
      agent_id: 'agent-14-intake-triage',
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
      agent_id: 'agent-14-intake-triage',
      name: 'Intake Triage Agent',
      description: 'Performs deterministic PV case triage: minimum ICSR criteria, seriousness, special situations, priority, follow-up recommendation',
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
          execution_tier: { type: 'string' },
          model_name: { type: 'string' },
          model_hash: { type: 'string' },
          total_latency_ms: { type: 'integer' },
        },
      },
      supported_tiers: ['HEURISTIC', 'LOCAL', 'CLOUD', 'DLQ'],
      required_services: ['audit-ledger', 'zdr-store'],
      estimated_latency_ms: 2000,
      max_concurrent: 10,
    };
  }

  async execute(input: AgentExecutionInput): Promise<AgentResult> {
    const startTime = Date.now();
    const inputPayload = input.payload as Agent14Input;

    try {
      const { entities } = inputPayload;

      // 1. Evaluate minimum ICSR criteria
      const criteria = [
        patientCriterion(entities.patients),
        reporterCriterion(entities.reporters),
        productCriterion(entities.products),
        eventCriterion(entities.events),
      ];

      // 2. Validity recommendation
      const validityRecommendation = criteria.every(
        (item) => item.status === 'MET',
      )
        ? 'VALID'
        : 'UNRESOLVED';

      // 3. Seriousness assessment
      const serious = seriousness(entities.events);

      // 4. Special situations (preserve SPECIAL_SITUATIONS canonical order for determinism)
      const allSituations = detectSpecialSituations(entities);
      const detectedSpecialSituations = SPECIAL_SITUATIONS.filter(s => allSituations.includes(s));

      // 5. Follow-up reasons
      const followUpReasons = criteria
        .filter((item) => item.status !== 'MET')
        .map((item) => item.reason);

      if (serious.recommendation === 'UNRESOLVED' && entities.events.length > 0) {
        followUpReasons.push('Seriousness remains unresolved for one or more events.');
      }

      if (
        entities.reporters.length > 0 &&
        !entities.reporters.some((item) => Boolean(text(item.country_code)))
      ) {
        followUpReasons.push(
          'Reporter country is not captured; obtain it when feasible for downstream regional/E2B completeness.',
        );
      }

      const followUpRecommended = followUpReasons.length > 0;

      // 6. Priority
      const priorityRecommendation =
        serious.recommendation === 'SERIOUS'
          ? 'URGENT'
          : followUpRecommended
          ? 'HIGH'
          : 'NORMAL';

      const systemSnapshot: TriageSystemSnapshot = {
        criteria,
        validityRecommendation,
        seriousnessRecommendation: serious.recommendation,
        seriousnessEvidence: serious.evidence,
        detectedSpecialSituations,
        followUpRecommended,
        followUpReasons,
        priorityRecommendation,
      };

      // 7. Determine if human decision required
      const humanDecisionRequired =
        validityRecommendation === 'UNRESOLVED' ||
        serious.recommendation === 'UNRESOLVED' ||
        followUpRecommended;

      const output: Agent14Output = {
        trace_id: `trc_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 8)}`,
        intakeRecordId: inputPayload.intakeRecordId,
        systemSnapshot,
        humanDecisionRequired,
        execution_tier: 'HEURISTIC',
        model_name: 'heuristic-triage-v1',
        model_hash: 'heuristic-deterministic',
        total_latency_ms: Date.now() - startTime,
      };

      return this.createResult(true, output, Date.now() - startTime);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createResult(false, null, Date.now() - startTime, errorMessage);
    }
  }

  private createResult(success: boolean, output: Agent14Output | null, executionTime: number, error?: string): AgentResult {
    return {
      success,
      agent_id: 'agent-14-intake-triage',
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

export function createIntakeTriageAgent(config: {
  tenant_id: string;
  inference_router: HybridInferenceRouter;
  audit_ledger: AuditLedgerService;
  zdr_store: ZDRStore;
}): IntakeTriageAgent {
  return new IntakeTriageAgent(config);
}