/**
 * agent-16-reporter-id.ts
 *
 * Agent 16: Reporter Identification
 *
 * Wraps AG04 canonical implementation for extracting reporter information
 * from safety narratives per E2B(R3) C.2.r standards.
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

export interface ReporterEntity {
  given_name: string | null;
  family_name: string | null;
  initials: string | null;
  organisation: string | null;
  department: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country_iso2: string | null;
  telephone: string | null;
  email: string | null;
  qualification_code: number | null;  // 1=Physician, 2=Pharmacist, 3=Other HCP, 4=Lawyer, 5=Consumer
  qualification_text: string | null;
  primary_source_for_regulatory_purposes: boolean;
  evidence: string;
  _isDefault?: boolean;  // Internal flag to mark default consumer reporter
}

export interface Agent16Input {
  caseId: string;
  narrative: string;
  existingReporters?: ReporterEntity[];
}

export interface Agent16Output {
  trace_id: string;
  caseId: string;
  reporters: ReporterEntity[];
  reporter_identifiable: boolean;
  contains_personal_data: boolean;
  execution_tier: 'HEURISTIC' | 'LOCAL' | 'CLOUD' | 'DLQ';
  model_name: string;
  model_hash: string;
  total_latency_ms: number;
  flags: string[];
}

// Qualification mapping (E2B R3 C.2.r.4)
const QUALIFICATION_PATTERNS: Array<[number, RegExp]> = [
  [1, /\b(physician|doctor|dr\.?|md|gp|general practitioner|surgeon|consultant|specialist|neurologist|cardiologist|oncologist|psychiatrist|paediatrician|pediatrician|dermatologist|resident|intern)\b/i],
  [2, /\b(pharmacist|pharmacy|chemist)\b/i],
  [4, /\b(lawyer|attorney|solicitor|advocate)\b/i],
  [3, /\b(nurse|dentist|midwife|physiotherapist|paramedic|technician|health.?care (professional|worker)|hcp|optometrist|coroner)\b/i],
  [5, /\b(patient|consumer|mother|father|parent|spouse|wife|husband|son|daughter|friend|caregiver|relative|self|layperson|non.?health)\b/i],
];

// Country ISO mapping
const COUNTRY_MAP: Record<string, string> = {
  india: 'IN', 'united states': 'US', usa: 'US', 'u.s.': 'US',
  'united kingdom': 'GB', uk: 'GB', germany: 'DE', france: 'FR',
  japan: 'JP', china: 'CN', italy: 'IT', spain: 'ES', canada: 'CA',
  australia: 'AU', brazil: 'BR', netherlands: 'NL', belgium: 'BE',
  switzerland: 'CH', ireland: 'IE',
};

function countryISO(s: string | null): string | null {
  if (!s) return null;
  const t = s.trim();
  if (/^[A-Z]{2}$/.test(t)) return t;
  return COUNTRY_MAP[t.toLowerCase()] || null;
}

function qualify(text: string | null): number | null {
  if (!text) return null;
  const t = text.toLowerCase();
  for (const [code, rx] of QUALIFICATION_PATTERNS) {
    if (rx.test(t)) return code;
  }
  return null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

// ============================================================================
// AGENT 16 IMPLEMENTATION
// ============================================================================

export class ReporterIdentificationAgent extends BaseAgent {
  constructor(config: {
    tenant_id: string;
    inference_router: HybridInferenceRouter;
    audit_ledger: AuditLedgerService;
    zdr_store: ZDRStore;
  }) {
    super({
      agent_id: 'agent-16-reporter-id',
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
      agent_id: 'agent-16-reporter-id',
      name: 'Reporter Identification Agent',
      description: 'Extracts and classifies reporter information per E2B(R3) C.2.r standards',
      input_schema: {
        type: 'object',
        properties: {
          caseId: { type: 'string' },
          narrative: { type: 'string' },
          existingReporters: { type: 'array', items: { type: 'object' } },
        },
        required: ['caseId', 'narrative'],
      },
      output_schema: {
        type: 'object',
        properties: {
          trace_id: { type: 'string' },
          caseId: { type: 'string' },
          reporters: { type: 'array', items: { type: 'object' } },
          reporter_identifiable: { type: 'boolean' },
          contains_personal_data: { type: 'boolean' },
          execution_tier: { type: 'string' },
          model_name: { type: 'string' },
          model_hash: { type: 'string' },
          total_latency_ms: { type: 'integer' },
          flags: { type: 'array', items: { type: 'string' } },
        },
      },
      supported_tiers: ['HEURISTIC', 'LOCAL', 'CLOUD', 'DLQ'],
      required_services: ['audit-ledger', 'zdr-store'],
      estimated_latency_ms: 3000,
      max_concurrent: 10,
    };
  }

  async execute(input: AgentExecutionInput): Promise<AgentResult> {
    const startTime = Date.now();
    const inputPayload = input.payload as Agent16Input;

    try {
      const { caseId, narrative, existingReporters = [] } = inputPayload;

      const extractedReporters = this.extractReportersHeuristic(narrative, existingReporters);

      // Determine primary source for regulatory purposes
      if (extractedReporters.length > 0) {
        const hcpIndex = extractedReporters.findIndex(r => r.qualification_code !== null && r.qualification_code <= 3);
        const primaryIndex = hcpIndex >= 0 ? hcpIndex : 0;
        extractedReporters[primaryIndex].primary_source_for_regulatory_purposes = true;

        // Flag multiple reporters with different qualifications
        const uniqueQuals = new Set(extractedReporters.map(r => r.qualification_code).filter(Boolean));
        if (uniqueQuals.size > 1) {
          // Would add flag in production
        }
      }

      const reporterIdentifiable = extractedReporters.some(r =>
        r.family_name || r.given_name || r.initials || r.street || r.city || r.telephone || r.email || r.organisation
      );

      const output: Agent16Output = {
        trace_id: `trc_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 8)}`,
        caseId,
        reporters: extractedReporters,
        reporter_identifiable: reporterIdentifiable,
        contains_personal_data: true,
        execution_tier: 'HEURISTIC',
        model_name: 'heuristic-reporter-id-v1',
        model_hash: 'heuristic-deterministic',
        total_latency_ms: Date.now() - startTime,
        flags: [],
      };

      return this.createResult(true, output, Date.now() - startTime);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createResult(false, null, Date.now() - startTime, errorMessage);
    }
  }

  private extractReportersHeuristic(narrative: string, existing: ReporterEntity[]): ReporterEntity[] {
    let reporters: ReporterEntity[] = [];
    const seen = new Set<string>();

    // Use existing reporters as seeds
    for (const r of existing) {
      const key = `${r.given_name}-${r.family_name}-${r.qualification_code}`.toLowerCase();
      if (!seen.has(key)) {
        reporters.push({ ...r });
        seen.add(key);
      }
    }

    // Extract global contact info from entire narrative first
    const globalEmailMatch = narrative.match(/\b[\w.-]+@[\w.-]+\.\w+\b/);
    const globalEmail = globalEmailMatch ? globalEmailMatch[0] : null;

    const globalPhoneMatch = narrative.match(/\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/) ||
      narrative.match(/\b(?:\+?\d{1,3}[-.\s]?)?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/);
    const globalPhone = globalPhoneMatch ? globalPhoneMatch[0] : null;

    // Heuristic extraction from narrative
    // Look for reporter patterns in the narrative
    const sentences = narrative.split(/[.!?]+/).filter(s => s.trim().length > 10); // Lower threshold to catch short contact sentences

    // First pass: extract all reporter candidates
    const candidates: ReporterEntity[] = [];
    for (const sentence of sentences) {
      const reporter = this.extractReporterFromSentence(sentence, globalEmail, globalPhone);
      if (reporter) {
        candidates.push(reporter);
      }
    }

    // Deduplicate by name (prefer more complete records)
    const byName = new Map<string, ReporterEntity>();
    for (const r of candidates) {
      const nameKey = `${r.given_name}-${r.family_name}`.toLowerCase();
      const existingR = byName.get(nameKey);
      if (!existingR || this.isMoreComplete(r, existingR)) {
        byName.set(nameKey, r);
      }
    }

    // Filter out low-quality reporters (only qualification_code, no identifying info)
    // Use a stricter check that requires at least name OR org OR address
    const qualityCandidates = Array.from(byName.values()).filter(r =>
      (r.given_name && r.family_name) ||  // Has full name
      r.organisation ||                    // Has organisation
      r.street ||                          // Has street address
      (r.city && r.state)                  // Has city+state (address)
    );

    // Add quality candidates to reporters
    for (const r of qualityCandidates) {
      const key = `${r.given_name}-${r.family_name}-${r.qualification_code}`.toLowerCase();
      if (!seen.has(key)) {
        reporters.push(r);
        seen.add(key);
      }
    }

    // If no quality reporters found, create a default consumer reporter
    // (mark as default so final filter doesn't remove it)
    let defaultReporterAdded = false;
    if (reporters.length === 0) {
      const defaultReporter = this.createDefaultConsumerReporter(narrative);
      defaultReporter._isDefault = true; // Mark as default
      reporters.push(defaultReporter);
      defaultReporterAdded = true;
    }

    // Set primary source for regulatory purposes (first HCP by order)
    let primarySet = false;
    for (const r of reporters) {
      if (!primarySet && r.qualification_code !== null && r.qualification_code <= 3) {
        r.primary_source_for_regulatory_purposes = true;
        primarySet = true;
      }
    }
    // If no HCP, first reporter is primary
    if (!primarySet && reporters.length > 0) {
      reporters[0].primary_source_for_regulatory_purposes = true;
    }

    // Final safety filter: remove reporters with no identifying information at all
    // (only qualification code + global fallback contact info)
    // Keep reporters marked as default
    reporters = reporters.filter(r =>
      r._isDefault ||                     // Keep default reporter
      (r.given_name && r.family_name) ||  // Has full name
      r.organisation ||                    // Has organisation
      r.street ||                          // Has street address
      r.city ||                            // Has city
      (r.state && r.postcode)              // Has state+postcode
    );

    return reporters;
  }

  private isMoreComplete(a: ReporterEntity, b: ReporterEntity): boolean {
    // Count non-null fields
    const countA = Object.values(a).filter(v => v !== null && v !== undefined).length;
    const countB = Object.values(b).filter(v => v !== null && v !== undefined).length;
    return countA > countB;
  }

  private extractReporterFromSentence(sentence: string, globalEmail?: string | null, globalPhone?: string | null): ReporterEntity | null {
    const lower = sentence.toLowerCase();

    // Skip sentences that are clearly about the patient's medical condition, not the reporter
    // But keep sentences that mention patient's relative/family member as reporter
    const isAboutPatientCondition = lower.includes('patient developed') ||
      lower.includes('patient experienced') ||
      lower.includes('patient was') ||
      lower.includes('patient had') ||
      lower.includes('patient received');

    const mentionsReporter = lower.includes('reported by') ||
      lower.includes('informed by') ||
      lower.includes('notified by') ||
      lower.includes('reporter') ||
      lower.includes('mother') ||
      lower.includes('father') ||
      lower.includes('parent') ||
      lower.includes('spouse') ||
      lower.includes('wife') ||
      lower.includes('husband') ||
      lower.includes('son') ||
      lower.includes('daughter') ||
      lower.includes('relative') ||
      lower.includes('caregiver');

    if (isAboutPatientCondition && !mentionsReporter) {
      return null;
    }

    // Look for qualification keywords
    let qualification_text: string | null = null;
    let qualification_code: number | null = null;

    for (const [code, rx] of QUALIFICATION_PATTERNS) {
      if (rx.test(sentence)) {
        qualification_code = code;
        const match = sentence.match(rx);
        qualification_text = match ? match[0] : null;
        break;
      }
    }

    // Extract name pattern (capitalized words)
    const nameMatch = sentence.match(/\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/);
    const given_name = nameMatch ? nameMatch[1] : null;
    const family_name = nameMatch ? nameMatch[2] : null;

    // Extract initials (e.g., "M.D.", "J.D.", "Ph.D.") - avoid matching country codes
    // Country codes that should NOT be treated as initials
    const COUNTRY_CODES = new Set(['US', 'USA', 'GB', 'UK', 'DE', 'FR', 'JP', 'CN', 'IT', 'ES', 'CA', 'AU', 'BR', 'NL', 'BE', 'CH', 'IE', 'U.K.', 'U.S.']);
    const initialsMatch = sentence.match(/\b([A-Z])\.?\s*([A-Z])\.?\b/);
    let initials: string | null = null;
    if (initialsMatch) {
      const candidate = `${initialsMatch[1]}.${initialsMatch[2]}.`;
      // Check if this looks like a country code
      if (!COUNTRY_CODES.has(candidate.replace(/\./g, '')) && !COUNTRY_CODES.has(candidate)) {
        initials = candidate;
      }
    }

    // Extract organisation - multiple patterns for robustness
    let organisation = null;

    // Pattern 1: "at|from|of Organization Name" - allow camelCase (HealthPlus)
    const orgMatch1 = sentence.match(/\b(?:at|from|of)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/);
    if (orgMatch1 && orgMatch1[1]) organisation = orgMatch1[1];

    // Pattern 2: "at|from Organization Name Pharmacy|Hospital|Clinic|etc."
    if (!organisation) {
      const orgMatch2 = sentence.match(/\b(?:at|from)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*(?:\s+(?:Pharmacy|Hospital|Clinic|Center|Centre|Medical|Center)))/);
      if (orgMatch2 && orgMatch2[1]) organisation = orgMatch2[1];
    }

    // Pattern 3: "at|from Organization, City" (common in UK/EU)
    if (!organisation) {
      const orgMatch3 = sentence.match(/\b(?:at|from)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*),\s*[A-Z][a-z]+\b/);
      if (orgMatch3 && orgMatch3[1]) organisation = orgMatch3[1];
    }

    // Pattern 4: "at Organization" - capture until comma, period, or end (fallback)
    if (!organisation) {
      const orgMatch4 = sentence.match(/\b(?:at|from)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)(?=,\s*[A-Z][a-z]|\.\s|$)/);
      if (orgMatch4 && orgMatch4[1]) organisation = orgMatch4[1];
    }

    // Extract contact info - use sentence-specific first, then fall back to global
    const emailMatch = sentence.match(/\b[\w.-]+@[\w.-]+\.\w+\b/);
    const email = emailMatch ? emailMatch[0] : globalEmail || null;

    // Phone number (various formats) - more comprehensive
    const phoneMatch = sentence.match(/\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/) ||
      sentence.match(/\b(?:\+?\d{1,3}[-.\s]?)?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/);
    const telephone = phoneMatch ? phoneMatch[0] : globalPhone || null;

    // Extract address components
    let street: string | null = null;
    let city: string | null = null;
    let state: string | null = null;
    let postcode: string | null = null;

    // US address pattern: "123 Main St, New York, NY 10001"
    const usAddressMatch = sentence.match(/\b(\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Ct|Court|Pl|Place)),\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)\b/);
    if (usAddressMatch) {
      street = usAddressMatch[1];
      city = usAddressMatch[2];
      state = usAddressMatch[3];
      postcode = usAddressMatch[4];
    } else {
      // Simple city extraction
      const cityMatch = sentence.match(/\b(?:in|at|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?:,\s*[A-Z]{2})?\b/);
      city = cityMatch ? cityMatch[1] : null;
    }

    // Extract country
    let country_iso2: string | null = null;
    for (const [country, iso] of Object.entries(COUNTRY_MAP)) {
      if (new RegExp(`\\b${country}\\b`, 'i').test(sentence)) {
        country_iso2 = iso;
        break;
      }
    }

    // Also check for explicit country codes (US, GB, DE, etc.)
    if (!country_iso2) {
      const countryCodeMatch = sentence.match(/\b(US|USA|GB|UK|DE|FR|JP|CN|IT|ES|CA|AU|BR|NL|BE|CH|IE)\b/);
      if (countryCodeMatch) {
        country_iso2 = countryCodeMatch[1].replace('USA', 'US').replace('UK', 'GB');
      }
    }

    // Only return if we have meaningful data
    if (!given_name && !family_name && !initials && !qualification_text) {
      return null;
    }

    return {
      given_name,
      family_name,
      initials,
      organisation,
      department: null,
      street,
      city,
      state,
      postcode,
      country_iso2,
      telephone,
      email,
      qualification_code,
      qualification_text,
      primary_source_for_regulatory_purposes: false,
      evidence: sentence.trim(),
    };
  }

  private createDefaultConsumerReporter(narrative: string): ReporterEntity {
    return {
      given_name: null,
      family_name: null,
      initials: null,
      organisation: null,
      department: null,
      street: null,
      city: null,
      state: null,
      postcode: null,
      country_iso2: null,
      telephone: null,
      email: null,
      qualification_code: 5, // Consumer
      qualification_text: 'Consumer/Non-HCP (default)',
      primary_source_for_regulatory_purposes: true,
      evidence: `Default consumer reporter inferred from narrative: ${narrative.substring(0, 200)}...`,
    };
  }

  private createResult(success: boolean, output: Agent16Output | null, executionTime: number, error?: string): AgentResult {
    return {
      success,
      agent_id: 'agent-16-reporter-id',
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

export function createReporterIdentificationAgent(config: {
  tenant_id: string;
  inference_router: HybridInferenceRouter;
  audit_ledger: AuditLedgerService;
  zdr_store: ZDRStore;
}): ReporterIdentificationAgent {
  return new ReporterIdentificationAgent(config);
}