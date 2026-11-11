/**
 * agent-8-country-incident.ts
 *
 * Agent 8: Country of Incident (AG08)
 *
 * Extracts and validates the country where the adverse event occurred per ICH E2B(R3).
 * Determines the regulatory authority jurisdiction and validates ISO 3166 country codes.
 *
 * Compliance: FDA 21 CFR Part 11, EU GVP Module VI, ICH E2B(R3), GAMP 5
 */

import { BaseAgent, AgentExecutionInput, AgentResult, AgentCapabilities } from './base-agent';
import { HybridInferenceRouter } from '../infrastructure/hybrid-inference-router';
import { AuditLedgerService } from '../audit/audit-ledger-service';
import { ZDRStore } from '../infrastructure/redis-zdr-store';
import { createHash } from 'crypto';

// ============================================================================
// TYPES & INTERFACES (Per ICH E2B(R3) - Country of Occurrence)
// ============================================================================

export type CountryCodeStatus = 'VALID' | 'INVALID' | 'MISSING' | 'AMBIGUOUS';

export interface CountryAssessment {
  field: string;
  status: CountryCodeStatus;
  countryCode?: string;        // ISO 3166-1 alpha-2
  countryName?: string;
  sourceField: string;
  evidence: string[];
  reason: string;
  regulatoryAuthority?: string;
}

export interface CountryIncidentSnapshot {
  countryOfOccurrence: CountryAssessment;
  reporterCountry: CountryAssessment;
  primaryCountry: CountryAssessment;
  regulatoryAuthority: string;
  jurisdiction: 'FDA' | 'EMA' | 'PMDA' | 'HC' | 'TGA' | 'OTHER' | 'AMBIGUOUS';
  crossBorder: boolean;
  followUpRequired: boolean;
  followUpReasons: string[];
}

export interface Agent8Input {
  intakeRecordId: string;
  tenantId: string;
  entities: {
    patients: Array<Record<string, unknown>>;
    reporters: Array<Record<string, unknown>>;
    events: Array<Record<string, unknown>>;
    sourcePayload?: Record<string, unknown>;
    intakePayload?: Record<string, unknown>;
  };
}

export interface Agent8Output {
  trace_id: string;
  intakeRecordId: string;
  systemSnapshot: CountryIncidentSnapshot;
  humanDecisionRequired: boolean;
  execution_tier: 'HEURISTIC' | 'LOCAL' | 'CLOUD' | 'DLQ';
  model_name: string;
  model_hash: string;
  total_latency_ms: number;
}

// ISO 3166-1 alpha-2 country codes (subset for PV jurisdictions)
const COUNTRY_REGULATORY_AUTHORITY: Record<string, string> = {
  'US': 'FDA',
  'CA': 'HC',
  'GB': 'MHRA',
  'EU': 'EMA',  // For EU-wide
  'AT': 'AGES', 'BE': 'FAMHP', 'BG': 'BDA', 'HR': 'HALMED', 'CY': 'PHARMACEUTICAL SERVICES',
  'CZ': 'SUKL', 'DK': 'DKMA', 'EE': 'ZAM', 'FI': 'FIMEA', 'FR': 'ANSM',
  'DE': 'BfArM/PEI', 'GR': 'EOF', 'HU': 'OGYI', 'IE': 'HPRA', 'IT': 'AIFA',
  'LV': 'ZVA', 'LT': 'VVKT', 'LU': 'MINISTRY OF HEALTH', 'MT': 'MEDICINES AUTHORITY',
  'NL': 'MEB/CBG-MEB', 'PL': 'URPL', 'PT': 'INFARMED', 'RO': 'ANMDM',
  'SK': 'SUKL', 'SI': 'JAZMP', 'ES': 'AEMPS', 'SE': 'MPA',
  'JP': 'PMDA',
  'AU': 'TGA',
  'NZ': 'MEDSAFE',
  'CN': 'NMPA',
  'IN': 'CDSCO',
  'BR': 'ANVISA',
  'MX': 'COFEPRIS',
  'KR': 'MFDS',
  'SG': 'HSA',
  'HK': 'DH',
  'TW': 'TFDA',
  'AE': 'MOHAP',
  'SA': 'SFDA',
  'ZA': 'SAHPRA',
  'RU': 'ROSMINZDRAV',
};

const ISO3166_ALPHA2 = new Set(Object.keys(COUNTRY_REGULATORY_AUTHORITY));

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function objectValues(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeCountryCode(input: string): string | null {
  if (!input) return null;
  const normalized = input.trim().toUpperCase();
  if (normalized.length === 2 && ISO3166_ALPHA2.has(normalized)) {
    return normalized;
  }
  if (normalized.length === 3) {
    // ISO 3166-1 alpha-3 to alpha-2 mapping (common ones)
    const alpha3to2: Record<string, string> = {
      'USA': 'US', 'CAN': 'CA', 'GBR': 'GB', 'DEU': 'DE', 'FRA': 'FR',
      'JPN': 'JP', 'AUS': 'AU', 'CHN': 'CN', 'IND': 'IN', 'BRA': 'BR',
      'MEX': 'MX', 'KOR': 'KR', 'SGP': 'SG', 'HKG': 'HK', 'TWN': 'TW',
      'ARE': 'AE', 'SAU': 'SA', 'ZAF': 'ZA', 'RUS': 'RU',
    };
    return alpha3to2[normalized] || null;
  }
  return null;
}

function extractCountryFromPayload(payload: Record<string, unknown>, fieldNames: string[]): { code: string; sourceField: string } | null {
  for (const field of fieldNames) {
    const value = payload[field];
    if (value) {
      const code = normalizeCountryCode(text(value));
      if (code) return { code, sourceField: field };
    }
  }
  return null;
}

function extractCountryFromReporter(reporter: Record<string, unknown>): { code: string; sourceField: string } | null {
  // Check reporter object directly first
  const directFields = ['country_code', 'country', 'reporter_country', 'address_country'];
  for (const field of directFields) {
    const value = reporter[field];
    if (value) {
      const code = normalizeCountryCode(text(value));
      if (code) return { code, sourceField: field };
    }
  }
  // Then check nested payloads
  const payload = { ...objectValues(reporter.reporter_payload), ...objectValues(reporter.e2b_c2_payload) };
  const nestedFields = ['country_code', 'country', 'reporter_country', 'address_country'];
  return extractCountryFromPayload(payload, nestedFields);
}

function getRegulatoryAuthority(countryCode: string): string {
  return COUNTRY_REGULATORY_AUTHORITY[countryCode] || 'OTHER';
}

function determineJurisdiction(countryCode: string): CountryIncidentSnapshot['jurisdiction'] {
  const authority = getRegulatoryAuthority(countryCode);
  switch (authority) {
    case 'FDA': return 'FDA';
    case 'EMA': return 'EMA';
    case 'PMDA': return 'PMDA';
    case 'HC': return 'HC';
    case 'TGA': return 'TGA';
    case 'MHRA': return 'EMA'; // Post-Brexit UK
    default: return 'OTHER';
  }
}

// ============================================================================
// AGENT 8 IMPLEMENTATION
// ============================================================================

export class CountryIncidentAgent extends BaseAgent {
  constructor(config: {
    tenant_id: string;
    inference_router: HybridInferenceRouter;
    audit_ledger: AuditLedgerService;
    zdr_store: ZDRStore;
  }) {
    super({
      agent_id: 'agent-8-country-incident',
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
      agent_id: 'agent-8-country-incident',
      name: 'Country of Incident Agent (AG08)',
      description: 'Extracts and validates country of occurrence and reporter country per ICH E2B(R3); determines regulatory authority jurisdiction',
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
              events: { type: 'array', items: { type: 'object' } },
              sourcePayload: { type: 'object' },
              intakePayload: { type: 'object' },
            },
            required: ['patients', 'reporters', 'events'],
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
      estimated_latency_ms: 1000,
      max_concurrent: 30,
    };
  }

  async execute(input: AgentExecutionInput): Promise<AgentResult> {
    const startTime = Date.now();
    const inputPayload = input.payload as { intakeRecordId: string; tenantId: string; entities: { patients: Array<Record<string, unknown>>; reporters: Array<Record<string, unknown>>; events: Array<Record<string, unknown>>; sourcePayload?: Record<string, unknown>; intakePayload?: Record<string, unknown> } };

    try {
      const { intakeRecordId, entities } = inputPayload;
      const { patients, reporters, events, sourcePayload, intakePayload } = entities;

      // --- 1. Country of Occurrence (from events) ---
      let countryOfOccurrence: CountryIncidentSnapshot['countryOfOccurrence'] = {
        field: 'COUNTRY_OF_OCCURRENCE',
        status: 'MISSING',
        evidence: [],
        reason: 'No event country found.',
        sourceField: '',
      };

      for (const event of events) {
        const countryFields = ['country_of_occurrence', 'occurrence_country', 'event_country', 'country'];
        for (const field of countryFields) {
          const value = (event as Record<string, unknown>)[field];
          if (value) {
            const code = normalizeCountryCode(text(value));
            if (code) {
              countryOfOccurrence = {
                field: 'COUNTRY_OF_OCCURRENCE',
                status: 'VALID',
                countryCode: code,
                countryName: code,
                sourceField: field,
                evidence: [`Event field "${field}": ${value}`],
                reason: `Country of occurrence identified as ${code} from event field "${field}".`,
                regulatoryAuthority: getRegulatoryAuthority(code),
              };
              break;
            }
          }
        }
        if (countryOfOccurrence.status === 'VALID') break;
      }

      // --- 2. Reporter Country ---
      let reporterCountry: CountryIncidentSnapshot['reporterCountry'] = {
        field: 'REPORTER_COUNTRY',
        status: 'MISSING',
        evidence: [],
        reason: 'No reporter country found.',
        sourceField: '',
      };

      for (const reporter of entities.reporters) {
        const extracted = extractCountryFromReporter(reporter);
        if (extracted) {
          // Get the actual value for evidence
          let evidenceValue = '';
          const directFields = ['country_code', 'country', 'reporter_country', 'address_country'];
          for (const field of directFields) {
            if (reporter[field]) {
              evidenceValue = text(reporter[field]);
              break;
            }
          }
          if (!evidenceValue) {
            const payload = { ...objectValues(reporter.reporter_payload), ...objectValues(reporter.e2b_c2_payload) };
            const nestedFields = ['country_code', 'country', 'reporter_country', 'address_country'];
            for (const field of nestedFields) {
              if (payload[field]) {
                evidenceValue = text(payload[field]);
                break;
              }
            }
          }

          reporterCountry = {
            field: 'REPORTER_COUNTRY',
            status: 'VALID',
            countryCode: extracted.code,
            countryName: extracted.code,
            sourceField: extracted.sourceField,
            evidence: [`Reporter field "${extracted.sourceField}": ${evidenceValue}`],
            reason: `Reporter country identified as ${extracted.code} from field "${extracted.sourceField}".`,
            regulatoryAuthority: getRegulatoryAuthority(extracted.code),
          };
          break;
        }
      }

      // --- 3. Patient Country (fallback) ---
      let patientCountry: CountryIncidentSnapshot['reporterCountry'] = {
        field: 'PATIENT_COUNTRY',
        status: 'MISSING',
        evidence: [],
        reason: 'No patient country found.',
        sourceField: '',
      };

      const bestPatient = entities.patients?.find(p => text(p.country_code) || text(p.country));
      if (bestPatient) {
        const code = normalizeCountryCode(text(bestPatient.country_code) || text(bestPatient.country));
        if (code) {
          patientCountry = {
            field: 'PATIENT_COUNTRY',
            status: 'VALID',
            countryCode: code,
            countryName: code,
            sourceField: 'patient.country_code',
            evidence: [`Patient country_code: ${code}`],
            reason: `Patient country identified as ${code}.`,
            regulatoryAuthority: getRegulatoryAuthority(code),
          };
        }
      }

      // --- 4. Determine Primary Country ---
      let primaryCountry: CountryIncidentSnapshot['primaryCountry'];
      let crossBorder = false;

      // Priority: Country of Occurrence > Reporter Country > Patient Country
      if (countryOfOccurrence.status === 'VALID') {
        primaryCountry = countryOfOccurrence;
        if (reporterCountry.status === 'VALID' && reporterCountry.countryCode !== countryOfOccurrence.countryCode) {
          crossBorder = true;
        }
        if (patientCountry.status === 'VALID' && patientCountry.countryCode !== countryOfOccurrence.countryCode) {
          crossBorder = true;
        }
      } else if (reporterCountry.status === 'VALID') {
        primaryCountry = reporterCountry;
        if (patientCountry.status === 'VALID' && patientCountry.countryCode !== reporterCountry.countryCode) {
          crossBorder = true;
        }
      } else if (patientCountry.status === 'VALID') {
        primaryCountry = patientCountry;
      } else {
        primaryCountry = {
          field: 'PRIMARY_COUNTRY',
          status: 'MISSING',
          evidence: [],
          reason: 'No valid country identified from any source.',
          sourceField: '',
        };
      }

      const regulatoryAuthority = primaryCountry.regulatoryAuthority || getRegulatoryAuthority(primaryCountry.countryCode || '');
      const jurisdiction = determineJurisdiction(primaryCountry.countryCode || '');

      // Follow-up reasons
      const followUpReasons: string[] = [];
      if (countryOfOccurrence.status !== 'VALID') {
        followUpReasons.push('Country of occurrence is missing or invalid; required for regulatory routing.');
      }
      if (reporterCountry.status !== 'VALID') {
        followUpReasons.push('Reporter country is missing; required for regional regulatory submission.');
      }
      if (crossBorder) {
        followUpReasons.push('Cross-border case detected; verify correct regulatory authority for submission.');
      }
      if (primaryCountry.status !== 'VALID') {
        followUpReasons.push('Primary country could not be determined; manual review required.');
      }

      const followUpRequired = followUpReasons.length > 0;
      const humanDecisionRequired = primaryCountry.status !== 'VALID' || crossBorder;

      const systemSnapshot = {
        countryOfOccurrence,
        reporterCountry,
        primaryCountry,
        regulatoryAuthority: primaryCountry.regulatoryAuthority || getRegulatoryAuthority(primaryCountry.countryCode || ''),
        jurisdiction: determineJurisdiction(primaryCountry.countryCode || ''),
        crossBorder,
        followUpRequired,
        followUpReasons,
      };

      const output = {
        trace_id: `trc_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 8)}`,
        intakeRecordId: inputPayload.intakeRecordId || `rec_${Date.now().toString(36)}`,
        systemSnapshot,
        humanDecisionRequired,
        execution_tier: 'HEURISTIC' as const,
        model_name: 'heuristic-country-v1',
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
      agent_id: 'agent-8-country-incident',
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

export function createCountryIncidentAgent(config: {
  tenant_id: string;
  inference_router: HybridInferenceRouter;
  audit_ledger: AuditLedgerService;
  zdr_store: ZDRStore;
}): CountryIncidentAgent {
  return new CountryIncidentAgent(config);
}