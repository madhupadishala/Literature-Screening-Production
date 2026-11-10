/**
 * agent-17-clock-start.ts
 *
 * Agent 17: Clock Start Date (Day Zero) Calculator
 *
 * Wraps AG09 canonical implementation for computing the day zero (clock start date)
 * for PV case reporting per GVP Module VI.B.7 and literature rules (VI App2).
 *
 * Compliance: FDA 21 CFR Part 11, EU GVP Module VI, ICH E2B(R3), GAMP 5
 */

import { BaseAgent, AgentExecutionInput, AgentResult, AgentCapabilities } from './base-agent';
import { HybridInferenceRouter } from '../infrastructure/hybrid-inference-router';
import { AuditLedgerService } from '../audit/audit-ledger-service';
import { ZDRStore } from '../infrastructure/redis-zdr-store';
import { createHash } from 'crypto';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type SourceType =
  | 'spontaneous'
  | 'solicited'
  | 'clinical_trial'
  | 'literature_global'
  | 'literature_local'
  | 'regulator'
  | 'partner'
  | 'digital_media';

export type ReporterPolicy = 'any_one' | 'name_or_initials_and_qualification';

export interface ReceiptEvent {
  event_id: string;
  date: string; // YYYY-MM-DD: date info reached ANY MAH personnel/contractor
  received_by: 'mah' | 'affiliate' | 'contractor' | 'partner';
  text: string;
}

export interface RegionConfig {
  name: string;
  serious_days: number;
  nonserious_days: number | null; // null = no non-serious expedited clock
}

export interface CriterionAssessment {
  reporter: {
    present: boolean;
    evidence: string | null;
    reporter_has_qualification: boolean;
    reporter_has_name_or_initials: boolean;
  };
  patient: {
    present: boolean;
    evidence: string | null;
  };
  product: {
    present: boolean;
    evidence: string | null;
  };
  reaction: {
    present: boolean;
    evidence: string | null;
  };
  in_abstract_only: boolean | null;
  is_followup_significant: boolean | null;
  followup_reason: string | null;
}

export interface Agent17Input {
  caseId: string;
  source_type: SourceType;
  receipts: ReceiptEvent[];
  search_date: string | null;           // literature: date the search was run
  fulltext_received_date: string | null; // literature: date full text obtained
  seriousness: boolean | null;           // from Seriousness Agent; null = unknown
  region: RegionConfig;
  reporter_policy: ReporterPolicy;
}

export interface CriterionOutput {
  name: string;
  first_available: string | null;
  event_id: string | null;
  evidence: string | null;
}

export interface FollowupClockStart {
  event_id: string;
  date: string;
  reason: string | null;
  due_if_serious: string | null;
}

export interface Agent17Output {
  trace_id: string;
  caseId: string;
  input_sha256: string;
  valid_icsr: boolean;
  day_zero: string | null;
  day_zero_basis: string;
  missing_criteria: string[];
  criteria: CriterionOutput[];
  due_date_serious: string | null;
  due_date_nonserious: string | null;
  applicable_due_date: string | null;
  followup_clock_starts: FollowupClockStart[];
  flags: string[];
  execution_tier: 'HEURISTIC' | 'LOCAL' | 'CLOUD' | 'DLQ';
  model_name: string;
  model_hash: string;
  total_latency_ms: number;
}

// Date utility
function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

function grounded(evidence: string | null, source: string): boolean {
  if (!evidence) return false;
  return source.includes(evidence);
}

// ============================================================================
// AGENT 17 IMPLEMENTATION
// ============================================================================

export class ClockStartAgent extends BaseAgent {
  constructor(config: {
    tenant_id: string;
    inference_router: HybridInferenceRouter;
    audit_ledger: AuditLedgerService;
    zdr_store: ZDRStore;
  }) {
    super({
      agent_id: 'agent-17-clock-start',
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
      agent_id: 'agent-17-clock-start',
      name: 'Clock Start Date (Day Zero) Agent',
      description: 'Computes day zero and regulatory due dates per GVP Module VI.B.7 and literature rules (VI App2)',
      input_schema: {
        type: 'object',
        properties: {
          caseId: { type: 'string' },
          source_type: { type: 'string', enum: ['spontaneous', 'solicited', 'clinical_trial', 'literature_global', 'literature_local', 'regulator', 'partner', 'digital_media'] },
          receipts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                event_id: { type: 'string' },
                date: { type: 'string', format: 'date' },
                received_by: { type: 'string', enum: ['mah', 'affiliate', 'contractor', 'partner'] },
                text: { type: 'string' },
              },
              required: ['event_id', 'date', 'received_by', 'text'],
            },
          },
          search_date: { type: ['string', 'null'], format: 'date' },
          fulltext_received_date: { type: ['string', 'null'], format: 'date' },
          seriousness: { type: ['boolean', 'null'] },
          region: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              serious_days: { type: 'number' },
              nonserious_days: { type: ['number', 'null'] },
            },
            required: ['name', 'serious_days'],
          },
          reporter_policy: { type: 'string', enum: ['any_one', 'name_or_initials_and_qualification'] },
        },
        required: ['caseId', 'source_type', 'receipts', 'region'],
      },
      output_schema: {
        type: 'object',
        properties: {
          trace_id: { type: 'string' },
          caseId: { type: 'string' },
          input_sha256: { type: 'string' },
          valid_icsr: { type: 'boolean' },
          day_zero: { type: ['string', 'null'], format: 'date' },
          day_zero_basis: { type: 'string' },
          missing_criteria: { type: 'array', items: { type: 'string' } },
          criteria: { type: 'array', items: { type: 'object' } },
          due_date_serious: { type: ['string', 'null'], format: 'date' },
          due_date_nonserious: { type: ['string', 'null'], format: 'date' },
          applicable_due_date: { type: ['string', 'null'], format: 'date' },
          followup_clock_starts: { type: 'array', items: { type: 'object' } },
          flags: { type: 'array', items: { type: 'string' } },
          execution_tier: { type: 'string' },
          model_name: { type: 'string' },
          model_hash: { type: 'string' },
          total_latency_ms: { type: 'integer' },
        },
      },
      supported_tiers: ['HEURISTIC', 'LOCAL', 'CLOUD', 'DLQ'],
      required_services: ['audit-ledger', 'zdr-store'],
      estimated_latency_ms: 2000,
      max_concurrent: 20,
    };
  }

  async execute(input: AgentExecutionInput): Promise<AgentResult> {
    const startTime = Date.now();
    const inputPayload = input.payload as Agent17Input;

    try {
      const { caseId, source_type, receipts, search_date, fulltext_received_date, seriousness, region, reporter_policy } = inputPayload;

      // Compute input hash
      const input_sha256 = createHash('sha256').update(JSON.stringify(inputPayload)).digest('hex');

      // Heuristic: evaluate criteria for each receipt
      const criteriaByEvent = new Map<string, CriterionAssessment>();

      for (const receipt of receipts) {
        criteriaByEvent.set(receipt.event_id, this.evaluateCriteriaHeuristic(receipt.text, reporter_policy));
      }

      // Track first availability of each criterion
      const first: Record<string, { date: string; event_id: string; evidence: string }> = {};
      const criteriaNames = ['reporter', 'patient', 'product', 'reaction'];
      const flags: string[] = [];

      for (const receipt of receipts) {
        const assessment = criteriaByEvent.get(receipt.event_id);
        if (!assessment) {
          flags.push(`NO_READ: No extraction for ${receipt.event_id}`);
          continue;
        }

        let effDate = receipt.date;

        // Literature rules (GVP VI App2)
        if (source_type === 'literature_global') {
          if (assessment.in_abstract_only && search_date) {
            effDate = search_date;
          } else if (fulltext_received_date) {
            effDate = fulltext_received_date;
          } else if (!search_date) {
            flags.push('LIT_DATE_MISSING: Literature case without search/full-text date');
          }
        } else if (source_type === 'literature_local' && fulltext_received_date) {
          flags.push('LOCAL_LIT_AMBIGUOUS: Local-literature day zero is interpreted differently by authorities; confirm policy');
        }

        // Check each criterion
        const checks: Record<string, { ok: boolean; evidence: string | null }> = {
          reporter: { ok: this.reporterOk(assessment, reporter_policy), evidence: assessment.reporter.present ? assessment.reporter.evidence : null },
          patient: { ok: assessment.patient.present, evidence: assessment.patient.evidence },
          product: { ok: assessment.product.present, evidence: assessment.product.evidence },
          reaction: { ok: assessment.reaction.present, evidence: assessment.reaction.evidence },
        };

        for (const [name, check] of Object.entries(checks)) {
          if (!check.ok) continue;
          if (!grounded(check.evidence, receipt.text)) {
            flags.push(`UNGROUNDED: ${name} evidence not found verbatim in ${receipt.event_id}; ignored`);
            continue;
          }
          if (!first[name] || effDate < first[name].date) {
            first[name] = { date: effDate, event_id: receipt.event_id, evidence: check.evidence! };
          }
        }
      }

      // Build criteria output
      const criteriaOutput: CriterionOutput[] = criteriaNames.map(name => ({
        name,
        first_available: first[name]?.date || null,
        event_id: first[name]?.event_id || null,
        evidence: first[name]?.evidence || null,
      }));

      const missing = criteriaNames.filter(name => !first[name]);

      // Determine validity
      const valid_icsr = missing.length === 0;

      if (!valid_icsr) {
        const output: Agent17Output = {
          trace_id: `trc_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 8)}`,
          caseId,
          input_sha256,
          valid_icsr: false,
          day_zero: null,
          day_zero_basis: 'Incomplete: follow up for missing criteria; clock not started.',
          missing_criteria: missing,
          criteria: criteriaOutput,
          due_date_serious: null,
          due_date_nonserious: null,
          applicable_due_date: null,
          followup_clock_starts: [],
          flags: [...flags, `INVALID_ICSR: Missing: ${missing.join(', ')}`],
          execution_tier: 'HEURISTIC',
          model_name: 'heuristic-day-zero-v1',
          model_hash: 'heuristic-deterministic',
          total_latency_ms: Date.now() - startTime,
        };
        return this.createResult(true, output, Date.now() - startTime);
      }

      // Day zero = date the LAST missing criterion became available
      const day_zero = criteriaNames.reduce((latest, name) => {
        const date = first[name]?.date;
        return !date || date > latest ? date : latest;
      }, '0000-00-00');

      let day_zero_basis = 'Date minimum criteria became available to any MAH personnel/contractor (GVP VI.B.7); criteria may be assembled across contacts.';
      if (source_type === 'literature_global') {
        day_zero_basis += ' Literature: search date if criteria in abstract, else full-text receipt (VI App2).';
      }
      if (source_type === 'regulator') {
        flags.push('REG_SOURCE: Confirm day zero = receipt from authority, not authority\'s own date');
      }

      // Due dates
      const due_date_serious = addDays(day_zero, region.serious_days);
      const due_date_nonserious = region.nonserious_days !== null ? addDays(day_zero, region.nonserious_days) : null;

      let applicable_due_date: string | null = null;
      if (seriousness === true) {
        applicable_due_date = due_date_serious;
      } else if (seriousness === false) {
        applicable_due_date = due_date_nonserious;
      } else {
        flags.push('SERIOUSNESS_UNKNOWN: Both due dates given; apply the earlier until seriousness is assessed');
      }

      // Follow-up clock starts
      const followup_clock_starts: FollowupClockStart[] = [];
      for (const receipt of receipts) {
        const assessment = criteriaByEvent.get(receipt.event_id);
        if (assessment && assessment.is_followup_significant && receipt.date > day_zero) {
          followup_clock_starts.push({
            event_id: receipt.event_id,
            date: receipt.date,
            reason: assessment.followup_reason,
            due_if_serious: addDays(receipt.date, region.serious_days),
          });
        }
      }

      const output: Agent17Output = {
        trace_id: `trc_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 8)}`,
        caseId,
        input_sha256,
        valid_icsr: true,
        day_zero,
        day_zero_basis,
        missing_criteria: [],
        criteria: criteriaOutput,
        due_date_serious,
        due_date_nonserious,
        applicable_due_date,
        followup_clock_starts,
        flags,
        execution_tier: 'HEURISTIC',
        model_name: 'heuristic-day-zero-v1',
        model_hash: 'heuristic-deterministic',
        total_latency_ms: Date.now() - startTime,
      };

      return this.createResult(true, output, Date.now() - startTime);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createResult(false, null, Date.now() - startTime, errorMessage);
    }
  }

  private reporterOk(assessment: CriterionAssessment, policy: ReporterPolicy): boolean {
    if (!assessment.reporter.present) return false;
    if (policy === 'any_one') return true;
    return assessment.reporter.reporter_has_name_or_initials && assessment.reporter.reporter_has_qualification;
  }

  private evaluateCriteriaHeuristic(text: string, policy: ReporterPolicy): CriterionAssessment {
    const lower = text.toLowerCase();

    // Reporter: look for qualification keywords or reporter indicators
    const reporterKeywords = ['reported by', 'informed by', 'notified by', 'physician', 'doctor', 'pharmacist', 'nurse', 'consumer', 'patient', 'relative', 'lawyer'];
    const reporter_present = reporterKeywords.some(kw => lower.includes(kw));
    const reporter_has_qualification = /\b(physician|doctor|dr\.|pharmacist|nurse|lawyer|attorney)\b/i.test(text);
    const reporter_has_name_or_initials = /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(text) || /\b[A-Z]\.\s*[A-Z]\.\b/.test(text);
    const reporter_evidence = reporter_present ? text.substring(0, 200) : null;

    // Patient: look for patient identifiers
    const patientKeywords = ['patient', 'subject', 'case', 'male', 'female', 'year old', 'years old', 'age', 'initials'];
    const patient_present = patientKeywords.some(kw => lower.includes(kw));
    const patient_evidence = patient_present ? text.substring(0, 200) : null;

    // Product: look for drug names or medication terms
    const productKeywords = ['drug', 'medication', 'medicine', 'treatment', 'therapy', 'product', 'substance', 'mg', 'tablet', 'capsule'];
    const product_present = productKeywords.some(kw => lower.includes(kw));
    const product_evidence = product_present ? text.substring(0, 200) : null;

    // Reaction: look for adverse event terms
    const reactionKeywords = ['adverse', 'reaction', 'event', 'side effect', 'toxicity', 'allergy', 'hypersensitivity', 'overdose', 'nausea', 'vomiting', 'rash', 'headache', 'dizziness'];
    const reaction_present = reactionKeywords.some(kw => lower.includes(kw));
    const reaction_evidence = reaction_present ? text.substring(0, 200) : null;

    // Follow-up significance
    const followupKeywords = ['new information', 'additional', 'follow-up', 'update', 'supplement', 'amendment', 'seriousness changed', 'new reaction', 'new drug'];
    const is_followup_significant = followupKeywords.some(kw => lower.includes(kw));
    let followup_reason: string | null = null;
    if (lower.includes('new reaction')) followup_reason = 'new_reaction';
    else if (lower.includes('new drug') || lower.includes('new suspect')) followup_reason = 'new_suspect';
    else if (lower.includes('seriousness')) followup_reason = 'seriousness_change';
    else if (lower.includes('outcome')) followup_reason = 'outcome';
    else if (lower.includes('dechallenge')) followup_reason = 'dechallenge';
    else if (is_followup_significant) followup_reason = 'other';

    return {
      reporter: { present: reporter_present, evidence: reporter_evidence, reporter_has_qualification, reporter_has_name_or_initials },
      patient: { present: patient_present, evidence: patient_evidence },
      product: { present: product_present, evidence: product_evidence },
      reaction: { present: reaction_present, evidence: reaction_evidence },
      in_abstract_only: false,
      is_followup_significant,
      followup_reason,
    };
  }

  private createResult(success: boolean, output: Agent17Output | null, executionTime: number, error?: string): AgentResult {
    return {
      success,
      agent_id: 'agent-17-clock-start',
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

export function createClockStartAgent(config: {
  tenant_id: string;
  inference_router: HybridInferenceRouter;
  audit_ledger: AuditLedgerService;
  zdr_store: ZDRStore;
}): ClockStartAgent {
  return new ClockStartAgent(config);
}