/**
 * agent-5-action-taken.ts
 *
 * Agent 5: Action Taken Assessment
 *
 * Assesses the action taken with the suspect drug per ICH E2B R3:
 * - DRUG_WITHDRAWN
 * - DOSE_REDUCED
 * - DOSE_INCREASED
 * - DOSE_UNCHANGED
 * - UNKNOWN
 *
 * Also assesses:
 * - Time to action after event onset
 * - Whether action was appropriate per clinical guidelines
 * - Rechallenge/dechallenge correlation
 *
 * Compliance: FDA 21 CFR Part 11, EU GVP Module VI, ICH E2B R3, GAMP 5
 */

import { BaseAgent, AgentExecutionInput, AgentResult, AgentCapabilities } from './base-agent';
import { HybridInferenceRouter } from '../infrastructure/hybrid-inference-router';
import { AuditLedgerService } from '../audit/audit-ledger-service';
import { ZDRStore } from '../infrastructure/redis-zdr-store';
import { createHash } from 'crypto';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type ActionTakenType =
  | 'DRUG_WITHDRAWN'
  | 'DOSE_REDUCED'
  | 'DOSE_INCREASED'
  | 'DOSE_UNCHANGED'
  | 'UNKNOWN';

export interface ActionTakenAssessment {
  action_taken: ActionTakenType;
  confidence: number;
  rationale: string;
  time_to_action_days?: number;
  appropriate_per_guidelines: boolean;
  guideline_reference?: string;
  supporting_evidence: string[];
  dechallenge_correlation?: 'CONSISTENT' | 'INCONSISTENT' | 'NOT_ASSESSABLE';
  rechallenge_correlation?: 'CONSISTENT' | 'INCONSISTENT' | 'NOT_ASSESSABLE';
}

export interface Agent5Input {
  case_id: string;
  drug_exposure: {
    drug_name: string;
    active_substance?: string;
    dose?: string;
    route?: string;
    frequency?: string;
    therapy_start?: string;
    therapy_end?: string;
    action_taken?: string;
    rechallenge?: 'YES' | 'NO' | 'UNKNOWN';
    dechallenge?: 'POSITIVE' | 'NEGATIVE' | 'UNASSESSABLE';
  };
  adverse_event: {
    meddra_llt: string;
    onset_date?: string;
    outcome?: string;
    seriousness?: string;
  };
  dechallenge_result?: 'POSITIVE' | 'NEGATIVE' | 'UNASSESSABLE';
  rechallenge_result?: 'POSITIVE' | 'NEGATIVE' | 'UNASSESSABLE';
  clinical_guidelines?: Array<{
    drug_class: string;
    recommended_action: string;
    evidence_level: 'A' | 'B' | 'C' | 'D';
  }>;
}

export interface Agent5Output {
  assessment: ActionTakenAssessment;
  processing_time_ms: number;
}

// ============================================================================
// AGENT 5 IMPLEMENTATION
// ============================================================================

export class ActionTakenAgent extends BaseAgent {
  constructor(config: {
    tenant_id: string;
    inference_router: HybridInferenceRouter;
    audit_ledger: AuditLedgerService;
    zdr_store: ZDRStore;
  }) {
    super({
      agent_id: 'agent-5-action-taken',
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
      agent_id: 'agent-5-action-taken',
      name: 'Action Taken Assessor',
      description: 'Assesses action taken with suspect drug per ICH E2B R3 and correlates with dechallenge/rechallenge',
      input_schema: {
        type: 'object',
        properties: {
          case_id: { type: 'string' },
          drug_exposure: { type: 'object' },
          adverse_event: { type: 'object' },
          dechallenge_result: { type: 'string', enum: ['POSITIVE', 'NEGATIVE', 'UNASSESSABLE'] },
          rechallenge_result: { type: 'string', enum: ['POSITIVE', 'NEGATIVE', 'UNASSESSABLE'] },
          clinical_guidelines: { type: 'array' },
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
    const inputPayload = input.payload as Agent5Input;

    try {
      const assessment = this.assessActionTaken(inputPayload);

      const output: Agent5Output = {
        assessment,
        processing_time_ms: Date.now() - startTime,
      };

      return this.createResult(true, output, Date.now() - startTime);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createResult(false, null, Date.now() - startTime, errorMessage);
    }
  }

  private assessActionTaken(input: Agent5Input): ActionTakenAssessment {
    const { drug_exposure, adverse_event, dechallenge_result, rechallenge_result, clinical_guidelines } = input;

    // Determine action taken from drug exposure or infer
    let actionTaken: ActionTakenType = drug_exposure.action_taken as ActionTakenType || 'UNKNOWN';

    // Normalize action taken
    const normalizedAction = this.normalizeActionTaken(actionTaken);

    // Calculate time to action
    let timeToActionDays: number | null = null;
    if (drug_exposure.therapy_end && adverse_event.onset_date) {
      const eventDate = new Date(adverse_event.onset_date);
      const actionDate = new Date(drug_exposure.therapy_end);
      const diffMs = actionDate.getTime() - eventDate.getTime();
      timeToActionDays = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
    }

    // Assess appropriateness per guidelines
    const guidelineAssessment = this.assessGuidelineAppropriateness(
      normalizedAction,
      input.adverse_event,
      input.clinical_guidelines
    );

    // Correlate with dechallenge
    const dechallengeCorrelation = this.correlateWithDechallenge(
      normalizedAction,
      input.dechallenge_result,
      input.adverse_event
    );

    // Correlate with rechallenge
    const rechallengeCorrelation = this.correlateWithRechallenge(
      normalizedAction,
      input.rechallenge_result
    );

    // Build rationale
    const rationale = this.buildRationale(
      normalizedAction,
      timeToActionDays,
      guidelineAssessment.appropriate,
      dechallengeCorrelation,
      rechallengeCorrelation
    );

    // Determine confidence based on evidence
    const confidence = this.calculateConfidence(
      input.drug_exposure.action_taken ? 1 : 0,
      guidelineAssessment.appropriate,
      input.dechallenge_result ? 1 : 0,
      input.rechallenge_result ? 1 : 0
    );

    return {
      action_taken: normalizedAction,
      confidence,
      rationale,
      time_to_action_days: timeToActionDays,
      appropriate_per_guidelines: guidelineAssessment.appropriate,
      guideline_reference: guidelineAssessment.reference,
      supporting_evidence: guidelineAssessment.evidence,
      dechallenge_correlation: dechallengeCorrelation,
      rechallenge_correlation: rechallengeCorrelation,
    };
  }

  private normalizeActionTaken(action: string): ActionTakenType {
    const normalized = action.toUpperCase().replace(/[\s-]/g, '_');
    const validActions: ActionTakenType[] = ['DRUG_WITHDRAWN', 'DOSE_REDUCED', 'DOSE_INCREASED', 'DOSE_UNCHANGED', 'UNKNOWN'];
    return validActions.includes(normalized as ActionTakenType) ? normalized as ActionTakenType : 'UNKNOWN';
  }

  private assessGuidelineAppropriateness(
    action: ActionTakenType,
    adverseEvent: any,
    guidelines: Agent5Input['clinical_guidelines']
  ): { appropriate: boolean; reference?: string; evidence: string[] } {
    if (!guidelines || guidelines.length === 0) {
      // Default assessment based on action and event seriousness
      const isSerious = adverseEvent.seriousness === 'SERIOUS' ||
        ['DEATH', 'LIFE_THREATENING', 'HOSPITALIZATION', 'DISABILITY', 'CONGENITAL_ANOMALY', 'MEDICALLY_SIGNIFICANT']
          .some(c => adverseEvent.seriousness_criteria?.includes(c));

      // For serious events, withdrawal is generally appropriate
      if (isSerious && action === 'DRUG_WITHDRAWN') {
        return { appropriate: true, evidence: ['Serious event warrants drug withdrawal per standard practice'] };
      }

      // For serious events, continuing dose unchanged is inappropriate
      if (isSerious && action === 'DOSE_UNCHANGED') {
        return { appropriate: false, evidence: ['Serious event with no action taken (dose unchanged) is not aligned with guidelines'] };
      }

      // Dose reduction may be appropriate for non-serious events
      if (!isSerious && ['DOSE_REDUCED', 'DOSE_UNCHANGED'].includes(action)) {
        return { appropriate: true, evidence: ['Non-serious event may allow dose continuation or reduction'] };
      }

      return { appropriate: false, evidence: ['No specific guideline match found'] };
    }

    // Match against provided guidelines
    for (const guideline of guidelines) {
      if (guideline.recommended_action.toUpperCase().replace(/\s+/g, '_') === action) {
        return {
          appropriate: true,
          reference: `Guideline: ${guideline.drug_class}, Evidence Level: ${guideline.evidence_level}`,
          evidence: [`Matched guideline for ${guideline.drug_class}`],
        };
      }
    }

    // For serious events with no matching guideline, continuing dose unchanged is inappropriate
    const isSerious = adverseEvent.seriousness === 'SERIOUS' ||
      ['DEATH', 'LIFE_THREATENING', 'HOSPITALIZATION', 'DISABILITY', 'CONGENITAL_ANOMALY', 'MEDICALLY_SIGNIFICANT']
        .some(c => adverseEvent.seriousness_criteria?.includes(c));

    if (isSerious && action === 'DOSE_UNCHANGED') {
      return { appropriate: false, evidence: ['Serious event with no action taken (dose unchanged) is not aligned with guidelines'] };
    }

    return { appropriate: false, evidence: ['No matching guideline found'] };
  }

  private correlateWithDechallenge(
    action: ActionTakenType,
    dechallengeResult?: 'POSITIVE' | 'NEGATIVE' | 'UNASSESSABLE',
    adverseEvent?: any
  ): 'CONSISTENT' | 'INCONSISTENT' | 'NOT_ASSESSABLE' {
    if (!dechallengeResult || dechallengeResult === 'UNASSESSABLE') {
      return 'NOT_ASSESSABLE';
    }

    const isSerious = adverseEvent?.seriousness === 'SERIOUS';

    // Withdrawal + positive dechallenge = consistent
    if (action === 'DRUG_WITHDRAWN' && dechallengeResult === 'POSITIVE') {
      return 'CONSISTENT';
    }

    // Dose reduction + positive dechallenge = consistent
    if (action === 'DOSE_REDUCED' && dechallengeResult === 'POSITIVE') {
      return 'CONSISTENT';
    }

    // No action + negative dechallenge
    if (action === 'DOSE_UNCHANGED' && dechallengeResult === 'NEGATIVE') {
      // For serious events, continuing drug when event didn't improve is inconsistent
      if (isSerious) {
        return 'INCONSISTENT';
      }
      return 'CONSISTENT'; // For non-serious, event persisted as expected
    }

    // Withdrawal + negative dechallenge = inconsistent (event didn't improve)
    if (action === 'DRUG_WITHDRAWN' && dechallengeResult === 'NEGATIVE') {
      return 'INCONSISTENT';
    }

    return 'NOT_ASSESSABLE';
  }

  private correlateWithRechallenge(
    action: ActionTakenType,
    rechallengeResult?: 'POSITIVE' | 'NEGATIVE' | 'UNASSESSABLE'
  ): 'CONSISTENT' | 'INCONSISTENT' | 'NOT_ASSESSABLE' {
    if (!rechallengeResult || rechallengeResult === 'UNASSESSABLE') {
      return 'NOT_ASSESSABLE';
    }

    // Rechallenge positive + withdrawal = inconsistent (shouldn't restart if withdrawn)
    if (action === 'DRUG_WITHDRAWN' && rechallengeResult === 'POSITIVE') {
      return 'INCONSISTENT'; // Recurrence after restart supports causality but contradicts withdrawal
    }

    // Rechallenge positive + dose unchanged = consistent
    if (action === 'DOSE_UNCHANGED' && rechallengeResult === 'POSITIVE') {
      return 'CONSISTENT';
    }

    // Rechallenge negative = consistent with no causal relationship
    if (rechallengeResult === 'NEGATIVE') {
      return 'CONSISTENT';
    }

    return 'NOT_ASSESSABLE';
  }

  private buildRationale(
    action: ActionTakenType,
    timeToAction: number | undefined,
    guidelineAppropriate: boolean,
    dechallengeCorr: string,
    rechallengeCorr: string
  ): string {
    const parts: string[] = [];

    parts.push(`Action taken: ${action.replace('_', ' ')}.`);

    if (timeToAction !== undefined) {
      parts.push(`Action occurred ${timeToAction} day${timeToAction !== 1 ? 's' : ''} after event onset.`);
    }

    parts.push(`Guideline assessment: ${guidelineAppropriate ? 'Appropriate' : 'Not aligned with guidelines'}.`);

    if (dechallengeCorr !== 'NOT_ASSESSABLE') {
      parts.push(`Dechallenge correlation: ${dechallengeCorr.toLowerCase()}.`);
    }

    if (rechallengeCorr !== 'NOT_ASSESSABLE') {
      parts.push(`Rechallenge correlation: ${rechallengeCorr.toLowerCase()}.`);
    }

    return parts.join(' ');
  }

  private calculateConfidence(
    hasExplicitAction: number,
    guidelineAppropriate: boolean,
    hasDechallenge: number,
    hasRechallenge: number
  ): number {
    let confidence = 0.5; // Base

    if (hasExplicitAction) confidence += 0.2;
    if (guidelineAppropriate) confidence += 0.15;
    if (hasDechallenge) confidence += 0.1;
    if (hasRechallenge) confidence += 0.1;

    return Math.min(1.0, Math.max(0.0, confidence));
  }

  private createResult(success: boolean, output: any, executionTime: number, error?: string): AgentResult {
    return {
      success,
      agent_id: 'agent-5-action-taken',
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

export function createActionTakenAgent(config: {
  tenant_id: string;
  inference_router: HybridInferenceRouter;
  audit_ledger: AuditLedgerService;
  zdr_store: ZDRStore;
}): ActionTakenAgent {
  return new ActionTakenAgent(config);
}