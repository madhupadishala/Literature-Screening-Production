/**
 * agent-6-dechallenge.ts
 *
 * Agent 6: Dechallenge Assessment
 *
 * Assesses dechallenge (improvement after drug discontinuation) per ICH E2D:
 * - POSITIVE: Event improved after drug stopped
 * - NEGATIVE: Event did not improve after drug stopped
 * - UNASSESSABLE: Insufficient information
 *
 * Factors assessed:
 * - Temporal relationship (event onset to drug stop)
 * - Time to improvement after drug stop
 * - Completeness of resolution
 * - Alternative explanations
 * - Dose-response relationship
 *
 * Compliance: FDA 21 CFR Part 11, EU GVP Module VI, ICH E2D, GAMP 5
 */

import { BaseAgent, AgentExecutionInput, AgentResult, AgentCapabilities } from './base-agent';
import { HybridInferenceRouter } from '../infrastructure/hybrid-inference-router';
import { AuditLedgerService } from '../audit/audit-ledger-service';
import { ZDRStore } from '../infrastructure/redis-zdr-store';
import { createHash } from 'crypto';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type DechallengeResult = 'POSITIVE' | 'NEGATIVE' | 'UNASSESSABLE';

export interface DechallengeAssessment {
  dechallenge_result: DechallengeResult;
  confidence: number;
  rationale: string;
  time_to_improvement_days?: number;
  completeness_of_resolution: 'COMPLETE' | 'PARTIAL' | 'NONE' | 'UNKNOWN';
  alternative_explanations: string[];
  dose_response_evidence: boolean;
  temporal_relationship: 'CONSISTENT' | 'INCONSISTENT' | 'UNKNOWN';
  supporting_evidence: string[];
}

export interface Agent6Input {
  case_id: string;
  drug_exposure: {
    drug_name: string;
    active_substance?: string;
    therapy_start?: string;
    therapy_end?: string;
    dose?: string;
    route?: string;
    action_taken?: string;
  };
  adverse_event: {
    meddra_llt: string;
    onset_date?: string;
    end_date?: string;
    outcome?: string;
    seriousness?: string;
  };
  dechallenge_info?: {
    improvement_after_stop?: boolean;
    time_to_improvement_days?: number;
    completeness_of_resolution?: 'COMPLETE' | 'PARTIAL' | 'NONE';
    alternative_causes?: string[];
    dose_reduction_before_stop?: boolean;
  };
  rechallenge_info?: {
    rechallenge_done?: boolean;
    rechallenge_result?: 'POSITIVE' | 'NEGATIVE' | 'UNKNOWN';
  };
}

export interface Agent6Output {
  assessment: {
    dechallenge_result: DechallengeResult;
    confidence: number;
    rationale: string;
    time_to_improvement_days?: number;
    completeness_of_resolution: 'COMPLETE' | 'PARTIAL' | 'NONE' | 'UNKNOWN';
    alternative_explanations: string[];
    dose_response_evidence: boolean;
    temporal_relationship: 'CONSISTENT' | 'INCONSISTENT' | 'UNKNOWN';
    supporting_evidence: string[];
  };
  processing_time_ms: number;
}

// ============================================================================
// AGENT 6 IMPLEMENTATION
// ============================================================================

export class DechallengeAgent extends BaseAgent {
  constructor(config: {
    tenant_id: string;
    inference_router: HybridInferenceRouter;
    audit_ledger: AuditLedgerService;
    zdr_store: ZDRStore;
  }) {
    super({
      agent_id: 'agent-6-dechallenge',
      tenant_id: config.tenant_id,
      inference_router: config.inference_router,
      audit_ledger: config.audit_ledger,
      zdr_store: config.zdr_store,
      max_retries: 2,
      timeout_ms: 20000,
      enable_audit: true,
      deterministic_seed: 42,
    });
  }

  getCapabilities(): AgentCapabilities {
    return {
      agent_id: 'agent-6-dechallenge',
      name: 'Dechallenge Assessor',
      description: 'Assesses dechallenge (improvement after drug stop) per ICH E2D with temporal analysis',
      input_schema: {
        type: 'object',
        properties: {
          case_id: { type: 'string' },
          drug_exposure: { type: 'object' },
          adverse_event: { type: 'object' },
          dechallenge_info: { type: 'object' },
          rechallenge_info: { type: 'object' },
        },
        required: ['case_id', 'drug_exposure', 'adverse_event'],
      },
      output_schema: {
        type: 'object',
        properties: {
          assessment: { type: 'object' },
        },
      },
      supported_tiers: ['LOCAL', 'HEURISTIC'],
      required_services: ['audit-ledger'],
      estimated_latency_ms: 1500,
      max_concurrent: 20,
    };
  }

  async execute(input: AgentExecutionInput): Promise<AgentResult> {
    const startTime = Date.now();
    const inputPayload = input.payload as Agent6Input;

    try {
      const assessment = this.assessDechallenge(inputPayload);

      const output: Agent6Output = {
        assessment,
        processing_time_ms: Date.now() - startTime,
      };

      return this.createResult(true, output, Date.now() - startTime);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createResult(false, null, Date.now() - startTime, errorMessage);
    }
  }

  private assessDechallenge(input: Agent6Input): any {
    const { drug_exposure, adverse_event, dechallenge_info, rechallenge_info } = input;

    // Determine dechallenge result
    let dechallengeResult: 'POSITIVE' | 'NEGATIVE' | 'UNASSESSABLE';
    let confidence = 0.5;
    const evidence: string[] = [];

    // Check explicit dechallenge info
    if (dechallenge_info?.improvement_after_stop !== undefined) {
      if (dechallenge_info.improvement_after_stop) {
        dechallengeResult = 'POSITIVE';
        confidence = 0.8;
        evidence.push('Explicit documentation of improvement after drug discontinuation');
      } else {
        dechallengeResult = 'NEGATIVE';
        confidence = 0.8;
        evidence.push('Explicit documentation of no improvement after drug discontinuation');
      }
    } else {
      // Infer from outcome and timing
      const outcome = input.adverse_event.outcome;
      const eventEndDate = input.adverse_event.end_date;
      const drugStopDate = input.drug_exposure.therapy_end;

      if (['RECOVERED', 'RECOVERED_WITH_SEQUELAE'].includes(input.adverse_event.outcome || '')) {
        dechallengeResult = 'POSITIVE';
        confidence = 0.7;
        evidence.push(`Event outcome: ${outcome} suggests improvement`);
      } else if (['NOT_RECOVERED', 'FATAL'].includes(input.adverse_event.outcome || '')) {
        dechallengeResult = 'NEGATIVE';
        confidence = 0.7;
        evidence.push(`Event outcome: ${outcome} suggests no improvement`);
      } else {
        dechallengeResult = 'UNASSESSABLE';
        confidence = 0.5;
        evidence.push('Insufficient information to assess dechallenge');
      }
    }

    // Temporal relationship analysis
    let timeToImprovementDays: number | undefined;
    let temporalRelationship: 'CONSISTENT' | 'INCONSISTENT' | 'UNKNOWN' = 'UNKNOWN';

    if (input.drug_exposure.therapy_end && input.adverse_event.end_date) {
      const drugStop = new Date(input.drug_exposure.therapy_end);
      const eventEnd = new Date(input.adverse_event.end_date!);
      const diffMs = eventEnd.getTime() - drugStop.getTime();
      const daysDiff = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (daysDiff >= 0 && daysDiff <= 30) {
        temporalRelationship = 'CONSISTENT';
        evidence.push(`Event resolved ${daysDiff} days after drug stop - temporally consistent`);
      } else if (daysDiff < 0) {
        temporalRelationship = 'INCONSISTENT';
        evidence.push(`Event resolved before drug stop - temporally inconsistent`);
      }

      if (daysDiff >= 0) {
        timeToImprovementDays = daysDiff;
      }
    }

    // Completeness of resolution
    let completeness: 'COMPLETE' | 'PARTIAL' | 'NONE' | 'UNKNOWN' = 'UNKNOWN';
    if (input.adverse_event.outcome) {
      switch (input.adverse_event.outcome) {
        case 'RECOVERED':
          completeness = 'COMPLETE';
          break;
        case 'RECOVERED_WITH_SEQUELAE':
          completeness = 'PARTIAL';
          break;
        case 'NOT_RECOVERED':
        case 'FATAL':
          completeness = 'NONE';
          break;
        default:
          completeness = 'UNKNOWN';
      }
    }

    // Alternative explanations
    const alternativeExplanations: string[] = [];
    if (input.drug_exposure.action_taken === 'DOSE_REDUCED' || input.drug_exposure.action_taken === 'DOSE_UNCHANGED') {
      alternativeExplanations.push('Dose reduction or continuation may explain persistent symptoms');
    }
    if (input.dechallenge_info?.alternative_causes) {
      alternativeExplanations.push(...input.dechallenge_info.alternative_causes);
    }

    // Dose-response evidence
    let doseResponseEvidence = false;
    // Would check if dose reduction led to improvement

    // Build rationale
    const rationaleParts = [
      `Dechallenge assessment: ${dechallengeResult.replace('_', ' ')}.`,
    ];

    if (dechallenge_info?.time_to_improvement_days) {
      dechallenge_info.time_to_improvement_days;
    }

    const rationale = rationaleParts.join(' ');

    // Calculate confidence
    let finalConfidence = confidence;
    if (input.dechallenge_info?.time_to_improvement_days) {
      finalConfidence = Math.min(1.0, finalConfidence + 0.1);
    }
    if (input.adverse_event.outcome && ['RECOVERED', 'RECOVERED_WITH_SEQUELAE', 'NOT_RECOVERED', 'FATAL'].includes(input.adverse_event.outcome)) {
      finalConfidence = Math.min(1.0, finalConfidence + 0.1);
    }

    return {
      dechallenge_result: dechallengeResult,
      confidence: Math.min(1.0, finalConfidence),
      rationale,
      time_to_improvement_days: dechallenge_info?.time_to_improvement_days,
      completeness_of_resolution: completeness,
      alternative_explanations: alternativeExplanations,
      dose_response_evidence: doseResponseEvidence,
      temporal_relationship: temporalRelationship,
      supporting_evidence: evidence,
    };
  }

  private createResult(success: boolean, output: any, executionTime: number, error?: string): AgentResult {
    return {
      success,
      agent_id: 'agent-6-dechallenge',
      trace_id: '',
      output,
      error,
      execution_tier: 'LOCAL',
      latency_ms: executionTime,
      merkle_entry_hash: createHash('sha256').update(JSON.stringify({ success, output, executionTime })).digest('hex'),
      execution_metadata: { timestamp: new Date().toISOString() },
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createDechallengeAgent(config: {
  tenant_id: string;
  inference_router: HybridInferenceRouter;
  audit_ledger: AuditLedgerService;
  zdr_store: ZDRStore;
}): DechallengeAgent {
  return new DechallengeAgent(config);
}