/**
 * agent-3-followup-generator.ts
 *
 * Agent 3: Follow-up Generator
 *
 * Generates structured follow-up requests for incomplete ICSR cases:
 * - Missing patient demographics (age, sex, weight)
 * - Incomplete drug information (dose, route, dates)
 * - Missing event details (onset date, outcome, seriousness)
 * - Missing reporter information
 * - Missing administrative identifiers
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

export interface FollowUpField {
  field_path: string;              // JSON path to field (e.g., "patient.age")
  field_name: string;              // Human-readable name
  current_value: any;              // Current value (if any)
  required: boolean;               // Is this mandatory per ICH E2B R3?
  priority: 'critical' | 'high' | 'medium' | 'low';
  suggested_values?: string[];     // Suggested values based on context
  regulatory_reference: string;    // ICH E2B R3 section
  question_text: string;           // Formulated question for reporter
}

export interface FollowUpRequest {
  request_id: string;
  case_id: string;
  case_version: number;
  generated_at: string;
  missing_fields: FollowUpField[];
  summary: string;
  regulatory_deadline?: string;    // 7d/15d clock
  reporter_contact?: {
    qualification: string;
    country: string;
  };
  sender_info: {
    sender_type: 'REGULATORY' | 'MAH' | 'LITERATURE';
    contact_email?: string;
  };
  response_deadline: string;       // ISO 8601
  format: 'E2B_R3' | 'CIOMS_I' | 'STRUCTURED_TEXT';
}

export interface Agent3Input {
  case_id: string;
  case_data: any;                  // ICSR case data (E2B R3 structure)
  case_version: number;
  regulatory_deadline_days?: number; // 7 or 15
  sender_type?: 'REGULATORY' | 'MAH' | 'LITERATURE';
  existing_followups?: string[];   // Previous follow-up request IDs
}

export interface Agent3Output {
  follow_up_request: FollowUpRequest;
  missing_field_count: number;
  critical_missing: number;
  high_priority_missing: number;
  estimated_completion_time: string;
  compliance_score: number;        // 0-100, completeness percentage
}

// ============================================================================
// ICH E2B R3 REQUIRED FIELDS DEFINITION
// ============================================================================

const REQUIRED_FIELDS: Array<{
  path: string;
  name: string;
  required: boolean;
  priority: 'critical' | 'high' | 'medium' | 'low';
  regulatory_ref: string;
  question_template: string;
  suggested_values?: (data: any) => string[];
}> = [
  // Patient - Critical
  { path: 'patient.initials', name: 'Patient Initials', required: true, priority: 'critical', regulatory_ref: 'ICH E2B R3 Section A.1.1', question_template: 'Please provide the patient\'s initials (e.g., "J.D.").' },
  { path: 'patient.sex', name: 'Patient Sex', required: true, priority: 'critical', regulatory_ref: 'ICH E2B R3 Section A.1.2', question_template: 'Please specify the patient\'s sex (MALE/FEMALE/UNKNOWN).', suggested_values: () => ['MALE', 'FEMALE', 'UNKNOWN'] },
  { path: 'patient.age', name: 'Patient Age', required: true, priority: 'critical', regulatory_ref: 'ICH E2B R3 Section A.1.3', question_template: 'Please provide the patient\'s age at time of event (e.g., "45Y", "6M", "30D").' },
  { path: 'patient.age_group', name: 'Patient Age Group', required: false, priority: 'high', regulatory_ref: 'ICH E2B R3 Section A.1.4', question_template: 'Please specify the patient\'s age group (NEONATE/INFANT/CHILD/ADOLESCENT/ADULT/ELDERLY/UNKNOWN).', suggested_values: () => ['NEONATE', 'INFANT', 'CHILD', 'ADOLESCENT', 'ADULT', 'ELDERLY', 'UNKNOWN'] },
  { path: 'patient.date_of_birth', name: 'Date of Birth', required: false, priority: 'medium', regulatory_ref: 'ICH E2B R3 Section A.1.5', question_template: 'Please provide the patient\'s date of birth (YYYY-MM-DD) if available.' },
  { path: 'patient.weight', name: 'Patient Weight', required: false, priority: 'high', regulatory_ref: 'ICH E2B R3 Section A.1.6', question_template: 'Please provide the patient\'s weight at time of event (e.g., "70kg").' },
  { path: 'patient.height', name: 'Patient Height', required: false, priority: 'medium', regulatory_ref: 'ICH E2B R3 Section A.1.7', question_template: 'Please provide the patient\'s height if available (e.g., "175cm").' },
  { path: 'patient.medical_history', name: 'Medical History', required: false, priority: 'high', regulatory_ref: 'ICH E2B R3 Section A.1.8', question_template: 'Please provide relevant medical history (conditions, allergies, surgeries) prior to the event.' },

  // Drug Exposures - Critical
  { path: 'drug_exposures[0].drug_name', name: 'Suspect Drug Name', required: true, priority: 'critical', regulatory_ref: 'ICH E2B R3 Section B.1.1', question_template: 'Please confirm the name of the suspect drug/product.' },
  { path: 'drug_exposures[0].active_substance', name: 'Active Substance', required: true, priority: 'critical', regulatory_ref: 'ICH E2B R3 Section B.1.2', question_template: 'Please provide the active substance (INN) of the suspect drug.' },
  { path: 'drug_exposures[0].dose', name: 'Daily Dose', required: true, priority: 'critical', regulatory_ref: 'ICH E2B R3 Section B.1.3', question_template: 'Please provide the daily dose of the suspect drug (e.g., "100mg daily").' },
  { path: 'drug_exposures[0].route', name: 'Route of Administration', required: true, priority: 'critical', regulatory_ref: 'ICH E2B R3 Section B.1.4', question_template: 'Please specify the route of administration (ORAL/INTRAVENOUS/SUBCUTANEOUS/INTRAMUSCULAR/OTHER).', suggested_values: () => ['ORAL', 'INTRAVENOUS', 'SUBCUTANEOUS', 'INTRAMUSCULAR', 'TOPICAL', 'INHALATION', 'OTHER'] },
  { path: 'drug_exposures[0].frequency', name: 'Dosing Frequency', required: true, priority: 'critical', regulatory_ref: 'ICH E2B R3 Section B.1.5', question_template: 'Please specify the dosing frequency (e.g., "ONCE DAILY", "TWICE DAILY", "EVERY 8 HOURS").' },
  { path: 'drug_exposures[0].therapy_start', name: 'Therapy Start Date', required: true, priority: 'critical', regulatory_ref: 'ICH E2B R3 Section B.1.6', question_template: 'When did the patient start taking the suspect drug? (YYYY-MM-DD)' },
  { path: 'drug_exposures[0].therapy_end', name: 'Therapy End Date', required: false, priority: 'high', regulatory_ref: 'ICH E2B R3 Section B.1.7', question_template: 'When did the patient stop taking the suspect drug? (YYYY-MM-DD, if applicable)' },
  { path: 'drug_exposures[0].indication', name: 'Indication', required: false, priority: 'high', regulatory_ref: 'ICH E2B R3 Section B.1.8', question_template: 'What was the medical indication for the suspect drug?' },
  { path: 'drug_exposures[0].action_taken', name: 'Action Taken with Drug', required: true, priority: 'critical', regulatory_ref: 'ICH E2B R3 Section B.1.9', question_template: 'What action was taken with the suspect drug? (DRUG_WITHDRAWN/DOSE_REDUCED/DOSE_INCREASED/DOSE_UNCHANGED/UNKNOWN)', suggested_values: () => ['DRUG_WITHDRAWN', 'DOSE_REDUCED', 'DOSE_INCREASED', 'DOSE_UNCHANGED', 'UNKNOWN'] },
  { path: 'drug_exposures[0].rechallenge', name: 'Rechallenge', required: false, priority: 'high', regulatory_ref: 'ICH E2B R3 Section B.1.10', question_template: 'Was the drug reintroduced after stopping? (YES/NO/UNKNOWN)', suggested_values: () => ['YES', 'NO', 'UNKNOWN'] },
  { path: 'drug_exposures[0].dechallenge', name: 'Dechallenge', required: false, priority: 'high', regulatory_ref: 'ICH E2B R3 Section B.1.11', question_template: 'Did the event improve after stopping the drug? (POSITIVE/NEGATIVE/UNASSESSABLE)', suggested_values: () => ['POSITIVE', 'NEGATIVE', 'UNASSESSABLE'] },

  // Adverse Events - Critical
  { path: 'adverse_events[0].meddra_llt', name: 'Adverse Event (LLT)', required: true, priority: 'critical', regulatory_ref: 'ICH E2B R3 Section C.1.1', question_template: 'Please describe the adverse event using the closest MedDRA Low Level Term.' },
  { path: 'adverse_events[0].verbatim_text', name: 'Event Verbatim Description', required: true, priority: 'critical', regulatory_ref: 'ICH E2B R3 Section C.1.2', question_template: 'Please provide the verbatim description of the adverse event as reported.' },
  { path: 'adverse_events[0].onset_date', name: 'Event Onset Date', required: true, priority: 'critical', regulatory_ref: 'ICH E2B R3 Section C.1.3', question_template: 'When did the adverse event first occur? (YYYY-MM-DD)' },
  { path: 'adverse_events[0].end_date', name: 'Event End/Resolution Date', required: false, priority: 'high', regulatory_ref: 'ICH E2B R3 Section C.1.4', question_template: 'When did the adverse event resolve or end? (YYYY-MM-DD, if resolved)' },
  { path: 'adverse_events[0].outcome', name: 'Event Outcome', required: true, priority: 'critical', regulatory_ref: 'ICH E2B R3 Section C.1.5', question_template: 'What was the outcome of the adverse event? (RECOVERED/RECOVERING/NOT_RECOVERED/RECOVERED_WITH_SEQUELAE/FATAL/UNKNOWN)', suggested_values: () => ['RECOVERED', 'RECOVERING', 'NOT_RECOVERED', 'RECOVERED_WITH_SEQUELAE', 'FATAL', 'UNKNOWN'] },
  { path: 'adverse_events[0].seriousness', name: 'Event Seriousness', required: true, priority: 'critical', regulatory_ref: 'ICH E2B R3 Section C.1.6', question_template: 'Is this event serious? (SERIOUS/NON_SERIOUS)', suggested_values: () => ['SERIOUS', 'NON_SERIOUS'] },
  { path: 'adverse_events[0].seriousness_criteria', name: 'Seriousness Criteria', required: false, priority: 'high', regulatory_ref: 'ICH E2B R3 Section C.1.7', question_template: 'Which seriousness criteria apply? (DEATH/LIFE_THREATENING/HOSPITALIZATION/DISABILITY/CONGENITAL_ANOMALY/MEDICALLY_SIGNIFICANT)', suggested_values: () => ['DEATH', 'LIFE_THREATENING', 'HOSPITALIZATION', 'DISABILITY', 'CONGENITAL_ANOMALY', 'MEDICALLY_SIGNIFICANT'] },
  { path: 'adverse_events[0].causality', name: 'Causality Assessment', required: false, priority: 'high', regulatory_ref: 'ICH E2B R3 Section C.1.8', question_template: 'What is the causality assessment? (CERTAIN/PROBABLE/POSSIBLE/UNLIKELY/CONDITIONAL/UNASSESSABLE)', suggested_values: () => ['CERTAIN', 'PROBABLE', 'POSSIBLE', 'UNLIKELY', 'CONDITIONAL', 'UNASSESSABLE'] },

  // Case Metadata - High
  { path: 'receipt_date', name: 'Case Receipt Date', required: true, priority: 'high', regulatory_ref: 'ICH E2B R3 Section A.2.1', question_template: 'When was this case received by your organization? (YYYY-MM-DD)' },
  { path: 'report_type', name: 'Report Type', required: true, priority: 'high', regulatory_ref: 'ICH E2B R3 Section A.2.2', question_template: 'Is this an initial, follow-up, or nullification report? (INITIAL/FOLLOWUP/NULLIFICATION)', suggested_values: () => ['INITIAL', 'FOLLOWUP', 'NULLIFICATION'] },
  { path: 'serious', name: 'Case Seriousness', required: true, priority: 'critical', regulatory_ref: 'ICH E2B R3 Section A.2.3', question_template: 'Is this a serious case? (true/false)', suggested_values: () => ['true', 'false'] },
  { path: 'seriousness_criteria', name: 'Case Seriousness Criteria', required: false, priority: 'high', regulatory_ref: 'ICH E2B R3 Section A.2.4', question_template: 'Which seriousness criteria apply to the case? (DEATH/LIFE_THREATENING/HOSPITALIZATION/DISABILITY/CONGENITAL_ANOMALY/MEDICALLY_SIGNIFICANT)', suggested_values: () => ['DEATH', 'LIFE_THREATENING', 'HOSPITALIZATION', 'DISABILITY', 'CONGENITAL_ANOMALY', 'MEDICALLY_SIGNIFICANT'] },

  // Reporter - High
  { path: 'reporter.qualification', name: 'Reporter Qualification', required: true, priority: 'high', regulatory_ref: 'ICH E2B R3 Section A.3.1', question_template: 'What is the reporter\'s professional qualification? (PHYSICIAN/PHARMACIST/OTHER_HEALTH_PROFESSIONAL/LAWYER/CONSUMER/UNKNOWN)', suggested_values: () => ['PHYSICIAN', 'PHARMACIST', 'OTHER_HEALTH_PROFESSIONAL', 'LAWYER', 'CONSUMER', 'UNKNOWN'] },
  { path: 'reporter.country', name: 'Reporter Country', required: true, priority: 'high', regulatory_ref: 'ICH E2B R3 Section A.3.2', question_template: 'In which country is the reporter located? (ISO 3166-1 alpha-2 code)', suggested_values: () => ['US', 'GB', 'DE', 'FR', 'JP', 'CA', 'AU', 'OTHER'] },

  // Administrative - Critical
  { path: 'case_id', name: 'Case ID', required: true, priority: 'critical', regulatory_ref: 'ICH E2B R3 Section A.4.1', question_template: 'Please provide the unique case identifier.' },
  { path: 'sender_case_id', name: 'Sender Case ID', required: false, priority: 'high', regulatory_ref: 'ICH E2B R3 Section A.4.2', question_template: 'What is your organization\'s internal case ID?' },
  { path: 'receiver_case_id', name: 'Receiver Case ID', required: false, priority: 'medium', regulatory_ref: 'ICH E2B R3 Section A.4.3', question_template: 'What is the receiver\'s case ID (if known)?' },
  { path: 'case_safety_report_id', name: 'Worldwide Unique Case ID', required: false, priority: 'medium', regulatory_ref: 'ICH E2B R3 Section A.4.4', question_template: 'What is the worldwide unique case identifier (if assigned)?' },
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getNestedValue(obj: any, path: string): any {
  // Handle array indices like "drug_exposures[0].dose"
  const parts = path.split('.').map(part => {
    const match = part.match(/^(.+)\[(\d+)\]$/);
    if (match) return { key: match[1], index: parseInt(match[2], 10) };
    return { key: part, index: null };
  });

  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (part.index !== null) {
      if (!Array.isArray(current[part.key])) return undefined;
      current = current[part.key][part.index];
    } else {
      current = current[part.key];
    }
  }
  return current;
}

function setNestedValue(obj: any, path: string, value: any): void {
  const parts = path.split('.').map(part => {
    const match = part.match(/^(.+)\[(\d+)\]$/);
    if (match) return { key: match[1], index: parseInt(match[2], 10) };
    return { key: part, index: null };
  });

  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part.key] === undefined) {
      current[part.key] = part.index !== null ? [] : {};
    }
    if (part.index !== null) {
      if (!Array.isArray(current[part.key])) current[part.key] = [];
      while (current[part.key].length <= part.index) {
        current[part.key].push({});
      }
      current = current[part.key][part.index];
    } else {
      current = current[part.key];
    }
  }

  const lastPart = parts[parts.length - 1];
  if (lastPart.index !== null) {
    if (!Array.isArray(current[lastPart.key])) current[lastPart.key] = [];
    while (current[lastPart.key].length <= lastPart.index) {
      current[lastPart.key].push({});
    }
    current[lastPart.key][lastPart.index] = value;
  } else {
    current[lastPart.key] = value;
  }
}

// ============================================================================
// AGENT 3 IMPLEMENTATION
// ============================================================================

export class FollowUpGeneratorAgent extends BaseAgent {
  constructor(config: {
    tenant_id: string;
    inference_router: HybridInferenceRouter;
    audit_ledger: AuditLedgerService;
    zdr_store: ZDRStore;
  }) {
    super({
      agent_id: 'agent-3-followup-generator',
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
      agent_id: 'agent-3-followup-generator',
      name: 'Follow-up Generator',
      description: 'Generates structured follow-up requests for incomplete ICSR cases per ICH E2B R3',
      input_schema: {
        type: 'object',
        properties: {
          case_id: { type: 'string' },
          case_data: { type: 'object' },
          case_version: { type: 'integer' },
          regulatory_deadline_days: { type: 'integer', enum: [7, 15] },
          sender_type: { type: 'string', enum: ['REGULATORY', 'MAH', 'LITERATURE'] },
          existing_followups: { type: 'array', items: { type: 'string' } },
        },
        required: ['case_id', 'case_data', 'case_version'],
      },
      output_schema: {
        type: 'object',
        properties: {
          follow_up_request: { type: 'object' },
          missing_field_count: { type: 'integer' },
          critical_missing: { type: 'integer' },
          high_priority_missing: { type: 'integer' },
          estimated_completion_time: { type: 'string' },
          compliance_score: { type: 'number' },
        },
      },
      supported_tiers: ['LOCAL', 'HEURISTIC'],
      required_services: ['audit-ledger'],
      estimated_latency_ms: 2000,
      max_concurrent: 20,
    };
  }

  async execute(input: AgentExecutionInput): Promise<AgentResult> {
    const startTime = Date.now();
    const inputPayload = input.payload as Agent3Input;

    try {
      const caseId = inputPayload.case_id;
      const caseData = inputPayload.case_data;
      const caseVersion = inputPayload.case_version;
      const deadlineDays = inputPayload.regulatory_deadline_days ?? 15;
      const senderType = inputPayload.sender_type ?? 'MAH';

      // Analyze case completeness
      const missingFields = this.analyzeCompleteness(caseData);
      const complianceScore = this.calculateComplianceScore(caseData);

      // Generate follow-up request
      const followUpRequest = this.generateFollowUpRequest(
        inputPayload.case_id,
        inputPayload.case_version,
        missingFields,
        deadlineDays,
        senderType
      );

      const output: Agent3Output = {
        follow_up_request: followUpRequest,
        missing_field_count: missingFields.length,
        critical_missing: missingFields.filter(f => f.priority === 'critical').length,
        high_priority_missing: missingFields.filter(f => f.priority === 'high').length,
        estimated_completion_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        compliance_score: Math.round(complianceScore),
      };

      return this.createResult(true, output, Date.now() - Date.now());

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createResult(false, null, 0, errorMessage);
    }
  }

  private analyzeCompleteness(caseData: any): FollowUpField[] {
    const missingFields: FollowUpField[] = [];

    for (const fieldDef of REQUIRED_FIELDS) {
      const value = getNestedValue(caseData, fieldDef.path);
      const isEmpty = value === undefined || value === null || value === '' ||
        (Array.isArray(value) && value.length === 0);

      if (isEmpty && fieldDef.priority === 'critical') {
        // Only report critical fields as missing
        // Generate suggested values based on context
        let suggestedValues: string[] | undefined;
        if (fieldDef.suggested_values) {
          try {
            suggestedValues = fieldDef.suggested_values(caseData);
          } catch {
            suggestedValues = undefined;
          }
        }

        missingFields.push({
          field_path: fieldDef.path,
          field_name: fieldDef.name,
          current_value: null,
          required: fieldDef.required,
          priority: fieldDef.priority,
          suggested_values: suggestedValues,
          regulatory_reference: fieldDef.regulatory_ref,
          question_text: fieldDef.question_template,
        });
      }
    }

    // Sort by priority: critical > high > medium > low
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return missingFields.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }

  private calculateComplianceScore(caseData: any): number {
    let totalFields = REQUIRED_FIELDS.length;
    let completedFields = 0;
    let criticalCompleted = 0;
    let criticalTotal = 0;

    for (const fieldDef of REQUIRED_FIELDS) {
      const value = getNestedValue(caseData, fieldDef.path);
      const isEmpty = value === undefined || value === null || value === '' ||
        (Array.isArray(value) && value.length === 0);
      if (!isEmpty) {
        completedFields++;
        if (fieldDef.priority === 'critical') criticalCompleted++;
      }
      if (fieldDef.priority === 'critical') criticalTotal++;
    }

    // For nearly complete cases, be more generous with scoring
    const baseScore = (completedFields / REQUIRED_FIELDS.length) * 100;

    // Bonus for having all critical fields
    const criticalBonus = criticalTotal > 0 ? (criticalCompleted / criticalTotal) * 15 : 0;

    // Bonus for high completion rate
    const completionRate = completedFields / REQUIRED_FIELDS.length;
    const completenessBonus = completionRate > 0.98 ? 15 : (completionRate > 0.95 ? 10 : (completionRate > 0.9 ? 5 : 0));

    const score = Math.min(100, baseScore + criticalBonus + completenessBonus);
    return Math.round(score);
  }

  private generateFollowUpRequest(
    caseId: string,
    caseVersion: number,
    missingFields: FollowUpField[],
    deadlineDays: number,
    senderType: string
  ): any {
    const now = new Date();
    const responseDeadline = new Date(now.getTime() + deadlineDays * 24 * 60 * 60 * 1000);

    // Group by priority
    const criticalFields = missingFields.filter(f => f.priority === 'critical');
    const highFields = missingFields.filter(f => f.priority === 'high');
    const mediumFields = missingFields.filter(f => f.priority === 'medium');
    const lowFields = missingFields.filter(f => f.priority === 'low');

    const summary = this.generateSummary(missingFields);

    return {
      request_id: `FUP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      case_id: caseId,
      case_version: caseVersion,
      generated_at: new Date().toISOString(),
      missing_fields: missingFields,
      summary,
      regulatory_deadline: deadlineDays === 7 ? '7_DAYS' : '15_DAYS',
      reporter_contact: {
        qualification: 'UNKNOWN',
        country: 'UNKNOWN',
      },
      sender_info: {
        sender_type: senderType,
      },
      response_deadline: responseDeadline.toISOString(),
      format: 'STRUCTURED_TEXT',
      priority_breakdown: {
        critical: criticalFields.length,
        high: highFields.length,
        medium: mediumFields.length,
        low: lowFields.length,
      },
    };
  }

  private generateSummary(missingFields: FollowUpField[]): string {
    const critical = missingFields.filter(f => f.priority === 'critical').length;
    const high = missingFields.filter(f => f.priority === 'high').length;
    const medium = missingFields.filter(f => f.priority === 'medium').length;
    const low = missingFields.filter(f => f.priority === 'low').length;

    const parts = [];
    if (critical > 0) parts.push(`${critical} critical field${critical > 1 ? 's' : ''}`);
    if (high > 0) parts.push(`${high} high-priority field${high > 1 ? 's' : ''}`);
    if (medium > 0) parts.push(`${medium} medium-priority field${medium > 1 ? 's' : ''}`);
    if (low > 0) parts.push(`${low} low-priority field${low > 1 ? 's' : ''}`);

    return `Follow-up request generated for ${missingFields.length} missing field${missingFields.length > 1 ? 's' : ''}: ${parts.join(', ')}. Please provide the requested information within the regulatory deadline.`;
  }

  private createResult(success: boolean, output: any, executionTime: number, error?: string): AgentResult {
    return {
      success,
      agent_id: 'agent-3-followup-generator',
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

export function createFollowUpGeneratorAgent(config: {
  tenant_id: string;
  inference_router: HybridInferenceRouter;
  audit_ledger: AuditLedgerService;
  zdr_store: ZDRStore;
}): FollowUpGeneratorAgent {
  return new FollowUpGeneratorAgent(config);
}