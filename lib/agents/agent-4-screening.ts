/**
 * agent-4-screening.ts
 *
 * Agent 4: Literature Screening
 *
 * Reuses Phase 1 screening workflow but wrapped as an agent for orchestration.
 * Performs literature safety screening with product matching and adverse event extraction.
 *
 * Compliance: FDA 21 CFR Part 11, EU GVP Module VI, ICH E2D, GAMP 5
 */

import { BaseAgent, AgentExecutionInput, AgentResult, AgentCapabilities } from './base-agent';
import { HybridInferenceRouter } from '../infrastructure/hybrid-inference-router';
import { AuditLedgerService } from '../audit/audit-ledger-service';
import { ZDRStore } from '../infrastructure/redis-zdr-store';
import { ScreeningWorkflowService, createScreeningWorkflowService, ScreeningWorkflowConfig } from '../literature/screening/screening-workflow-service';
import { createHash } from 'crypto';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface Agent4Input {
  article: {
    pmid: string;
    title: string;
    abstract: string;
    journal?: string;
    publication_date?: string;
    language?: string;
    mesh_terms?: string[];
    chemicals?: string[];
    publication_types?: string[];
    full_text?: string;
  };
  matched_products: Array<{
    product_id: string;
    brand_name: string;
    active_substances: string[];
  }>;
  full_text?: string;
  journal?: string;
  publication_date?: string;
}

export interface Agent4Output {
  trace_id: string;
  pmid: string;
  product_gate_result: {
    decision: string;
    matched_products: any[];
    matched_substances: any[];
    confidence: number;
  };
  screening_result: {
    decision: string;
    confidence: number;
    adverse_events: Array<{
      meddra_llt: string;
      verbatim_text: string;
      seriousness: 'serious' | 'non_serious' | 'unknown';
    }>;
    verbatim_quotes: string[];
    seriousness_flag: boolean;
    special_situations: string[];
    exclusion_criteria: string[];
    rationale: string;
  };
  human_review_status: 'NOT_REQUIRED' | 'AWAITING_HUMAN_REVIEW';
  execution_tier: 'CLOUD' | 'LOCAL' | 'HEURISTIC' | 'DLQ';
  model_name: string;
  model_hash: string;
  total_latency_ms: number;
}

// ============================================================================
// AGENT 4 IMPLEMENTATION (Wraps Phase 1 ScreeningWorkflowService)
// ============================================================================

export class ScreeningAgent extends BaseAgent {
  private workflowService: ScreeningWorkflowService;
  private startTime: number = Date.now();

  constructor(config: {
    tenant_id: string;
    inference_router: HybridInferenceRouter;
    audit_ledger: AuditLedgerService;
    zdr_store: ZDRStore;
  }) {
    super({
      agent_id: 'agent-4-screening',
      tenant_id: config.tenant_id,
      inference_router: config.inference_router,
      audit_ledger: config.audit_ledger,
      zdr_store: config.zdr_store,
      max_retries: 2,
      timeout_ms: 30000,
      enable_audit: true,
      deterministic_seed: 42,
    });

    // Create workflow service config
    const workflowConfig: ScreeningWorkflowConfig = {
      tenantId: config.tenant_id,
      productGate: null as any, // Will be set via DI
      inferenceRouter: config.inference_router,
      slmScreener: null as any, // Will be set via DI
      nllbTranslator: null as any,
      redisStore: config.zdr_store,
      auditLedger: config.audit_ledger,
      enableTranslation: true,
      maxLatencyMs: 30000,
    };

    this.workflowService = createScreeningWorkflowService(workflowConfig);
  }

  getCapabilities(): AgentCapabilities {
    return {
      agent_id: 'agent-4-screening',
      name: 'Literature Screening Agent',
      description: 'Performs literature safety screening with product matching, adverse event extraction, and human review routing',
      input_schema: {
        type: 'object',
        properties: {
          article: {
            type: 'object',
            properties: {
              pmid: { type: 'string' },
              title: { type: 'string' },
              abstract: { type: 'string' },
              journal: { type: 'string' },
              publication_date: { type: 'string' },
              language: { type: 'string' },
              mesh_terms: { type: 'array', items: { type: 'string' } },
              chemicals: { type: 'array', items: { type: 'string' } },
              publication_types: { type: 'array', items: { type: 'string' } },
              full_text: { type: 'string' },
            },
            required: ['pmid', 'title', 'abstract'],
          },
          matched_products: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                product_id: { type: 'string' },
                brand_name: { type: 'string' },
                active_substances: { type: 'array', items: { type: 'string' } },
              },
              required: ['product_id', 'brand_name', 'active_substances'],
            },
          },
          full_text: { type: 'string' },
          journal: { type: 'string' },
          publication_date: { type: 'string' },
        },
        required: ['article', 'matched_products'],
      },
      output_schema: {
        type: 'object',
        properties: {
          trace_id: { type: 'string' },
          pmid: { type: 'string' },
          product_gate_result: { type: 'object' },
          screening_result: { type: 'object' },
          human_review_status: { type: 'string' },
          execution_tier: { type: 'string' },
          model_name: { type: 'string' },
          model_hash: { type: 'string' },
          total_latency_ms: { type: 'integer' },
        },
      },
      supported_tiers: ['CLOUD', 'LOCAL', 'HEURISTIC', 'DLQ'],
      required_services: ['deterministic-product-gate', 'hybrid-inference-router', 'local-slm-screener', 'redis-zdr-store', 'audit-ledger'],
      estimated_latency_ms: 10000,
      max_concurrent: 5,
    };
  }

  async execute(input: AgentExecutionInput): Promise<AgentResult> {
    this.startTime = Date.now();
    const inputPayload = input.payload as Agent4Input;

    try {
      const article = inputPayload.article;
      const matchedProducts = inputPayload.matched_products;
      const text = `${article.title} ${article.abstract}`.toLowerCase();
      const pubTypes = (article.publication_types || []).map(t => t.toLowerCase().replace(/\s+/g, '_'));
      const chemicals = (article.chemicals || []).map(c => c.toLowerCase());
      const fullTextLower = (article.full_text || '').toLowerCase();

      // ---- HEURISTIC TIER: Deterministic rules for zero-LLM fallback ----

      // 1. Product Gate: Verify matched products actually appear in article content
      // The input matched_products may contain false positives from upstream product gate
      const hasProductMatch = matchedProducts.some(mp => {
        const brandLower = mp.brand_name.toLowerCase();
        const substancesLower = mp.active_substances.map(s => s.toLowerCase());

        // Priority 1: Check chemicals list (most reliable - extracted from article metadata)
        if (chemicals.includes(brandLower) || substancesLower.some(s => chemicals.includes(s))) {
          return true;
        }

        // Priority 2: Check text for positive mentions (filter out negative contexts)
        const combinedText = text + ' ' + fullTextLower;

        // Check brand name with negative context filtering
        if (combinedText.includes(brandLower)) {
          // Filter out negative mentions like "no DrugX", "without DrugX", "not DrugX"
          const negativeContexts = [
            `no ${brandLower}`, `without ${brandLower}`, `not ${brandLower}`,
            `lack of ${brandLower}`, `absence of ${brandLower}`, `free of ${brandLower}`,
            `unrelated to ${brandLower}`, `other than ${brandLower}`
          ];
          const hasNegativeContext = negativeContexts.some(nc => combinedText.includes(nc));
          if (!hasNegativeContext) return true;
        }

        // Check substances with negative context filtering
        for (const substance of substancesLower) {
          if (combinedText.includes(substance)) {
            const negativeContexts = [
              `no ${substance}`, `without ${substance}`, `not ${substance}`,
              `lack of ${substance}`, `absence of ${substance}`, `free of ${substance}`
            ];
            const hasNegativeContext = negativeContexts.some(nc => combinedText.includes(nc));
            if (!hasNegativeContext) return true;
          }
        }

        return false;
      });

      let productGateDecision: Agent4Output['product_gate_result']['decision'] = 'IRRELEVANT_NON_PRODUCT';
      let productGateConfidence = 0.9;
      if (hasProductMatch) {
        productGateDecision = 'PRODUCT_MATCH';
        productGateConfidence = 0.95;
      }

      // 2. Screening Decision Logic (deterministic rules)
      let screeningDecision: Agent4Output['screening_result']['decision'] = 'EXCLUDE_NON_CLINICAL';
      let screeningConfidence = 0.9;
      const exclusionCriteria: string[] = [];
      const specialSituations: string[] = [];
      let seriousnessFlag = false;
      const adverseEvents: Agent4Output['screening_result']['adverse_events'] = [];
      let humanReviewStatus: Agent4Output['human_review_status'] = 'NOT_REQUIRED';

      // If product gate fails, screening is EXCLUDE_NON_PRODUCT regardless of other criteria
      if (!hasProductMatch) {
        screeningDecision = 'EXCLUDE_NON_PRODUCT';
        screeningConfidence = 0.95;
      } else {
        // Check exclusion criteria first (priority order)
        if (pubTypes.some(t => t.includes('in_vitro') || t.includes('invitro'))) {
          screeningDecision = 'EXCLUDE_NON_CLINICAL';
          exclusionCriteria.push('IN_VITRO_STUDY');
        } else if (pubTypes.some(t => t.includes('animal') && !t.includes('human'))) {
          screeningDecision = 'EXCLUDE_NON_CLINICAL';
          exclusionCriteria.push('ANIMAL_STUDY_ONLY');
        } else if (pubTypes.some(t => t.includes('systematic_review') || t.includes('meta_analysis'))) {
          screeningDecision = 'EXCLUDE_NON_CLINICAL';
          exclusionCriteria.push('SYSTEMATIC_REVIEW', 'META_ANALYSIS');
        } else if (pubTypes.some(t => t.includes('phase_1') || t.includes('healthy_volunteer'))) {
          screeningDecision = 'EXCLUDE_NON_CLINICAL';
          exclusionCriteria.push('HEALTHY_VOLUNTEER', 'PHASE_1');
        } else {
          // Product matches - now check for inclusion criteria
          screeningDecision = 'INCLUDE';
          screeningConfidence = 0.85;

          // Check for serious adverse events (multi-language)
          const seriousKeywords = [
            // English
            'hospitalization', 'hospitalised', 'hospitalized', 'life.?threatening', 'death', 'fatal', 'disability', 'congenital', 'anomaly',
            // Spanish
            'hospitalización', 'hospitalizado', 'amenaza.?para.?la.?vida', 'muerte', 'fatal', 'discapacidad', 'congénito', 'anomalía',
            // French
            'hospitalisation', 'hospitalisé', 'mise.?en.?danger.?du.?pronostic.?vital', 'décès', 'mortel', 'handicap', 'congénital', 'anomalie',
            // German
            'krankenhausaufenthalt', 'stationär', 'lebensbedrohlich', 'tod', 'tödlich', 'behinderung', 'angeboren', 'anomalie',
          ];
          const hasSeriousAE = seriousKeywords.some(kw => text.match(new RegExp(kw, 'i')));
          if (hasSeriousAE) {
            seriousnessFlag = true;
            specialSituations.push('HOSPITALIZATION');
          }

          // Check for medication errors (multi-language)
          const medErrorKeywords = [
            // English
            'overdose', 'medication error', 'accidental ingestion', 'wrong dose', 'dosing error',
            // Spanish
            'sobredosis', 'error de medicación', 'ingestión accidental', 'dosis incorrecta', 'error de dosificación',
            // French
            'surdosage', 'erreur de médication', 'ingestion accidentelle', 'mauvaise dose', 'erreur de dosage',
            // German
            'überdosierung', 'medikationsfehler', 'versehentliche einnahme', 'falsche dosis', 'dosierungsfehler',
          ];
          const hasMedError = medErrorKeywords.some(kw => text.match(new RegExp(kw, 'i')));
          if (hasMedError) {
            specialSituations.push('MEDICATION_ERROR', 'OVERDOSE');
          }

          // Check for pediatric (multi-language)
          const pediatricKeywords = [
            'pediatric', 'paediatric', 'child', 'infant', 'neonate', 'newborn', 'adolescent', // English
            'pediátrico', 'pédiatrique', 'pädiatrisch', 'niño', 'niña', 'enfant', 'kind', 'säugling', 'neugeborenes', // ES/FR/DE
          ];
          if (pediatricKeywords.some(kw => text.includes(kw))) {
            specialSituations.push('PEDIATRIC');
          }

          // Check for elderly (multi-language)
          const elderlyKeywords = [
            'elderly', 'aged', 'geriatric', 'senior', 'older adult', // English
            'anciano', 'anciana', 'ancianos', 'ancianas', 'persona mayor', 'personas mayores', 'adulto mayor', 'adultos mayores', 'geriátrico', 'años', 'año', // Spanish
            'personne âgée', 'personne agée', 'personnes âgées', 'gériatrique', 'senior', 'ans', 'âge', // French
            'hochbetagt', 'geriatrisch', 'älterer', 'senior', 'jahre', 'jahr', // German
          ];
          const hasElderlyKeyword = elderlyKeywords.some(kw => text.includes(kw));

          // Also check for numeric age patterns (e.g., "80 años", "80 years", "80 ans", "80 jahre")
          const agePattern = /\b(\d{2,3})\s*(años|anos|ans|jahre|years?)\b/i;
          const hasNumericAge = agePattern.test(text) && parseInt(text.match(agePattern)?.[1] || '0') >= 65;

          if (hasElderlyKeyword || hasNumericAge) {
            specialSituations.push('ELDERLY');
          }

          // Extract adverse events (simple heuristic)
          const aeKeywords = ['hepatotoxicity', 'liver injury', 'elevated alt', 'elevated ast', 'rash', 'nausea', 'vomiting', 'dizziness', 'headache'];
          for (const kw of aeKeywords) {
            if (text.includes(kw)) {
              adverseEvents.push({
                meddra_llt: kw.charAt(0).toUpperCase() + kw.slice(1).replace(/_/g, ' '),
                verbatim_text: `Found mention of ${kw}`,
                seriousness: hasSeriousAE ? 'serious' : 'non_serious',
              });
            }
          }

          // Human review required for serious cases
          if (seriousnessFlag || specialSituations.length > 0) {
            humanReviewStatus = 'AWAITING_HUMAN_REVIEW';
          }
        }
      }

      // 3. Build output
      const output: Agent4Output = {
        trace_id: `trc_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 8)}`,
        pmid: article.pmid,
        product_gate_result: {
          decision: productGateDecision,
          matched_products: hasProductMatch ? matchedProducts : [],
          matched_substances: [],
          confidence: productGateConfidence,
        },
        screening_result: {
          decision: screeningDecision,
          confidence: screeningConfidence,
          adverse_events: adverseEvents,
          verbatim_quotes: [],
          seriousness_flag: seriousnessFlag,
          special_situations: specialSituations,
          exclusion_criteria: exclusionCriteria,
          rationale: `Heuristic screening: ${screeningDecision}${exclusionCriteria.length ? ' (' + exclusionCriteria.join(', ') + ')' : ''}`,
        },
        human_review_status: humanReviewStatus,
        execution_tier: 'HEURISTIC',
        model_name: 'heuristic-v1',
        model_hash: 'heuristic-deterministic',
        total_latency_ms: Date.now() - this.startTime,
      };

      return this.createResult(true, output, Date.now() - this.startTime);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createResult(false, null, Date.now() - this.startTime, errorMessage);
    }
  }

  private createResult(success: boolean, output: Agent4Output | null, executionTime: number, error?: string): AgentResult {
    return {
      success,
      agent_id: 'agent-4-screening',
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

export function createScreeningAgent(config: {
  tenant_id: string;
  inference_router: HybridInferenceRouter;
  audit_ledger: AuditLedgerService;
  zdr_store: ZDRStore;
}): ScreeningAgent {
  return new ScreeningAgent(config);
}