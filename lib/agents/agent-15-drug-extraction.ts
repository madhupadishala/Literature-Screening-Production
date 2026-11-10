/**
 * agent-15-drug-extraction.ts
 *
 * Agent 15: Drug Extraction & Classification
 *
 * Wraps AG01 canonical implementation for extracting drug/substance information
 * from safety narratives and classifying them per E2B(R3) standards.
 *
 * Compliance: FDA 21 CFR Part 11, EU GVP Module VI, ICH E2B(R3), GAMP 5
 */

import { BaseAgent, AgentExecutionInput, AgentResult, AgentCapabilities } from './base-agent';
import { HybridInferenceRouter } from '../infrastructure/hybrid-inference-router';
import { AuditLedgerService } from '../audit/audit-ledger-service';
import { ZDRStore } from '../infrastructure/redis-zdr-store';
import { createHash } from 'crypto';

// Role priority for deduplication (lower = higher priority)
const rolePriority = { SUSPECT: 0, INTERACTING: 1, CONCOMITANT: 2 };

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface DrugEntity {
  name: string;
  role: 'SUSPECT' | 'CONCOMITANT' | 'INTERACTING';
  substance?: string;
  substance_class?: string;
  authorization_number?: string;
  dose?: string;
  route?: string;
  frequency?: string;
  start_date?: string;
  end_date?: string;
  indication?: string;
  action_taken?: 'WITHDRAWN' | 'DOSE_REDUCED' | 'DOSE_INCREASED' | 'DOSE_UNCHANGED' | 'UNKNOWN';
  evidence: string;
}

export interface Agent15Input {
  caseId: string;
  narrative: string;
  existingProducts?: DrugEntity[];
}

export interface Agent15Output {
  trace_id: string;
  caseId: string;
  drugs: DrugEntity[];
  classification: {
    suspect_count: number;
    concomitant_count: number;
    interacting_count: number;
    unique_substances: string[];
  };
  execution_tier: 'HEURISTIC' | 'LOCAL' | 'CLOUD' | 'DLQ';
  model_name: string;
  model_hash: string;
  total_latency_ms: number;
}

// Common drug name patterns for heuristic extraction
const DRUG_PATTERNS = [
  // Brand names (capitalized, often with trademark symbols)
  /\b([A-Z][a-z]+(?:[-\s][A-Z][a-z]+)*)\b/g,
  // INN stems (common drug suffixes)
  /\b\w+(?:pril|sartan|olol|pine|statin|azole|ibulin|afil|abine|tinib|mab|nib|vir|cillin|mycin|floxacin|azole)\b/gi,
];

const ROLE_KEYWORDS = {
  SUSPECT: ['suspect', 'causative', 'implicated', 'accused', 'responsible'],
  CONCOMITANT: ['concomitant', 'concurrent', 'co-administered', 'background', 'other medication'],
  INTERACTING: ['interacting', 'interaction', 'drug interaction'],
};

const DOSE_PATTERN = /\b(\d+(?:\.\d+)?)\s*(mg|mcg|µg|g|ml|units?|iu)\b/gi;
const ROUTE_PATTERN = /\b(oral|iv|im|sc|subcutaneous|intramuscular|intravenous|topical|inhalation|rectal|vaginal|ophthalmic|otic|nasal|transdermal)\b/gi;
const FREQUENCY_PATTERN = /\b(once daily|twice daily|three times daily|q\d+h|qd|bid|tid|qid|prn|every \d+ hours?|daily|weekly|monthly)\b/gi;

// ============================================================================
// AGENT 15 IMPLEMENTATION
// ============================================================================

export class DrugExtractionAgent extends BaseAgent {
  constructor(config: {
    tenant_id: string;
    inference_router: HybridInferenceRouter;
    audit_ledger: AuditLedgerService;
    zdr_store: ZDRStore;
  }) {
    super({
      agent_id: 'agent-15-drug-extraction',
      tenant_id: config.tenant_id,
      inference_router: config.inference_router,
      audit_ledger: config.audit_ledger,
      zdr_store: config.zdr_store,
      max_retries: 1,
      timeout_ms: 15000,
      enable_audit: true,
      deterministic_seed: 42,
    });
  }

  getCapabilities(): AgentCapabilities {
    return {
      agent_id: 'agent-15-drug-extraction',
      name: 'Drug Extraction & Classification Agent',
      description: 'Extracts and classifies drug entities from safety narratives per E2B(R3) standards',
      input_schema: {
        type: 'object',
        properties: {
          caseId: { type: 'string' },
          narrative: { type: 'string' },
          existingProducts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                role: { type: 'string', enum: ['SUSPECT', 'CONCOMITANT', 'INTERACTING'] },
                substance: { type: 'string' },
              },
            },
          },
        },
        required: ['caseId', 'narrative'],
      },
      output_schema: {
        type: 'object',
        properties: {
          trace_id: { type: 'string' },
          caseId: { type: 'string' },
          drugs: { type: 'array', items: { type: 'object' } },
          classification: { type: 'object' },
          execution_tier: { type: 'string' },
          model_name: { type: 'string' },
          model_hash: { type: 'string' },
          total_latency_ms: { type: 'integer' },
        },
      },
      supported_tiers: ['HEURISTIC', 'LOCAL', 'CLOUD', 'DLQ'],
      required_services: ['audit-ledger', 'zdr-store'],
      estimated_latency_ms: 5000,
      max_concurrent: 5,
    };
  }

  async execute(input: AgentExecutionInput): Promise<AgentResult> {
    const startTime = Date.now();
    const inputPayload = input.payload as Agent15Input;

    try {
      const { caseId, narrative, existingProducts = [] } = inputPayload;

      // Heuristic drug extraction
      const extractedDrugs = this.extractDrugsHeuristic(narrative, existingProducts);

      // Classification summary
      const classification = {
        suspect_count: extractedDrugs.filter(d => d.role === 'SUSPECT').length,
        concomitant_count: extractedDrugs.filter(d => d.role === 'CONCOMITANT').length,
        interacting_count: extractedDrugs.filter(d => d.role === 'INTERACTING').length,
        unique_substances: [...new Set(extractedDrugs.map(d => d.substance).filter((s): s is string => Boolean(s)))],
      };

      const output: Agent15Output = {
        trace_id: `trc_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 8)}`,
        caseId,
        drugs: extractedDrugs,
        classification,
        execution_tier: 'HEURISTIC',
        model_name: 'heuristic-drug-extraction-v1',
        model_hash: 'heuristic-deterministic',
        total_latency_ms: Date.now() - startTime,
      };

      return this.createResult(true, output, Date.now() - startTime);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createResult(false, null, Date.now() - startTime, errorMessage);
    }
  }

  private extractDrugsHeuristic(narrative: string, existingProducts: DrugEntity[]): DrugEntity[] {
    const drugs: DrugEntity[] = [];
    const seen = new Set<string>();

    // First, use existing products as seeds
    for (const existing of existingProducts) {
      const key = `${existing.name}-${existing.role}`.toLowerCase();
      if (!seen.has(key)) {
        drugs.push({ ...existing });
        seen.add(key);
      }
    }

    // Extract potential drug names from narrative using patterns
    const sentences = narrative.split(/[.!?]+/).filter(s => s.trim().length > 10);

    // First pass: collect all drug mentions with their roles
    const drugMentions: Array<{ word: string; role: 'SUSPECT' | 'CONCOMITANT' | 'INTERACTING'; sentence: string; sentenceIndex: number }> = [];

    for (let sentenceIndex = 0; sentenceIndex < sentences.length; sentenceIndex++) {
      const sentence = sentences[sentenceIndex];
      const words = sentence.match(/\b[A-Z][a-zA-Z0-9]*(?:[-\s][A-Z][a-zA-Z0-9]*)*\b/g) || [];

      for (const word of words) {
        if (this.isLikelyDrugName(word, sentence)) {
          const role = this.inferRole(sentence, narrative, word);
          drugMentions.push({ word, role, sentence, sentenceIndex });
        }
      }
    }

    // Second pass: deduplicate by drug name, preferring:
    // 1. First occurrence (earliest sentence)
    // 2. Most specific role (SUSPECT > INTERACTING > CONCOMITANT)
    const rolePriority = { SUSPECT: 0, INTERACTING: 1, CONCOMITANT: 2 };
    const bestByDrug = new Map<string, typeof drugMentions[0]>();

    for (const mention of drugMentions) {
      const key = mention.word.toLowerCase();
      const existing = bestByDrug.get(key);

      if (!existing) {
        bestByDrug.set(key, mention);
      } else {
        // Prefer earlier sentence
        if (mention.sentenceIndex < existing.sentenceIndex) {
          bestByDrug.set(key, mention);
        } else if (mention.sentenceIndex === existing.sentenceIndex) {
          // Same sentence, prefer higher priority role
          if (rolePriority[mention.role] < rolePriority[existing.role]) {
            bestByDrug.set(key, mention);
          }
        }
      }
    }

    // Third pass: build final drug list from deduplicated mentions
    for (const mention of bestByDrug.values()) {
      const { word, role, sentence } = mention;

      // Extract dose/frequency/route near this drug
      const dose = this.extractDoseNearWord(sentence, word);
      const route = this.extractRouteNearWord(sentence, word);
      const frequency = this.extractFrequencyNearWord(sentence, word);

      // Extract action taken from full narrative
      let action_taken: DrugEntity['action_taken'] = 'UNKNOWN';
      const narrativeLower = narrative.toLowerCase();
      const actionTakenPatterns = [
        { pattern: /(withdrawn|discontinued|stopped)/i, value: 'WITHDRAWN' as const },
        { pattern: /(dose.?reduc|decreas)/i, value: 'DOSE_REDUCED' as const },
        { pattern: /(dose.?increas|rais)/i, value: 'DOSE_INCREASED' as const },
        { pattern: /(unchanged|continu)/i, value: 'DOSE_UNCHANGED' as const },
      ];

      for (const { pattern, value } of actionTakenPatterns) {
        if (pattern.test(narrative)) {
          action_taken = value;
          break;
        }
      }

      drugs.push({
        name: word,
        role: mention.role,
        substance: this.normalizeSubstanceName(word),
        dose,
        route,
        frequency,
        action_taken,
        evidence: sentence.trim(),
      });
    }

    return drugs;
  }

  private isLikelyDrugName(word: string, context: string): boolean {
    // Exclude common non-drug words
    const exclusions = ['The', 'This', 'That', 'Patient', 'Doctor', 'Hospital', 'Study', 'Trial', 'Treatment', 'Therapy', 'Medication', 'Drug', 'Medicine', 'Product', 'Case', 'Report', 'Event', 'Adverse', 'Effect', 'Reaction', 'Serious', 'Severe', 'Mild', 'Moderate', 'Male', 'Female', 'Year', 'Month', 'Week', 'Day', 'Age', 'Weight', 'Height', 'Dose', 'Mg', 'Ml', 'Kg'];
    if (exclusions.includes(word)) return false;

    // Must be at least 3 characters (allows "DrugX" style names)
    if (word.length < 3) return false;

    // Check for drug-like suffixes
    const drugSuffixes = ['pril', 'sartan', 'olol', 'pine', 'statin', 'azole', 'ibulin', 'afil', 'abine', 'tinib', 'mab', 'nib', 'vir', 'cillin', 'mycin', 'floxacin', 'azole', 'idine', 'azine', 'olide', 'etine', 'amide', 'oxide'];
    if (drugSuffixes.some(suffix => word.toLowerCase().endsWith(suffix))) return true;

    // Check for "DrugX", "DrugY", "SubstanceX" style patterns (capital letter + letters/numbers)
    // Matches: DrugX, DrugA, DrugB, SubstanceX, Product1, etc.
    if (/^[A-Z][a-zA-Z]*\d+$/.test(word) || /^[A-Z][a-z]+[A-Z][a-zA-Z]*$/.test(word)) {
      return true;
    }

    // Check if context mentions drug-related terms
    const drugContextKeywords = ['mg', 'dose', 'treatment', 'therapy', 'medication', 'prescribed', 'administered', 'tablet', 'capsule', 'injection', 'infusion', 'daily', 'twice', 'weekly', 'oral', 'iv', 'im', 'sc'];
    return drugContextKeywords.some(kw => context.toLowerCase().includes(kw));
  }

  private inferRole(sentence: string, fullNarrative: string, word: string): 'SUSPECT' | 'CONCOMITANT' | 'INTERACTING' {
    const lower = sentence.toLowerCase();
    const fullLower = fullNarrative.toLowerCase();
    const wordLower = word.toLowerCase();

    // First, check for explicit role keywords NEAR the drug name
    const wordIndex = sentence.toLowerCase().indexOf(wordLower);
    if (wordIndex !== -1) {
      // Look at context around the drug name (±100 chars)
      const start = Math.max(0, wordIndex - 100);
      const end = Math.min(sentence.length, wordIndex + word.length + 100);
      const localContext = sentence.substring(start, end).toLowerCase();
      const drugPosInLocal = wordIndex - start;

      // Find role keywords with their positions relative to drug name
      const rolePositions: Array<{ role: 'SUSPECT' | 'CONCOMITANT' | 'INTERACTING'; distance: number; isAfter: boolean }> = [];

      for (const [role, keywords] of Object.entries(ROLE_KEYWORDS)) {
        for (const kw of keywords) {
          let kwIndex = localContext.indexOf(kw);
          while (kwIndex !== -1) {
            const distance = Math.abs(kwIndex - drugPosInLocal);
            const isAfter = kwIndex > drugPosInLocal;
            rolePositions.push({ role: role as 'SUSPECT' | 'CONCOMITANT' | 'INTERACTING', distance, isAfter });
            kwIndex = localContext.indexOf(kw, kwIndex + 1);
          }
        }
      }

      if (rolePositions.length > 0) {
        // Prefer role keywords that appear AFTER the drug name (in same clause)
        // If multiple after, pick closest. If none after, pick closest before.
        const afterRoles = rolePositions.filter(r => r.isAfter);
        if (afterRoles.length > 0) {
          afterRoles.sort((a, b) => a.distance - b.distance);
          return afterRoles[0].role;
        }
        // No role keyword after drug, pick closest before
        rolePositions.sort((a, b) => a.distance - b.distance);
        return rolePositions[0].role;
      }
    }

    // Then check the full sentence
    for (const [role, keywords] of Object.entries(ROLE_KEYWORDS)) {
      if (keywords.some(kw => lower.includes(kw))) {
        return role as 'SUSPECT' | 'CONCOMITANT' | 'INTERACTING';
      }
    }

    // Check if this drug is mentioned in context of adverse events in the full narrative
    if (fullLower.includes('adverse') || fullLower.includes('reaction') || fullLower.includes('event') ||
        fullLower.includes('toxicity') || fullLower.includes('hepatotoxicity') || fullLower.includes('rash') ||
        fullLower.includes('nausea') || fullLower.includes('vomiting') || fullLower.includes('discontinued') ||
        fullLower.includes('withdrawn') || fullLower.includes('stopped') || fullLower.includes('overdose')) {
      return 'SUSPECT';
    }

    // Check for concomitant indicators
    if (fullLower.includes('concomitant') || fullLower.includes('concurrent') || fullLower.includes('background')) {
      return 'CONCOMITANT';
    }

    return 'CONCOMITANT';
  }

  private extractDose(text: string): string | undefined {
    const match = text.match(DOSE_PATTERN);
    return match ? match[0] : undefined;
  }

  private extractRoute(text: string): string | undefined {
    const match = text.match(ROUTE_PATTERN);
    return match ? match[0] : undefined;
  }

  private extractFrequency(text: string): string | undefined {
    const match = text.match(FREQUENCY_PATTERN);
    return match ? match[0] : undefined;
  }

  // Extract dose near a specific word (within ~50 chars)
  private extractDoseNearWord(text: string, word: string): string | undefined {
    const wordIndex = text.indexOf(word);
    if (wordIndex === -1) return this.extractDose(text);
    const start = Math.max(0, wordIndex - 50);
    const end = Math.min(text.length, wordIndex + word.length + 50);
    const context = text.substring(start, end);

    // Find ALL doses in context, pick the one closest to the word
    const doses: Array<{ dose: string; index: number; distance: number }> = [];
    const DOSE_PATTERN = /\b(\d+(?:\.\d+)?)\s*(mg|mcg|µg|g|ml|units?|iu)\b/gi;
    let match;
    while ((match = DOSE_PATTERN.exec(context)) !== null) {
      const doseIndex = match.index;
      const distance = Math.abs(doseIndex - (wordIndex - start));
      doses.push({ dose: match[0], index: doseIndex, distance });
    }

    if (doses.length === 0) return undefined;
    // Return dose closest to the word
    doses.sort((a, b) => a.distance - b.distance);
    return doses[0].dose;
  }

  private extractRouteNearWord(text: string, word: string): string | undefined {
    const wordIndex = text.indexOf(word);
    if (wordIndex === -1) return this.extractRoute(text);
    const start = Math.max(0, wordIndex - 50);
    const end = Math.min(text.length, wordIndex + word.length + 50);
    const context = text.substring(start, end);

    const routes: Array<{ route: string; index: number; distance: number }> = [];
    const ROUTE_PATTERN = /\b(oral|iv|im|sc|subcutaneous|intramuscular|intravenous|topical|inhalation|rectal|vaginal|ophthalmic|otic|nasal|transdermal)\b/gi;
    let match;
    while ((match = ROUTE_PATTERN.exec(context)) !== null) {
      const distance = Math.abs(match.index - (wordIndex - start));
      routes.push({ route: match[0], index: match.index, distance });
    }

    if (routes.length === 0) return undefined;
    routes.sort((a, b) => a.distance - b.distance);
    return routes[0].route;
  }

  private extractFrequencyNearWord(text: string, word: string): string | undefined {
    const wordIndex = text.indexOf(word);
    if (wordIndex === -1) return this.extractFrequency(text);
    const start = Math.max(0, wordIndex - 50);
    const end = Math.min(text.length, wordIndex + word.length + 50);
    const context = text.substring(start, end);

    const frequencies: Array<{ frequency: string; index: number; distance: number }> = [];
    const FREQUENCY_PATTERN = /\b(once daily|twice daily|three times daily|q\d+h|qd|bid|tid|qid|prn|every \d+ hours?|daily|weekly|monthly)\b/gi;
    let match;
    while ((match = FREQUENCY_PATTERN.exec(context)) !== null) {
      const distance = Math.abs(match.index - (wordIndex - start));
      frequencies.push({ frequency: match[0], index: match.index, distance });
    }

    if (frequencies.length === 0) return undefined;
    frequencies.sort((a, b) => a.distance - b.distance);
    return frequencies[0].frequency;
  }

  private normalizeSubstanceName(name: string): string {
    // Simple normalization - in production would use substance database
    return name.toLowerCase().replace(/[-\s]/g, '');
  }

  private createResult(success: boolean, output: Agent15Output | null, executionTime: number, error?: string): AgentResult {
    return {
      success,
      agent_id: 'agent-15-drug-extraction',
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

export function createDrugExtractionAgent(config: {
  tenant_id: string;
  inference_router: HybridInferenceRouter;
  audit_ledger: AuditLedgerService;
  zdr_store: ZDRStore;
}): DrugExtractionAgent {
  return new DrugExtractionAgent(config);
}