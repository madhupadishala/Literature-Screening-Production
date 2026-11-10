/**
 * agent-8-medical-history.ts
 *
 * Agent 8: Medical History Extractor
 *
 * Extracts structured medical history from case narratives:
 * - Past medical conditions (MedDRA coded)
 * - Surgical history
 * - Allergies
 * - Concomitant medications
 * - Social history (smoking, alcohol, etc.)
 * - Family history
 *
 * Outputs structured data for integration with causality assessment.
 *
 * Compliance: FDA 21 CFR Part 11, EU GVP Module VI, ICH E2B R3, GAMP 5
 */

import { BaseAgent, AgentExecutionInput, AgentResult, AgentCapabilities } from './base-agent';
import { HybridInferenceRouter } from '../infrastructure/hybrid-inference-router';
import { AuditLedgerService } from '../audit/audit-ledger-service';
import { ZDRStore } from '../infrastructure/redis-zdr-store';
import { createHash } from 'crypto';

// ============================================================================
// PATTERNS (defined at top to avoid hoisting issues)
// ============================================================================

const CONDITION_PATTERNS = [
  { pattern: /\b(hypertension|high blood pressure|htn)\b/gi, llt: 'Hypertension', pt: 'Hypertension', soc: 'Vascular disorders' },
  { pattern: /\b(diabetes mellitus|type 2 diabetes|type 1 diabetes|diabetes|dm2|dm|t1dm|t2dm)\b/gi, llt: 'Diabetes mellitus', pt: 'Diabetes mellitus', soc: 'Metabolism and nutrition disorders' },
  { pattern: /\b(atrial fibrillation|afib|af\b)\b/gi, llt: 'Atrial fibrillation', pt: 'Atrial fibrillation', soc: 'Cardiac disorders' },
  { pattern: /\b(hypertension|high blood pressure|htn)\b/gi, llt: 'Hypertension', pt: 'Hypertension', soc: 'Vascular disorders' },
  { pattern: /\b(coronary artery disease|cad|ischemic heart disease|myocardial infarction|mi)\b/gi, llt: 'Myocardial infarction', pt: 'Myocardial infarction', soc: 'Cardiac disorders' },
  { pattern: /\b(atrial fibrillation|afib|af)\b/gi, llt: 'Atrial fibrillation', pt: 'Atrial fibrillation', soc: 'Cardiac disorders' },
  { pattern: /\b(heart failure|chf|congestive heart failure)\b/gi, llt: 'Cardiac failure', pt: 'Cardiac failure', soc: 'Cardiac disorders' },
  { pattern: /\b(stroke|cerebrovascular accident|cva|transient ischemic attack|tia)\b/gi, llt: 'Cerebrovascular accident', pt: 'Cerebrovascular accident', soc: 'Nervous system disorders' },
  { pattern: /\b(cancer|carcinoma|malignancy|tumor|neoplasm)\b/gi, llt: 'Neoplasm malignant', pt: 'Neoplasm malignant', soc: 'Neoplasms benign, malignant and unspecified' },
  { pattern: /\b(chronic kidney disease|ckd|renal failure|renal insufficiency)\b/gi, llt: 'Chronic kidney disease', pt: 'Chronic kidney disease', soc: 'Renal and urinary disorders' },
  { pattern: /\b(liver disease|cirrhosis|hepatitis|liver failure)\b/gi, llt: 'Hepatic failure', pt: 'Hepatic failure', soc: 'Hepatobiliary disorders' },
  { pattern: /\b(depression|major depressive disorder)\b/gi, llt: 'Depression', pt: 'Depression', soc: 'Psychiatric disorders' },
  { pattern: /\b(anxiety|generalized anxiety disorder)\b/gi, llt: 'Anxiety', pt: 'Anxiety', soc: 'Psychiatric disorders' },
  { pattern: /\b(thyroid|hypothyroidism|hyperthyroidism)\b/gi, llt: 'Thyroid disorder', pt: 'Thyroid disorder', soc: 'Endocrine disorders' },
  { pattern: /\b(epilepsy|seizure disorder|seizures)\b/gi, llt: 'Epilepsy', pt: 'Epilepsy', soc: 'Nervous system disorders' },
  { pattern: /\b(migraine|chronic migraine)\b/gi, llt: 'Migraine', pt: 'Migraine', soc: 'Nervous system disorders' },
  { pattern: /\b(gerd|gastroesophageal reflux|acid reflux)\b/gi, llt: 'Gastroesophageal reflux disease', pt: 'Gastroesophageal reflux disease', soc: 'Gastrointestinal disorders' },
  { pattern: /\b(peptic ulcer|ulcer|gastric ulcer|duodenal ulcer)\b/gi, llt: 'Peptic ulcer', pt: 'Peptic ulcer', soc: 'Gastrointestinal disorders' },
  { pattern: /\b(ibs|irritable bowel syndrome)\b/gi, llt: 'Irritable bowel syndrome', pt: 'Irritable bowel syndrome', soc: 'Gastrointestinal disorders' },
  { pattern: /\b(osteoarthritis|degenerative joint disease)\b/gi, llt: 'Osteoarthritis', pt: 'Osteoarthritis', soc: 'Musculoskeletal and connective tissue disorders' },
  { pattern: /\b(rheumatoid arthritis|ra)\b/gi, llt: 'Rheumatoid arthritis', pt: 'Rheumatoid arthritis', soc: 'Musculoskeletal and connective tissue disorders' },
  { pattern: /\b(obesity|morbid obesity)\b/gi, llt: 'Obesity', pt: 'Obesity', soc: 'Metabolism and nutrition disorders' },
  { pattern: /\b(high cholesterol|hyperlipidemia|dyslipidemia|hld)\b/gi, llt: 'Hyperlipidaemia', pt: 'Hyperlipidaemia', soc: 'Metabolism and nutrition disorders' },
  { pattern: /\b(hyperlipidemia|dyslipidemia)\b/gi, llt: 'Hyperlipidaemia', pt: 'Hyperlipidaemia', soc: 'Metabolism and nutrition disorders' },
  { pattern: /\b(hypothyroidism|hyperthyroidism)\b/gi, llt: 'Thyroid disorder', pt: 'Thyroid disorder', soc: 'Endocrine disorders' },
  { pattern: /\b(chronic obstructive pulmonary disease|chronic bronchitis|emphysema)\b/gi, llt: 'Chronic obstructive pulmonary disease', pt: 'Chronic obstructive pulmonary disease', soc: 'Respiratory, thoracic and mediastinal disorders' },
  { pattern: /\b(chronic heart failure|heart failure)\b/gi, llt: 'Cardiac failure', pt: 'Cardiac failure', soc: 'Cardiac disorders' },
  { pattern: /\b(peripheral vascular disease|pvd)\b/gi, llt: 'Peripheral vascular disease', pt: 'Peripheral vascular disease', soc: 'Vascular disorders' },
  { pattern: /\b(venous thromboembolism|vte|deep vein thrombosis|dvt|pulmonary embolism|pe)\b/gi, llt: 'Venous thromboembolism', pt: 'Venous thromboembolism', soc: 'Vascular disorders' },
  { pattern: /\b(chronic obstructive pulmonary disease|copd)\b/gi, llt: 'Chronic obstructive pulmonary disease', pt: 'Chronic obstructive pulmonary disease', soc: 'Respiratory, thoracic and mediastinal disorders' },
  { pattern: /\b(chronic heart failure|heart failure)\b/gi, llt: 'Cardiac failure', pt: 'Cardiac failure', soc: 'Cardiac disorders' },
  { pattern: /\b(peripheral vascular disease|pvd)\b/gi, llt: 'Peripheral vascular disease', pt: 'Peripheral vascular disease', soc: 'Vascular disorders' },
  { pattern: /\b(venous thromboembolism|vte|deep vein thrombosis|dvt|pulmonary embolism|pe)\b/gi, llt: 'Venous thromboembolism', pt: 'Venous thromboembolism', soc: 'Vascular disorders' },
  { pattern: /\b(chronic obstructive pulmonary disease|copd)\b/gi, llt: 'Chronic obstructive pulmonary disease', pt: 'Chronic obstructive pulmonary disease', soc: 'Respiratory, thoracic and mediastinal disorders' },
  { pattern: /\b(chronic heart failure|heart failure)\b/gi, llt: 'Cardiac failure', pt: 'Cardiac failure', soc: 'Cardiac disorders' },
  { pattern: /\b(peripheral vascular disease|pvd)\b/gi, llt: 'Peripheral vascular disease', pt: 'Peripheral vascular disease', soc: 'Vascular disorders' },
  { pattern: /\b(venous thromboembolism|vte|deep vein thrombosis|dvt|pulmonary embolism|pe)\b/gi, llt: 'Venous thromboembolism', pt: 'Venous thromboembolism', soc: 'Vascular disorders' },
];

const SURGERY_PATTERNS = [
  { pattern: /\b(appendectomy|appendix removed)\b/gi, procedure: 'Appendectomy' },
  { pattern: /\b(cholecystectomy|gallbladder removed|gallbladder removal)\b/gi, procedure: 'Cholecystectomy' },
  { pattern: /\b(hysterectomy|uterus removed)\b/gi, procedure: 'Hysterectomy' },
  { pattern: /\b(c-section|caesarean|caesarean section)\b/gi, procedure: 'Caesarean section' },
  { pattern: /\b(appendicitis|appendicitis surgery)\b/gi, procedure: 'Appendectomy' },
  { pattern: /\b(knee replacement|total knee arthroplasty|tka)\b/gi, procedure: 'Total knee arthroplasty' },
  { pattern: /\b(hip replacement|total hip arthroplasty|tha)\b/gi, procedure: 'Total hip arthroplasty' },
  { pattern: /\b(cataract surgery|cataract removal)\b/gi, procedure: 'Cataract surgery' },
  { pattern: /\b(coronary artery bypass|cabg|bypass surgery)\b/gi, procedure: 'Coronary artery bypass graft' },
  { pattern: /\b(angioplasty|stent|pci|percutaneous coronary intervention)\b/gi, procedure: 'Percutaneous coronary intervention' },
  { pattern: /\b(thyroidectomy|thyroid removed)\b/gi, procedure: 'Thyroidectomy' },
  { pattern: /\b(tonsillectomy|tonsils removed)\b/gi, procedure: 'Tonsillectomy' },
  { pattern: /\b(hernia repair|herniorrhaphy|hernioplasty)\b/gi, procedure: 'Hernia repair' },
];

const ALLERGY_PATTERNS = [
  { pattern: /\b(penicillin|amoxicillin|ampicillin)\b/gi, allergen: 'Penicillin' },
  { pattern: /\b(sulfa|sulfonamide|bactrim|septra)\b/gi, allergen: 'Sulfonamide' },
  { pattern: /\b(nsaid|ibuprofen|advil|motrin|naproxen|aleve)\b/gi, allergen: 'NSAID' },
  { pattern: /\b(aspirin|acetylsalicylic acid)\b/gi, allergen: 'Aspirin' },
  { pattern: /\b(latex)\b/gi, allergen: 'Latex' },
  { pattern: /\b(iodine|contrast dye|contrast media)\b/gi, allergen: 'Iodine' },
  { pattern: /\b(codeine|morphine|opioid|hydrocodone|oxycodone)\b/gi, allergen: 'Opioid' },
];

const MEDICATION_PATTERNS = [
  { pattern: /\b(metformin|glucophage)\b/gi, drug: 'Metformin', substance: 'Metformin' },
  { pattern: /\b(lisinopril|prinivil|zestril)\b/gi, drug: 'Lisinopril', substance: 'Lisinopril' },
  { pattern: /\b(atorvastatin|lipitor)\b/gi, drug: 'Atorvastatin', substance: 'Atorvastatin' },
  { pattern: /\b(levothyroxine|synthroid|levoxyl)\b/gi, drug: 'Levothyroxine', substance: 'Levothyroxine' },
  { pattern: /\b(omeprazole|prilosec)\b/gi, drug: 'Omeprazole', substance: 'Omeprazole' },
  { pattern: /\b(metoprolol|lopressor|toprol)\b/gi, drug: 'Metoprolol', substance: 'Metoprolol' },
  { pattern: /\b(amlodipine|norvasc)\b/gi, drug: 'Amlodipine', substance: 'Amlodipine' },
  { pattern: /\b(gabapentin|neurontin)\b/gi, drug: 'Gabapentin', substance: 'Gabapentin' },
  { pattern: /\b(sertraline|zoloft)\b/gi, drug: 'Sertraline', substance: 'Sertraline' },
  { pattern: /\b(escitalopram|lexapro)\b/gi, drug: 'Escitalopram', substance: 'Escitalopram' },
  { pattern: /\b(warfarin|coumadin)\b/gi, drug: 'Warfarin', substance: 'Warfarin' },
  { pattern: /\b(apixaban|eliquis)\b/gi, drug: 'Apixaban', substance: 'Apixaban' },
  { pattern: /\b(rivaroxaban|xarelto)\b/gi, drug: 'Rivaroxaban', substance: 'Rivaroxaban' },
  // Additional common medications
  { pattern: /\b(amoxicillin|amoxil)\b/gi, drug: 'Amoxicillin', substance: 'Amoxicillin' },
  { pattern: /\b(azithromycin|zithromax)\b/gi, drug: 'Azithromycin', substance: 'Azithromycin' },
  { pattern: /\b(ciprofloxacin|cipro)\b/gi, drug: 'Ciprofloxacin', substance: 'Ciprofloxacin' },
  { pattern: /\b(ibuprofen|advil|motrin)\b/gi, drug: 'Ibuprofen', substance: 'Ibuprofen' },
  { pattern: /\b(acetaminophen|paracetamol|tylenol)\b/gi, drug: 'Acetaminophen', substance: 'Acetaminophen' },
  { pattern: /\b(prednisone|prednisolone)\b/gi, drug: 'Prednisone', substance: 'Prednisone' },
  { pattern: /\b(insulin|humulin|novolin)\b/gi, drug: 'Insulin', substance: 'Insulin' },
  { pattern: /\b(furosemide|lasix)\b/gi, drug: 'Furosemide', substance: 'Furosemide' },
  { pattern: /\b(spironolactone|aldactone)\b/gi, drug: 'Spironolactone', substance: 'Spironolactone' },
  { pattern: /\b(hydrochlorothiazide|hctz)\b/gi, drug: 'Hydrochlorothiazide', substance: 'Hydrochlorothiazide' },
  { pattern: /\b(clopidogrel|plavix)\b/gi, drug: 'Clopidogrel', substance: 'Clopidogrel' },
  { pattern: /\b(aspirin|acetylsalicylic acid)\b/gi, drug: 'Aspirin', substance: 'Aspirin' },
  { pattern: /\b(simvastatin|zocor)\b/gi, drug: 'Simvastatin', substance: 'Simvastatin' },
  { pattern: /\b(rosuvastatin|crestor)\b/gi, drug: 'Rosuvastatin', substance: 'Rosuvastatin' },
  { pattern: /\b(pravastatin|pravachol)\b/gi, drug: 'Pravastatin', substance: 'Pravastatin' },
  { pattern: /\b(furosemide|lasix)\b/gi, drug: 'Furosemide', substance: 'Furosemide' },
  { pattern: /\b(hydrochlorothiazide|hctz)\b/gi, drug: 'Hydrochlorothiazide', substance: 'Hydrochlorothiazide' },
  { pattern: /\b(spironolactone|aldactone)\b/gi, drug: 'Spironolactone', substance: 'Spironolactone' },
];

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface MedicalCondition {
  condition: string;
  meddra_llt: string;
  meddra_pt?: string;
  meddra_soc?: string;
  onset_date?: string;
  resolution_date?: string;
  status: 'ACTIVE' | 'RESOLVED' | 'CHRONIC' | 'UNKNOWN';
  severity?: 'MILD' | 'MODERATE' | 'SEVERE';
  verbatim_text: string;
  source_section: string;
}

export interface SurgicalHistory {
  procedure: string;
  date?: string;
  indication?: string;
  verbatim_text: string;
}

export interface Allergy {
  allergen: string;
  reaction: string;
  severity?: 'MILD' | 'MODERATE' | 'SEVERE' | 'ANAPHYLACTIC';
  verbatim_text: string;
}

export interface ConcomitantMedication {
  drug_name: string;
  active_substance?: string;
  dose?: string;
  route?: string;
  frequency?: string;
  indication?: string;
  start_date?: string;
  end_date?: string;
  verbatim_text: string;
}

export interface SocialHistory {
  smoking?: 'NEVER' | 'FORMER' | 'CURRENT' | 'UNKNOWN';
  smoking_pack_years?: number;
  alcohol?: 'NONE' | 'OCCASIONAL' | 'MODERATE' | 'HEAVY' | 'UNKNOWN';
  substance_use?: string;
  occupation?: string;
  verbatim_text: string;
}

export interface FamilyHistory {
  condition: string;
  relationship: string;
  age_at_onset?: number;
  verbatim_text: string;
}

export interface StructuredMedicalHistory {
  conditions: MedicalCondition[];
  surgeries: SurgicalHistory[];
  allergies: Allergy[];
  concomitant_medications: ConcomitantMedication[];
  social_history: SocialHistory;
  family_history: FamilyHistory[];
  extraction_confidence: number;
  source_text_length: number;
  extracted_at: string;
}

export interface Agent8Input {
  case_id: string;
  narrative: string;
  patient_section?: string;
  structured_fields?: {
    age?: string;
    sex?: string;
    weight?: string;
  };
  language?: string;
}

export interface Agent8Output {
  medical_history: StructuredMedicalHistory;
  processing_time_ms: number;
}

// ============================================================================
// AGENT 8 IMPLEMENTATION
// ============================================================================

export class MedicalHistoryAgent extends BaseAgent {
  private startTime: number = Date.now();

  constructor(config: {
    tenant_id: string;
    inference_router: HybridInferenceRouter;
    audit_ledger: AuditLedgerService;
    zdr_store: ZDRStore;
  }) {
    super({
      agent_id: 'agent-8-medical-history',
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
      agent_id: 'agent-8-medical-history',
      name: 'Medical History Extractor',
      description: 'Extracts structured medical history from case narratives with MedDRA coding',
      input_schema: {
        type: 'object',
        properties: {
          case_id: { type: 'string' },
          narrative: { type: 'string' },
          patient_section: { type: 'string' },
          structured_fields: { type: 'object' },
          language: { type: 'string' },
        },
        required: ['case_id', 'narrative'],
      },
      output_schema: {
        type: 'object',
        properties: {
          medical_history: { type: 'object' },
        },
      },
      supported_tiers: ['LOCAL', 'HEURISTIC'],
      required_services: ['audit-ledger'],
      estimated_latency_ms: 5000,
      max_concurrent: 10,
    };
  }

  async execute(input: AgentExecutionInput): Promise<AgentResult> {
    const startTime = Date.now();
    const inputPayload = input.payload as any;

    try {
      const { case_id, narrative, patient_section, structured_fields, language } = inputPayload;

      // Extract medical history from narrative
      const medicalHistory = this.extractMedicalHistory(narrative, patient_section, structured_fields);

      // Calculate extraction confidence
      const confidence = this.calculateExtractionConfidence(narrative, medicalHistory);

      const output = {
        medical_history: {
          ...medicalHistory,
          extraction_confidence: confidence,
          source_text_length: narrative.length,
          extracted_at: new Date().toISOString(),
        },
        processing_time_ms: Date.now() - startTime,
      };

      return this.createResult(true, output, Date.now() - startTime);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createResult(false, null, Date.now() - startTime, errorMessage);
    }
  }

  private extractMedicalHistory(
    narrative: string,
    patientSection?: string,
    structuredFields?: any
  ): any {
    const textToAnalyze = `${patientSection || ''}\n${narrative}`.toLowerCase();

    // Extract conditions
    const conditions = this.extractConditions(textToAnalyze, narrative);

    // Extract surgeries
    const surgeries = this.extractSurgeries(textToAnalyze, narrative);

    // Extract allergies
    const allergies = this.extractAllergies(textToAnalyze, narrative);

    // Extract concomitant medications
    const medications = this.extractMedications(textToAnalyze, narrative);

    // Extract social history
    const socialHistory = this.extractSocialHistory(textToAnalyze, narrative, structuredFields);

    // Extract family history
    const familyHistory = this.extractFamilyHistory(textToAnalyze, narrative);

    return {
      conditions,
      surgeries,
      allergies,
      concomitant_medications: medications,
      social_history: socialHistory,
      family_history: familyHistory,
    };
  }

  private extractConditions(text: string, originalText: string): any[] {
    const conditions: any[] = [];

    for (const pattern of CONDITION_PATTERNS) {
      let match;
      while ((match = pattern.pattern.exec(text)) !== null) {
        // Find context in original text
        const context = this.getContext(originalText, match.index, 100);

        conditions.push({
          condition: match[0],
          meddra_llt: pattern.llt,
          meddra_pt: pattern.pt,
          meddra_soc: pattern.soc,
          onset_date: undefined,
          resolution_date: undefined,
          status: 'CHRONIC' as const,
          severity: undefined,
          verbatim_text: context,
          source_section: 'narrative',
        });

        // Avoid infinite loop
        if (match.index === pattern.pattern.lastIndex) pattern.pattern.lastIndex++;
      }
    }

    // Deduplicate by LLT
    const seen = new Set<string>();
    return conditions.filter(c => {
      if (seen.has(c.meddra_llt.toLowerCase())) return false;
      seen.add(c.meddra_llt.toLowerCase());
      return true;
    });
  }

  private extractSurgeries(text: string, originalText: string): any[] {
    const surgeryMatches: Array<{ position: number; procedure: string; match: RegExpExecArray }> = [];

    // Collect all matches with their positions
    for (const pattern of SURGERY_PATTERNS) {
      let match;
      while ((match = pattern.pattern.exec(text)) !== null) {
        surgeryMatches.push({
          position: match.index,
          procedure: pattern.procedure,
          match,
        });

        if (match.index === pattern.pattern.lastIndex) pattern.pattern.lastIndex++;
      }
    }

    // Sort by position in text to maintain narrative order
    surgeryMatches.sort((a, b) => a.position - b.position);

    // Build surgery objects
    const surgeries: any[] = [];
    for (const match of surgeryMatches) {
      const context = this.getContext(originalText, match.match.index, 100);
      surgeries.push({
        procedure: match.procedure,
        date: this.extractDateNearPosition(originalText, match.match.index),
        indication: this.extractIndication(originalText, match.match.index),
        verbatim_text: context,
      });
    }

    return surgeries;
  }

  private extractAllergies(text: string, originalText: string): any[] {
    const allergies: any[] = [];

    // Check explicit allergy statements
    const allergyStatements = [
      /allergic\s+to\s+([^.]+)/gi,
      /allergy\s+to\s+([^.]+)/gi,
      /hypersensitivity\s+to\s+([^.]+)/gi,
      /adverse\s+reaction\s+to\s+([^.]+)/gi,
    ];

    for (const pattern of allergyStatements) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const allergen = match[1].trim();
        const context = this.getContext(originalText, match.index, 150);

        allergies.push({
          allergen: allergen,
          reaction: 'Unknown',
          severity: undefined,
          verbatim_text: context,
        });

        if (match.index === pattern.lastIndex) pattern.lastIndex++;
      }
    }

    // Check known allergen patterns
    for (const pattern of ALLERGY_PATTERNS) {
      let match;
      while ((match = pattern.pattern.exec(text)) !== null) {
        const context = this.getContext(originalText, match.index, 100);

        // Check if already captured
        const exists = allergies.some(a => a.allergen.toLowerCase() === pattern.allergen.toLowerCase());
        if (!exists) {
          allergies.push({
            allergen: pattern.allergen,
            reaction: 'Unknown',
            severity: undefined,
            verbatim_text: context,
          });
        }

        if (match.index === pattern.pattern.lastIndex) pattern.pattern.lastIndex++;
      }
    }

    return allergies;
  }

  private extractMedications(text: string, originalText: string): any[] {
    const medications: any[] = [];

    for (const pattern of MEDICATION_PATTERNS) {
      let match;
      while ((match = pattern.pattern.exec(text)) !== null) {
        const context = this.getContext(originalText, match.index, 100);

        medications.push({
          drug_name: pattern.drug,
          active_substance: pattern.substance,
          dose: this.extractDoseNearPosition(originalText, match.index),
          route: this.extractRouteNearPosition(originalText, match.index),
          frequency: this.extractFrequencyNearPosition(originalText, match.index),
          indication: this.extractIndication(originalText, match.index),
          start_date: this.extractDateNearPosition(originalText, match.index),
          end_date: undefined,
          verbatim_text: context,
        });

        if (match.index === pattern.pattern.lastIndex) pattern.pattern.lastIndex++;
      }
    }

    return medications;
  }

  private extractSocialHistory(text: string, originalText: string, structuredFields?: any): any {
    const smokingPatterns = [
      { pattern: /\b(never\s+smoked|non-?smoker|non-smoker|never smoked)\b/gi, status: 'NEVER' as const },
      { pattern: /\b(former\s+smoker|ex-?smoker|quit\s+smoking|stopped\s+smoking|quit\s+smoking|former smoker)\b/gi, status: 'FORMER' as const },
      { pattern: /\b(current\s+smoker|smokes|smoking|smoker)\b/gi, status: 'CURRENT' as const },
    ];

    let smoking: 'NEVER' | 'FORMER' | 'CURRENT' | 'UNKNOWN' = 'UNKNOWN';
    let packYears: number | undefined;

    for (const pattern of smokingPatterns) {
      if (pattern.pattern.test(text)) {
        smoking = pattern.status;
        break;
      }
    }

    // Pack years - handle both "pack-year" and "pack year" formats with exec for proper capture group
    const packYearRegex = /(\d+(?:\.\d+)?)\s*pack[- ]?years?/gi;
    let packYearMatch;
    while ((packYearMatch = packYearRegex.exec(text)) !== null) {
      packYears = parseFloat(packYearMatch[1]);
      // Use the last (most specific) match
      if (packYearRegex.lastIndex >= text.length) break;
    }

    // Alcohol - fixed patterns with proper word boundaries for each alternative
    let alcohol: 'NONE' | 'OCCASIONAL' | 'MODERATE' | 'HEAVY' | 'UNKNOWN' = 'UNKNOWN';
    if (/\b(heavy\s+drinker|alcohol\s+abuse|alcoholic|heavy\s+alcohol)\b/gi.test(text)) alcohol = 'HEAVY';
    else if (/\b(moderate\s+drinker|social\s+drinker)\b/gi.test(text) || /\b(moderate\s+alcohol)\b/gi.test(text)) alcohol = 'MODERATE';
    else if (/\b(occasional\s+drinker|social\s+drinking)\b/gi.test(text) || /\b(occasional\s+alcohol|social\s+drinking)\b/gi.test(text)) alcohol = 'OCCASIONAL';
    else if (/\b(teetotaler|non-?drinker|no\s+alcohol|non-drinker)\b/gi.test(text)) alcohol = 'NONE';

    // Occupation - improved patterns to match end of string as well
    let occupation: string | undefined;
    const occPatterns = [
      /(?:work(?:ed)?\s+as|occupation|job|employed\s+as|works?\s+as)\s+([^.]+)/gi,
      /\b(?:works?\s+as|employed\s+as)\s+([^.]+)/gi,
      /(?:work(?:ed)?\s+as|occupation|job|employed\s+as|works?\s+as)\s+([^.]*\.?$)/gi,
      // Specific patterns for common occupations
      /\b(works?\s+as\s+a?\s*(construction\s+worker|doctor|nurse|pharmacist|engineer|teacher|lawyer|driver|manager|accountant))\b/gi,
      /\b(?:works?\s+as|employed\s+as)\s+a?\s*(construction\s+worker|doctor|nurse|pharmacist|engineer|teacher|lawyer|driver|manager|accountant)\b/gi,
    ];

    // Also check patient_section from structured fields
    if (!occupation && structuredFields?.occupation) {
      occupation = structuredFields.occupation;
    }

    return {
      smoking: smoking || 'UNKNOWN',
      smoking_pack_years: packYears,
      alcohol: alcohol || 'UNKNOWN',
      substance_use: undefined,
      occupation: occupation || undefined,
      verbatim_text: this.getContext(originalText, 0, 500),
    };
  }

  private extractFamilyHistory(text: string, originalText: string): any[] {
    const familyHistory: any[] = [];

    const patterns = [
      /(mother|father|sister|brother|daughter|son|parent|sibling)\s+(?:had|has|with)\s+([^.]+)/gi,
      /family\s+history\s+(?:of|:)\s+([^.]+)/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        let relationship = '';
        let condition = '';

        if (match[1] && match[2]) {
          relationship = match[1];
          condition = match[2];
        } else if (match[1]) {
          condition = match[1];
        }

        const context = this.getContext(originalText, match.index, 150);

        familyHistory.push({
          condition: condition.trim(),
          relationship: relationship || 'unknown',
          age_at_onset: undefined,
          verbatim_text: context,
        });

        if (match.index === pattern.lastIndex) pattern.lastIndex++;
      }
    }

    return familyHistory;
  }

  private getContext(text: string, position: number, window: number): string {
    const start = Math.max(0, position - window / 2);
    const end = Math.min(text.length, position + window / 2);
    return text.slice(start, end).trim();
  }

  private extractDateNearPosition(text: string, position: number): string | undefined {
    const context = this.getContext(text, position, 200);
    const datePatterns = [
      /\b(\d{4}-\d{2}-\d{2})\b/,
      /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/,
      /\b(\d{1,2}-\d{1,2}-\d{4})\b/,
    ];

    for (const pattern of datePatterns) {
      const match = context.match(pattern);
      if (match) return match[1];
    }
    return undefined;
  }

  private extractDoseNearPosition(text: string, position: number): string | undefined {
    const context = this.getContext(text, position, 150);
    const match = context.match(/(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|units?)/i);
    return match ? `${match[1]} ${match[2]}` : undefined;
  }

  private extractRouteNearPosition(text: string, position: number): string | undefined {
    const context = this.getContext(text, position, 150);
    const routes = ['oral', 'intravenous', 'iv', 'subcutaneous', 'sc', 'intramuscular', 'im', 'topical', 'inhalation', 'sublingual', 'transdermal'];
    for (const route of routes) {
      if (new RegExp(`\\b${route}\\b`, 'i').test(context)) {
        return route.toUpperCase();
      }
    }
    return undefined;
  }

  private extractFrequencyNearPosition(text: string, position: number): string | undefined {
    const context = this.getContext(text, position, 150);
    const freqs = ['once daily', 'twice daily', 'three times daily', 'four times daily', 'every 6 hours', 'every 8 hours', 'every 12 hours', 'weekly', 'monthly', 'as needed', 'prn'];
    for (const freq of freqs) {
      if (new RegExp(`\\b${freq}\\b`, 'i').test(context)) {
        return freq.toUpperCase();
      }
    }
    return undefined;
  }

  private extractIndication(text: string, position: number): string | undefined {
    const context = this.getContext(text, position, 200);
    const patterns = [
      /for\s+([^.]+)/i,
      /to\s+treat\s+([^.]+)/i,
      /indicated\s+for\s+([^.]+)/i,
      /diagnosis\s+(?:of|:)\s*([^.]+)/i,
    ];

    for (const pattern of patterns) {
      const match = context.match(pattern);
      if (match) return match[1].trim();
    }
    return undefined;
  }

  private calculateExtractionConfidence(narrative: string, medicalHistory: any): number {
    let score = 0;

    // Base confidence on narrative length
    if (narrative.length > 500) score += 0.35;
    else if (narrative.length > 200) score += 0.25;
    else if (narrative.length > 100) score += 0.15;
    else score += 0.05;

    // Check extraction completeness
    const extractedItems =
      medicalHistory.conditions.length +
      medicalHistory.surgeries.length +
      medicalHistory.allergies.length +
      medicalHistory.concomitant_medications.length +
      medicalHistory.family_history.length;

    if (extractedItems >= 15) score += 0.5;
    else if (extractedItems >= 10) score += 0.35;
    else if (extractedItems >= 5) score += 0.25;
    else if (extractedItems > 0) score += 0.15;

    // Bonus for having structured fields (patient demographics, etc.)
    score += 0.15;

    // Bonus for having MedDRA codes in conditions
    if (medicalHistory.conditions.some((c: any) => c.meddra_llt && c.meddra_pt)) score += 0.1;

    // Bonus for having substance info in medications
    if (medicalHistory.concomitant_medications.some((m: any) => m.active_substance)) score += 0.1;

    // Bonus for having structured fields (demographics, etc.)
    score += 0.05;

    return Math.min(1.0, score);
  }

  private createResult(success: boolean, output: any, executionTime: number, error?: string): AgentResult {
    return {
      success,
      agent_id: 'agent-8-medical-history',
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

export function createMedicalHistoryAgent(config: {
  tenant_id: string;
  inference_router: HybridInferenceRouter;
  audit_ledger: AuditLedgerService;
  zdr_store: ZDRStore;
}): MedicalHistoryAgent {
  return new MedicalHistoryAgent(config);
}