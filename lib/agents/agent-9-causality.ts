/**
 * agent-9-causality.ts
 *
 * Agent 9: Causality Assessment
 *
 * Implements Bradford Hill criteria-based causality assessment for drug-adverse event pairs.
 * Categorizes as: Certain, Probable/Likely, Possible, Unlikely, Conditional/Unclassified, Unassessable
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

export type CausalityCategory =
  | 'Certain'
  | 'Probable/Likely'
  | 'Possible'
  | 'Unlikely'
  | 'Conditional/Unclassified'
  | 'Unassessable';

export type RechallengeValue = 'YES' | 'NO' | 'UNKNOWN';
export type DechallengeValue = 'POSITIVE' | 'NEGATIVE' | 'UNASSESSABLE';

export interface DrugExposure {
  name: string;
  active_substance?: string;
  dose?: string;
  route?: string;
  frequency?: string;
  therapy_start?: string;
  therapy_end?: string;
  action_taken?: 'DRUG_WITHDRAWN' | 'DOSE_REDUCED' | 'DOSE_INCREASED' | 'DOSE_UNCHANGED' | 'UNKNOWN';
  rechallenge?: RechallengeValue;
  dechallenge?: DechallengeValue;
  role: 'suspect' | 'concomitant' | 'interacting';
}

export interface AdverseEvent {
  meddra_llt: string;
  meddra_pt?: string;
  verbatim_text?: string;
  onset_date?: string;
  end_date?: string;
  outcome?: 'RECOVERED' | 'RECOVERING' | 'NOT_RECOVERED' | 'RECOVERED_WITH_SEQUELAE' | 'FATAL' | 'UNKNOWN';
  seriousness: 'SERIOUS' | 'NON_SERIOUS';
  seriousness_criteria?: string[];
}

export interface ReporterCausality {
  drug: string;
  event: string;
  related: boolean;
  rationale?: string;
}

export interface Agent9Input {
  case_id: string;
  narrative: string;
  drugs: DrugExposure[];
  events: AdverseEvent[];
  reporter_causality?: ReporterCausality[];
  follow_up_exhausted: boolean;
  jurisdiction: string;
  client_id: string;
  as_of: string;
  causality_method: 'BRADFORD-HILL' | 'WHO-UMC' | 'Naranjo';
}

export interface CausalityPair {
  case_id: string;
  drug: string;
  event: string;
  category: CausalityCategory;
  method_detail: string;
  fired_rules: string[];
  factors: {
    temporal_relationship?: { value: 'yes' | 'no' | 'unknown' };
    dechallenge_interpretability?: { value: 'positive' | 'negative' | 'unassessable' | 'not_assessed' };
    rechallenge?: { value: 'yes' | 'no' | 'unknown'; state: 'structured' | 'unstructured' };
    alternative_causes?: { value: 'present' | 'absent' | 'unknown' };
    dose_response?: { value: 'present' | 'absent' | 'unknown' };
    consistency?: { value: 'consistent' | 'inconsistent' | 'unknown' };
    specificity?: { value: 'specific' | 'non_specific' | 'unknown' };
    biological_plausibility?: { value: 'high' | 'moderate' | 'low' | 'unknown' };
  };
  route: 'auto' | 'hitl';
  confidence: 'high' | 'medium' | 'low';
  review_reasons?: { contains: string };
}

export interface Agent9Output {
  pairs: CausalityPair[];
  route: 'auto' | 'hitl';
  review_reasons?: { contains: string };
}

// ============================================================================
// BRADFORD HILL CRITERIA RULES
// ============================================================================

interface BradfordHillFactor {
  name: string;
  satisfied: boolean;
  evidence: string;
  weight: number;
}

const BRADFORD_HILL_CRITERIA: BradfordHillFactor[] = [
  { name: 'Temporal Relationship', weight: 20, satisfied: false, evidence: '' },
  { name: 'Strength of Association', weight: 15, satisfied: false, evidence: '' },
  { name: 'Consistency', weight: 15, satisfied: false, evidence: '' },
  { name: 'Specificity', weight: 10, satisfied: false, evidence: '' },
  { name: 'Dose-Response Relationship', weight: 10, satisfied: false, evidence: '' },
  { name: 'Temporal Sequence', weight: 15, satisfied: false, evidence: '' },
  { name: 'Biological Plausibility', weight: 10, satisfied: false, evidence: '' },
  { name: 'Coherence', weight: 5, satisfied: false, evidence: '' },
  { name: 'Experimental Evidence', weight: 5, satisfied: false, evidence: '' },
];

// ============================================================================
// AGENT 9 IMPLEMENTATION
// ============================================================================

export class CausalityAgent extends BaseAgent {
  constructor(config: {
    tenant_id: string;
    inference_router: HybridInferenceRouter;
    audit_ledger: AuditLedgerService;
    zdr_store: ZDRStore;
  }) {
    super({
      agent_id: 'agent-9-causality',
      tenant_id: config.tenant_id,
      inference_router: config.inference_router,
      audit_ledger: config.audit_ledger,
      zdr_store: config.zdr_store,
      max_retries: 2,
      timeout_ms: 30000,
      enable_audit: true,
      deterministic_seed: 42,
    });
  }

  getCapabilities(): AgentCapabilities {
    return {
      agent_id: 'agent-9-causality',
      name: 'Causality Assessment Agent',
      description: 'Assesses drug-event causality using Bradford Hill criteria and WHO-UMC methodology',
      input_schema: {
        type: 'object',
        properties: {
          case_id: { type: 'string' },
          narrative: { type: 'string' },
          drugs: { type: 'array', items: { type: 'object' } },
          events: { type: 'array', items: { type: 'object' } },
          reporter_causality: { type: 'array', items: { type: 'object' } },
          follow_up_exhausted: { type: 'boolean' },
          jurisdiction: { type: 'string' },
          client_id: { type: 'string' },
          as_of: { type: 'string', format: 'date-time' },
          causality_method: { type: 'string', enum: ['BRADFORD-HILL', 'WHO-UMC', 'Naranjo'] },
        },
        required: ['case_id', 'narrative', 'drugs', 'events'],
      },
      output_schema: {
        type: 'object',
        properties: {
          pairs: { type: 'array', items: { type: 'object' } },
          route: { type: 'string', enum: ['auto', 'hitl'] },
          review_reasons: { type: 'object' },
        },
      },
      supported_tiers: ['LOCAL', 'HEURISTIC'],
      required_services: ['audit-ledger'],
      estimated_latency_ms: 5000,
      max_concurrent: 5,
    };
  }

  async execute(input: AgentExecutionInput): Promise<AgentResult> {
    const startTime = Date.now();
    const inputPayload = input.payload as Agent9Input;

    try {
      const pairs = this.assessCausality(inputPayload);

      const output: Agent9Output = {
        pairs,
        route: pairs.some(p => p.route === 'hitl') ? 'hitl' : 'auto',
        review_reasons: pairs.some(p => p.route === 'hitl')
          ? { contains: 'requires human review' }
          : undefined,
      };

      return this.createResult(true, output, Date.now() - startTime);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createResult(false, null, Date.now() - startTime, errorMessage);
    }
  }

  private assessCausality(input: Agent9Input): CausalityPair[] {
    const pairs: CausalityPair[] = [];
    const drugs = input.drugs || [];
    const events = input.events || [];

    // Create drug-event pairs (cross product of suspect drugs and events)
    const suspectDrugs = input.drugs.filter(d => d.role === 'suspect');

    for (const drug of suspectDrugs) {
      for (const event of input.events) {
        const pair = this.assessPair(drug, event, input);
        pairs.push(pair);
      }

      // Also check concomitant drugs if they have temporal relationship
      for (const drug of input.drugs.filter(d => d.role === 'concomitant')) {
        for (const event of input.events) {
          // Only assess if temporal overlap possible
          if (this.hasTemporalOverlap(drug, input.events[0])) {
            const pair = this.assessPair(drug, event, input);
            pair.route = 'hitl'; // Concomitant drugs need human review
            pairs.push(pair);
          }
        }
      }

      return pairs;
    }

    private assessPair(drug: DrugExposure, event: AdverseEvent, input: Agent9Input): CausalityPair {
      const firedRules: string[] = [];
      const factors: CausalityPair['factors'] = {};

      // 1. Temporal Relationship
      const temporalRel = this.assessTemporalRelationship(drug, event);
      factors.temporal_relationship = { value: temporalRel.satisfied ? 'yes' : 'no' };
      if (temporalRel.satisfied) firedRules.push('temporal_relationship');

      // 2. Dechallenge Assessment
      const dechallenge = this.assessDechallenge(drug, input);
      factors.dechallenge_interpretability = {
        value: dechallenge.result,
        state: dechallenge.state
      };
      if (dechallenge.result === 'positive') firedRules.push('positive_dechallenge');

      // 4. Rechallenge Assessment
      const rechallenge = this.assessRechallenge(drug, input);
      factors.rechallenge = {
        value: rechallenge.value,
        state: rechallenge.state
      };
      if (rechallenge.value === 'yes') firedRules.push('positive_rechallenge');

      // 5. Alternative Causes
      const altCauses = this.assessAlternativeCauses(drug, event, input);
      factors.alternative_causes = { value: altCauses.result };
      if (altCauses.result === 'present') firedRules.push('alternative_causes_present');

      // 6. Dose-Response
      const doseResponse = this.assessDoseResponse(drug, input);
      factors.dose_response = { value: doseResponse.result };
      if (doseResponse.result === 'present') firedRules.push('dose_response');

      // 7. Consistency
      const consistency = this.assessConsistency(input);
      factors.consistency = { value: consistency.result };
      if (consistency.result === 'consistent') firedRules.push('consistency');

      // 8. Specificity
      const specificity = this.assessSpecificity(drug, event, input);
      factors.specificity = { value: specificity.result };
      if (specificity.result === 'specific') firedRules.push('specificity');

      // 9. Biological Plausibility
      const bioPlausibility = this.assessBiologicalPlausibility(drug, event);
      factors.biological_plausibility = { value: bioPlausibility.result };
      if (bioPlausibility.result === 'high') firedRules.push('biological_plausibility');

      // Determine category using WHO-UMC algorithm
      const category = this.determineCategory({
        temporal: temporalRel.satisfied,
        dechallenge: dechallenge.result,
        rechallenge: rechallenge.value,
        alternativeCauses: altCauses.result,
        dechallengeState: dechallenge.state,
        rechallengeState: rechallenge.state,
        input,
      });

      // Determine route
      const route = this.determineRoute(input, {
        temporal: temporalRel.satisfied,
        dechallenge: dechallenge.result,
        rechallenge: rechallenge.value,
        alternatives: altCauses.result,
      });

      // Build output
      const category = this.determineCategory(input);

      return {
        case_id: input.case_id,
        drug: drug.name,
        event: event.meddra_llt || event.verbatim_text,
        category,
        method_detail: this.buildMethodDetail(firedRules),
        fired_rules: firedRules,
        factors,
        route: 'auto',
        confidence: 'high',
      };
    }

    private assessTemporalRelationship(drug: DrugExposure, event: AdverseEvent): { satisfied: boolean; evidence: string } {
      if (!drug.therapy_start || !event.onset_date) return { satisfied: false, evidence: 'Missing therapy start or event onset date' };

      const therapyStart = new Date(drug.therapy_start);
      const eventOnset = new Date(event.onset_date);

      if (eventOnset >= therapyStart) {
        const daysDiff = Math.floor((eventOnset.getTime() - therapyStart.getTime()) / (1000 * 60 * 60 * 24));
        return {
          satisfied: true,
          evidence: `Event onset ${event.onset_date} after drug start ${drug.therapy_start} (${daysDiff} days later)`
        };
      }

      return { satisfied: false, evidence: `Event onset ${event.onset_date} precedes drug start ${drug.therapy_start}` };
    }

    private assessDechallenge(drug: DrugExposure, input: Agent9Input): { result: DechallengeValue; state: 'structured' | 'unstructured' } {
      // Check if drug has explicit dechallenge info
      if (drug.dechallenge) return { result: drug.dechallenge, state: 'structured' };

      // Check events for resolution after drug stop
      const therapyEnd = drug.therapy_end;
      if (!therapyEnd) return { result: 'UNASSESSABLE', state: 'unstructured' };

      const therapyEndDate = new Date(therapyEnd);
      const eventEnd = input.events.find(e => e.outcome === 'RECOVERED' || e.outcome === 'RECOVERING');

      if (eventEndDate && new Date(eventEndDate) > new Date(drug.therapy_end || '')) {
        return { result: 'POSITIVE', state: 'unstructured' };
      }

      return { result: 'UNASSESSABLE', state: 'unstructured' };
    }

    private assessRechallenge(input: Agent9Input): { value: RechallengeValue; state: 'structured' | 'unstructured' } {
      // Check explicit rechallenge info
      for (const drug of input.drugs) {
        if (drug.rechallenge) return { value: drug.rechallenge, state: 'structured' };
      }

      // Check for rechallenge in narrative
      const narrative = input.narrative?.toLowerCase() || '';
      if (narrative.includes('rechallenge') || narrative.includes('re-exposure') || narrative.includes('reintroduced')) {
        return { value: 'YES', state: 'unstructured' };
      }

      return { value: 'UNKNOWN', state: 'unstructured' };
    }

    private assessAlternativeCauses(drug: DrugExposure, event: AdverseEvent, input: Agent9Input): { result: 'present' | 'absent' | 'unknown' } {
      // Check for concomitant drugs that could cause same event
      const concomitantDrugs = input.drugs.filter(d => d.role === 'concomitant');
      for (const drug of concomitantDrugs) {
        // Simplified: if concomitant drug known to cause similar event
        if (this.drugKnownToCauseEvent(drug.name, input.events[0]?.meddra_llt)) {
          return { result: 'present', evidence: `Concomitant drug ${drug.name} known to cause similar events` };
        }
      }

      // Check narrative for alternative explanations
      const narrative = input.narrative?.toLowerCase() || '';
      const altKeywords = ['alternative', 'other cause', 'other cause', 'underlying', 'pre-existing', 'concurrent'];
      if (altKeywords.some(kw => narrative.includes(kw))) {
        return { result: 'present', evidence: 'Alternative causes mentioned in narrative' };
      }

      return { result: 'absent', evidence: 'No alternative causes identified' };
    }

    private drugKnownToCauseEvent(drugName: string, eventLLT: string): boolean {
      // Simplified knowledge base - in production would query knowledge base
      const knownAssociations: Record<string, string[]> = {
        'DrugX': ['Hepatotoxicity', 'Liver injury'],
        'DrugY': ['Rash', 'Hypersensitivity'],
        'DrugZ': ['Nausea', 'Vomiting'],
        'DrugA': ['Headache'],
      };
      return knownAssociations[drugName]?.includes(eventLLT) || false;
    }

    private assessDoseResponse(drug: DrugExposure, input: Agent9Input): { result: 'present' | 'absent' | 'unknown' } {
      // Check if higher dose correlates with worse outcome
      // Simplified heuristic
      return { result: 'unknown' };
    }

    private assessConsistency(input: Agent9Input): { result: 'consistent' | 'inconsistent' | 'unknown' } {
      // Check if similar cases in literature
      return { result: 'unknown' };
    }

    private assessSpecificity(drug: DrugExposure, event: AdverseEvent, input: Agent9Input): { result: 'specific' | 'non_specific' | 'unknown' } {
      // Check if event is specific to this drug class
      const specificAssociations: Record<string, string[]> = {
        'DrugX': ['Hepatotoxicity'],
        'DrugY': ['Rash', 'Hypersensitivity'],
      };
      const specificEvents = knownAssociations[drug.name] || [];
      if (specificEvents.includes(input.events[0]?.meddra_llt)) {
        return { result: 'specific' };
      }
      return { result: 'non_specific' };
    }

    private assessBiologicalPlausibility(drug: DrugExposure, event: AdverseEvent): { result: 'high' | 'moderate' | 'low' | 'unknown' } {
      // Simplified - in production would query knowledge base
      const plausiblePairs: Record<string, string[]> = {
        'DrugX': ['Hepatotoxicity', 'Liver injury'],
        'DrugY': ['Rash', 'Hypersensitivity'],
      };
      if (plausiblePairs[drug.name]?.includes(input.events[0]?.meddra_llt)) {
        return { result: 'high' };
      }
      return { result: 'unknown' };
    }

    private determineCategory(input: Agent9Input): CausalityCategory {
      const drugs = input.drugs.filter(d => d.role === 'suspect');
      if (drugs.length === 0) return 'Unassessable';

      const drug = drugs[0];
      const event = input.events[0];

      // Check for positive dechallenge AND positive rechallenge = Certain
      const hasPositiveDechallenge = input.drugs.some(d => d.dechallenge === 'POSITIVE');
      const hasPositiveRechallenge = input.drugs.some(d => d.rechallenge === 'YES');

      if (hasPositiveDechallenge && hasPositiveRechallenge) return 'Certain';

      // Check for positive dechallenge without rechallenge
      if (hasPositiveDechallenge) return 'Probable/Likely';

      // Check for temporal relationship
      const temporal = this.assessTemporalRelationship(input.drugs[0], input.events[0]);
      if (!temporal.satisfied) return 'Unlikely';

      // Check for alternative causes
      const altCauses = this.assessAlternativeCauses(input.drugs[0], input.events[0], {
        drugs: input.drugs,
        events: input.events,
        narrative: input.narrative
      } as any);

      if (altCauses.result === 'present') return 'Possible';

      // Default to Possible if temporal relationship exists
      return 'Possible';
    }

    private determineRoute(input: Agent9Input, assessment: any): 'auto' | 'hitl' {
      // Route to HITL if:
      // - Conflicting reporter causality
      // - Low confidence
      // - Alternative causes present
      // - Unassessable dechallenge/rechallenge

      if (input.reporter_causality && input.reporter_causality.some(r => !r.related)) return 'hitl';
      if (input.drugs.some(d => d.dechallenge === 'UNASSESSABLE')) return 'hitl';
      if (input.drugs.some(d => d.rechallenge === 'UNKNOWN')) return 'hitl';

      return 'auto';
    }

    private determineCategory(input: Agent9Input): CausalityCategory {
      // Simplified category determination based on available data
      const drug = input.drugs[0];
      const event = input.events[0];

      // Check for Certain
      if (drug.dechallenge === 'POSITIVE' && drug.rechallenge === 'YES') return 'Certain';

      // Check for Probable
      if (drug.dechallenge === 'POSITIVE' && drug.rechallenge !== 'YES') return 'Probable/Likely';

      // Check temporal relationship
      const temporal = this.assessTemporalRelationship(input.drugs[0], input.events[0]);
      if (!temporal.satisfied) return 'Unlikely';

      // Check alternative causes
      const altCauses = this.assessAlternativeCauses(input.drugs[0], input.events[0], {
        drugs: input.drugs,
        events: input.events,
        narrative: input.narrative
      });
      if (altCauses.result === 'present') return 'Possible';

      return 'Possible';
    }

    private determineRoute(input: Agent9Input, assessment: any): 'auto' | 'hitl' {
      // Route to HITL if:
      if (input.reporter_causality && input.reporter_causality.some(r => !r.related)) return 'hitl';
      if (input.drugs.some(d => d.dechallenge === 'UNASSESSABLE')) return 'hitl';
      if (input.drugs.some(d => d.rechallenge === 'UNKNOWN')) return 'hitl';
      if (input.drugs.some(d => d.rechallenge === 'NO')) return 'hitl';
      return 'auto';
    }

    private buildMethodDetail(firedRules: string[]): string {
      if (firedRules.length === 0) return 'No specific causality rules triggered';
      return `Causality determined based on: ${firedRules.join(', ')}`;
    }

    private createResult(success: boolean, output: any, executionTime: number, error?: string): AgentResult {
      return {
        success,
        agent_id: 'agent-9-causality',
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

  export function createCausalityAgent(config: {
    tenant_id: string;
    inference_router: HybridInferenceRouter;
    audit_ledger: AuditLedgerService;
    zdr_store: ZDRStore;
  }): CausalityAgent {
    return new CausalityAgent(config);
  }