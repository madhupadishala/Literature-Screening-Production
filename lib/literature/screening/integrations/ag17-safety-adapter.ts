/**
 * AG17 Safety Detection Adapter
 *
 * Wraps AG17 PvSafetyAssessment for use in ScreeningWorkflowService.
 * Provides: seriousness assessment, safety relevance determination, special situations detection.
 */

// Types defined inline to avoid import issues
interface ScreeningResult {
  output: ScreeningOutput;
  tier: string;
  modelName: string;
  modelHash: string;
}

interface ScreeningOutput {
  decision: string;
  confidence: number;
  adverse_events: Array<{ meddra_llt: string; verbatim_text: string; seriousness: string }>;
  verbatim_quotes: string[];
  seriousness_flag: boolean;
  special_situations: string[];
}

// ============================================================================
// TYPES (matching AG17's types.ts)
// ============================================================================

export interface ProductSafetyAssessmentInput {
  productId: string;
  role: 'SUSPECT' | 'CO_SUSPECT' | 'CONCOMITANT' | 'TREATMENT' | 'PRODUCT_MENTION' | 'COMBINATION_INGREDIENT';
  eventRelation: 'SUPPORTED' | 'NOT_SUPPORTED' | 'UNKNOWN';
  authorCausality: 'ATTRIBUTED' | 'POSSIBLY_RELATED' | 'RULED_OUT' | 'ATTRIBUTED_TO_OTHER_CAUSE' | 'UNKNOWN';
  alternativeCausePresent: 'PRESENT' | 'ABSENT' | 'UNKNOWN';
}

export interface PvSafetyAssessmentInput {
  products: ProductSafetyAssessmentInput[];
  seriousnessInput?: {
    death: boolean;
    lifeThreatening: boolean;
    hospitalization: boolean;
    disability: boolean;
    congenitalAnomaly: boolean;
    medicallySignificant: boolean;
  };
  humanPopulation: 'PRESENT' | 'ABSENT' | 'CONFLICTING' | 'UNKNOWN';
  identifiablePatient: 'PRESENT' | 'ABSENT' | 'CONFLICTING' | 'UNKNOWN';
  adverseEventOrReaction: 'PRESENT' | 'ABSENT' | 'CONFLICTING' | 'UNKNOWN';
  specialSituations: string[];
  aggregateSafetyEvidence?: string[];
  sourceCoverage: 'FULL_TEXT' | 'ABSTRACT_ONLY' | 'TITLE_ONLY';
  publicationType: string;
  finalDiagnosis?: string;
  symptoms?: string[];
  eventEvidence?: string[];
}

export interface PvSafetyAssessmentResult {
  seriousness?: {
    manualReviewRequired: boolean;
    criteriaMet: string[];
  };
  sourceCoverage: string;
  publicationType: string;
  safetyRelevance: 'CASE_SAFETY' | 'AGGREGATE_SAFETY' | 'BOTH' | 'NONE' | 'UNRESOLVED';
  caseSafetyPresent: boolean | null;
  aggregateSafetyPresent: boolean | null;
  fullScreeningRequired: boolean;
  exclusionCanBeFinalized: boolean;
  manualReviewRequired: boolean;
  productAssessments: Array<{
    productId: string;
    suspectForEvent: boolean | null;
    rationale: string[];
  }>;
  specialSituations: string[];
  finalDiagnosis?: string;
  symptoms: string[];
  rationale: string[];
  appliedKnowledgeObjectIds: string[];
  knowledgeGaps: string[];
}

// ============================================================================
// ADAPTER
// ============================================================================

export class AG17SafetyAdapter {
  private safetyService: any;
  private initialized = false;

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    try {
      const ag17Module = await import('../../../../Agentic_AI/AG17_Safety_Information_Detection/src/canonical/frontend/lib/pv-safety-assessment/assessment-engine.js');
      this.safetyService = ag17Module;
      this.initialized = true;
    } catch (err) {
      console.warn('[AG17Adapter] Could not load AG17, using fallback:', err);
      this.safetyService = null;
      this.initialized = true;
    }
  }

  /**
   * Assess safety relevance and seriousness for a screening decision
   */
  async assessSafety(input: PvSafetyAssessmentInput): Promise<PvSafetyAssessmentResult> {
    await this.ensureInitialized();

    if (!this.safetyService || !this.safetyService.assessPvSafety) {
      // Fallback implementation
      return this.fallbackAssess(input);
    }

    try {
      return this.safetyService.assessPvSafety(input);
    } catch (err) {
      console.warn('[AG17Adapter] Assessment failed, using fallback:', err);
      return this.fallbackAssess(input);
    }
  }

  /**
   * Quick seriousness check for screening decision
   */
  async checkSeriousness(adverseEvents: Array<{ meddra_llt: string; verbatim_text: string; seriousness: string }>): Promise<{
    seriousnessFlag: boolean;
    criteriaMet: string[];
    manualReviewRequired: boolean;
  }> {
    if (!adverseEvents || adverseEvents.length === 0) {
      return { seriousnessFlag: false, criteriaMet: [], manualReviewRequired: false };
    }

    const criteriaMet: string[] = [];
    let manualReviewRequired = false;

    for (const ae of adverseEvents) {
      if (ae.seriousness === 'serious') {
        manualReviewRequired = true;
      }
      // Check verbatim text for seriousness indicators
      const text = ae.verbatim_text.toLowerCase();
      if (text.includes('death') || text.includes('fatal')) criteriaMet.push('DEATH');
      if (text.includes('life threat') || text.includes('life-threat')) criteriaMet.push('LIFE_THREATENING');
      if (text.includes('hospitaliz') || text.includes('admit')) criteriaMet.push('HOSPITALIZATION');
      if (text.includes('disab') || text.includes('permanent')) criteriaMet.push('DISABILITY');
      if (text.includes('congenital') || text.includes('birth defect')) criteriaMet.push('CONGENITAL_ANOMALY');
      if (text.includes('medically significant') || text.includes('important medical')) criteriaMet.push('MEDICALLY_SIGNIFICANT');
    }

    return {
      seriousnessFlag: criteriaMet.length > 0,
      criteriaMet: [...new Set(criteriaMet)],
      manualReviewRequired,
    };
  }

  /**
   * Determine safety relevance for screening decision
   */
  async determineSafetyRelevance(input: PvSafetyAssessmentInput): Promise<{
    safetyRelevance: 'CASE_SAFETY' | 'AGGREGATE_SAFETY' | 'BOTH' | 'NONE' | 'UNRESOLVED';
    caseSafetyPresent: boolean | null;
    aggregateSafetyPresent: boolean | null;
    fullScreeningRequired: boolean;
    exclusionCanBeFinalized: boolean;
    manualReviewRequired: boolean;
  }> {
    await this.ensureInitialized();

    if (!this.safetyService || !this.safetyService.determineSafetyRelevance) {
      return this.fallbackDetermineRelevance(input);
    }

    try {
      return this.safetyService.determineSafetyRelevance(input);
    } catch (err) {
      return this.fallbackDetermineRelevance(input);
    }
  }

  // ============================================================================
  // FALLBACK IMPLEMENTATIONS
  // ============================================================================

  private fallbackAssess(input: PvSafetyAssessmentInput): PvSafetyAssessmentResult {
    // Determine seriousness
    let manualReviewRequired = false;
    const criteriaMet: string[] = [];

    if (input.seriousnessInput) {
      if (input.seriousnessInput.death) { criteriaMet.push('DEATH'); manualReviewRequired = true; }
      if (input.seriousnessInput.lifeThreatening) { criteriaMet.push('LIFE_THREATENING'); manualReviewRequired = true; }
      if (input.seriousnessInput.hospitalization) { criteriaMet.push('HOSPITALIZATION'); manualReviewRequired = true; }
      if (input.seriousnessInput.disability) { criteriaMet.push('DISABILITY'); manualReviewRequired = true; }
      if (input.seriousnessInput.congenitalAnomaly) { criteriaMet.push('CONGENITAL_ANOMALY'); manualReviewRequired = true; }
      if (input.seriousnessInput.medicallySignificant) { criteriaMet.push('MEDICALLY_SIGNIFICANT'); manualReviewRequired = true; }
    }

    // Determine safety relevance
    const specialSituationPresent = input.specialSituations.length > 0;
    const conflictingSafetyInputs = [input.humanPopulation, input.identifiablePatient, input.adverseEventOrReaction].some(s => s === 'CONFLICTING');

    let safetyRelevance: PvSafetyAssessmentResult['safetyRelevance'] = 'UNRESOLVED';
    let caseSafetyPresent: boolean | null = null;
    let aggregateSafetyPresent: boolean | null = null;

    if (conflictingSafetyInputs) {
      safetyRelevance = 'UNRESOLVED';
      aggregateSafetyPresent = (input.aggregateSafetyEvidence?.length ?? 0) > 0;
    } else {
      aggregateSafetyPresent = (input.aggregateSafetyEvidence?.length ?? 0) > 0;

      if (
        input.humanPopulation === 'PRESENT' &&
        input.identifiablePatient === 'PRESENT' &&
        (input.adverseEventOrReaction === 'PRESENT' || specialSituationPresent)
      ) {
        caseSafetyPresent = true;
      } else if (
        input.humanPopulation === 'ABSENT' ||
        input.identifiablePatient === 'ABSENT' ||
        (input.adverseEventOrReaction === 'ABSENT' && !specialSituationPresent)
      ) {
        caseSafetyPresent = false;
      }

      if (caseSafetyPresent && aggregateSafetyPresent) safetyRelevance = 'BOTH';
      else if (caseSafetyPresent) safetyRelevance = 'CASE_SAFETY';
      else if (aggregateSafetyPresent) safetyRelevance = 'AGGREGATE_SAFETY';
      else if (caseSafetyPresent === false) safetyRelevance = 'NONE';
      else safetyRelevance = 'UNRESOLVED';
    }

    const fullScreeningRequired = safetyRelevance === 'CASE_SAFETY' || safetyRelevance === 'AGGREGATE_SAFETY' || safetyRelevance === 'BOTH';
    const exclusionCanBeFinalized = safetyRelevance === 'NONE' && input.sourceCoverage === 'FULL_TEXT' && !manualReviewRequired;

    // Product assessments
    const productAssessments = input.products.map(p => {
      let suspectForEvent: boolean | null = null;
      const rationale: string[] = [];

      if (['SUSPECT', 'CO_SUSPECT'].includes(p.role) && p.eventRelation === 'SUPPORTED' && !['RULED_OUT', 'ATTRIBUTED_TO_OTHER_CAUSE'].includes(p.authorCausality)) {
        suspectForEvent = true;
      } else if (['CONCOMITANT', 'TREATMENT', 'PRODUCT_MENTION'].includes(p.role) || p.eventRelation === 'NOT_SUPPORTED' || ['RULED_OUT', 'ATTRIBUTED_TO_OTHER_CAUSE'].includes(p.authorCausality)) {
        suspectForEvent = false;
      }

      if (p.authorCausality === 'ATTRIBUTED' || p.authorCausality === 'POSSIBLY_RELATED') rationale.push('Source attributes event to product');
      if (p.authorCausality === 'RULED_OUT' || p.authorCausality === 'ATTRIBUTED_TO_OTHER_CAUSE') rationale.push('Source rules out product');

      return { productId: p.productId, suspectForEvent, rationale };
    });

    return {
      seriousness: criteriaMet.length > 0 ? { manualReviewRequired, criteriaMet } : undefined,
      sourceCoverage: input.sourceCoverage,
      publicationType: input.publicationType,
      safetyRelevance,
      caseSafetyPresent,
      aggregateSafetyPresent,
      fullScreeningRequired,
      exclusionCanBeFinalized,
      manualReviewRequired,
      productAssessments,
      specialSituations: input.specialSituations,
      finalDiagnosis: input.finalDiagnosis,
      symptoms: input.symptoms || [],
      rationale: [],
      appliedKnowledgeObjectIds: [],
      knowledgeGaps: [],
    };
  }

  private fallbackDetermineRelevance(input: PvSafetyAssessmentInput) {
    const specialSituationPresent = input.specialSituations.length > 0;
    const conflictingSafetyInputs = [input.humanPopulation, input.identifiablePatient, input.adverseEventOrReaction].some(s => s === 'CONFLICTING');

    let safetyRelevance: PvSafetyAssessmentResult['safetyRelevance'] = 'UNRESOLVED';
    let caseSafetyPresent: boolean | null = null;
    let aggregateSafetyPresent = (input.aggregateSafetyEvidence?.length ?? 0) > 0;

    if (conflictingSafetyInputs) {
      safetyRelevance = 'UNRESOLVED';
    } else {
      if (
        input.humanPopulation === 'PRESENT' &&
        input.identifiablePatient === 'PRESENT' &&
        (input.adverseEventOrReaction === 'PRESENT' || specialSituationPresent)
      ) {
        caseSafetyPresent = true;
      } else if (
        input.humanPopulation === 'ABSENT' ||
        input.identifiablePatient === 'ABSENT' ||
        (input.adverseEventOrReaction === 'ABSENT' && !specialSituationPresent)
      ) {
        caseSafetyPresent = false;
      }

      if (caseSafetyPresent && aggregateSafetyPresent) safetyRelevance = 'BOTH';
      else if (caseSafetyPresent) safetyRelevance = 'CASE_SAFETY';
      else if (aggregateSafetyPresent) safetyRelevance = 'AGGREGATE_SAFETY';
      else if (caseSafetyPresent === false) safetyRelevance = 'NONE';
      else safetyRelevance = 'UNRESOLVED';
    }

    const fullScreeningRequired = safetyRelevance === 'CASE_SAFETY' || safetyRelevance === 'AGGREGATE_SAFETY' || safetyRelevance === 'BOTH';
    const exclusionCanBeFinalized = safetyRelevance === 'NONE' && input.sourceCoverage === 'FULL_TEXT';
    const manualReviewRequired = input.seriousnessInput ? Object.values(input.seriousnessInput).some(v => v) : false;

    return {
      safetyRelevance,
      caseSafetyPresent,
      aggregateSafetyPresent,
      fullScreeningRequired,
      exclusionCanBeFinalized,
      manualReviewRequired,
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createAG17SafetyAdapter(): AG17SafetyAdapter {
  return new AG17SafetyAdapter();
}