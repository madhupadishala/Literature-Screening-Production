/**
 * screening-workflow-service.ts
 *
 * End-to-End Screening Pipeline Orchestrator
 *
 * Wires together:
 * 1. Deterministic Product Gate (Tier 1 filter)
 * 2. Hybrid Inference Router (Cloud → Local → Heuristic → DLQ)
 * 3. Local SLM Screener (Dual GBNF: Screening + ICSR)
 * 4. NLLB Translator (Non-English text)
 * 5. Redis ZDR Store (Tiered TTL, explicit flush)
 * 6. Audit Ledger Service (Merkle chain, 21 CFR Part 11)
 *
 * Compliance: FDA 21 CFR Part 11, EU GVP Module VI, GAMP 5
 * Zero-API-cost, local-first, deterministic execution
 */

import { DeterministicProductGate, ProductGateResult, CanonicalArticle } from './deterministic-product-gate';
import { HybridInferenceRouter, InferenceRequest, InferenceResponse, InferenceTier } from '../../infrastructure/hybrid-inference-router';
import { LocalSlmScreener, ScreeningInput, ScreeningResult, ICRInput, ICRResult } from './local-slm-screener';
import { NllbTranslator, TranslationResult, SupportedLanguage } from '../../infrastructure/nllb-translator';
import { ZDRStore, IngestionPayload, PostSlmPayload, generateTraceId } from '../../infrastructure/redis-zdr-store';
import { AuditLedgerService, LedgerEntryInput } from '../../audit/audit-ledger-service';
import { createHash } from 'crypto';

// AG Integrations
import { AG10TranslationAdapter, createAG10TranslationAdapter } from './integrations/ag10-translation-adapter';
import { AG17SafetyAdapter, createAG17SafetyAdapter } from './integrations/ag17-safety-adapter';
import { AG08COIAdapter, createAG08COIAdapter } from './integrations/ag08-coi-adapter';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Screening workflow configuration
 */
export interface ScreeningWorkflowConfig {
  tenantId: string;
  productGate: DeterministicProductGate;
  inferenceRouter: HybridInferenceRouter;
  slmScreener: LocalSlmScreener;
  nllbTranslator: NllbTranslator;
  redisStore: ZDRStore;
  auditLedger: AuditLedgerService;
  enableTranslation: boolean;
  maxLatencyMs: number;

  // AG Integrations (optional, with fallbacks)
  ag10Translation?: AG10TranslationAdapter;
  ag17Safety?: AG17SafetyAdapter;
  ag08COI?: AG08COIAdapter;
}

/**
 * Complete screening workflow result
 */
export interface ScreeningWorkflowResult {
  traceId: string;
  pmid: string;
  productGateResult: ProductGateResult;
  screeningResult?: ScreeningResult;
  icrResult?: ICRResult;
  translationResult?: TranslationResult;
  auditRecorded: boolean;
  flushCompleted: boolean;
  totalLatencyMs: number;
  executionPath: ExecutionStep[];
  errors: string[];
}

export interface ExecutionStep {
  step: string;
  tier?: InferenceTier;
  latencyMs: number;
  status: 'SUCCESS' | 'SKIPPED' | 'FAILED';
  details?: string;
}

/**
 * Human review status
 */
export type HumanReviewStatus = 'NOT_REQUIRED' | 'AWAITING_HUMAN_REVIEW' | 'APPROVED' | 'REJECTED' | 'MANUAL_REVIEW_REQUIRED';

/**
 * Screening decision with human review metadata
 */
export interface ScreeningDecision {
  decision: 'INCLUDE' | 'EXCLUDE' | 'REVIEW' | 'SERIOUS' | 'EXCLUDE_NON_CLINICAL' | 'IRRELEVANT_NON_PRODUCT' | 'MANUAL_REVIEW_REQUIRED';
  confidence: number;
  seriousnessFlag: boolean;
  humanReviewStatus: HumanReviewStatus;
  meddraPts: string[];
  rationale: string;
  verbatimQuotes: string[];
  adverseEvents: Array<{
    meddraLlt: string;
    verbatim: string;
    seriousness: 'serious' | 'non_serious' | 'unknown';
  }>;
}

// ============================================================================
// MAIN WORKFLOW SERVICE
// ============================================================================

export class ScreeningWorkflowService {
  private config: ScreeningWorkflowConfig;
  private ag10Translation: AG10TranslationAdapter;
  private ag17Safety: AG17SafetyAdapter;
  private ag08COI: AG08COIAdapter;

  constructor(config: ScreeningWorkflowConfig) {
    this.config = config;
    this.ag10Translation = config.ag10Translation || createAG10TranslationAdapter();
    this.ag17Safety = config.ag17Safety || createAG17SafetyAdapter();
    this.ag08COI = config.ag08COI || createAG08COIAdapter();
  }

  /**
   * Map article language to NLLB SupportedLanguage
   */
  private mapToSupportedLanguage(lang?: string): SupportedLanguage {
    if (!lang) return 'en';
    const langMap: Record<string, SupportedLanguage> = {
      'en': 'en', 'es': 'es', 'fr': 'fr', 'de': 'de', 'it': 'it',
      'pt': 'pt', 'ja': 'ja', 'zh': 'zh', 'ko': 'ko', 'ru': 'ru',
      'ar': 'ar', 'hi': 'hi', 'nl': 'nl', 'pl': 'pl', 'tr': 'tr',
      'sv': 'sv', 'da': 'da', 'no': 'no', 'fi': 'fi', 'cs': 'cs',
      'hu': 'hu', 'ro': 'ro', 'el': 'el', 'he': 'he', 'th': 'th',
      'vi': 'vi', 'id': 'id', 'ms': 'ms', 'tl': 'tl',
      'english': 'en', 'spanish': 'es', 'french': 'fr', 'german': 'de',
      'italian': 'it', 'portuguese': 'pt', 'japanese': 'ja',
      'chinese': 'zh', 'korean': 'ko', 'russian': 'ru', 'arabic': 'ar',
    };
    return langMap[lang.toLowerCase()] || 'en';
  }

  /**
   * Execute complete screening workflow for a single article
   */
  async execute(article: CanonicalArticle): Promise<ScreeningWorkflowResult> {
    const traceId = generateTraceId();
    const startTime = Date.now();
    const executionPath: ExecutionStep[] = [];
    const errors: string[] = [];

    try {
      // ========================================================================
      // STEP 1: DETERMINISTIC PRODUCT GATE (Tier 1 Filter)
      // ========================================================================
      const gateStartTime = Date.now();
      const productGateResult = this.config.productGate.process(article);
      const gateLatency = Date.now() - gateStartTime;

      executionPath.push({
        step: 'DETERMINISTIC_PRODUCT_GATE',
        latencyMs: gateLatency,
        status: 'SUCCESS',
        details: `Decision: ${productGateResult.decision}, Confidence: ${productGateResult.confidence}, Products: ${productGateResult.matched_products.length}, Substances: ${productGateResult.matched_substances.length}`
      });

      // Early exit: No product match → EXCLUDE, no SLM call
      if (productGateResult.decision === 'IRRELEVANT_NON_PRODUCT') {
        await this.recordAndFlush(
          traceId,
          article,
          productGateResult,
          'HEURISTIC',
          executionPath,
          errors,
          startTime,
          'NO_COMPANY_PRODUCT'
        );
        return this.buildResult(traceId, article.pmid, productGateResult, undefined, undefined, undefined,
          true, true, Date.now() - startTime, executionPath, errors);
      }

      // Early exit: Non-clinical exclusion → EXCLUDE, no SLM call
      if (productGateResult.decision === 'EXCLUDE_NON_CLINICAL') {
        await this.recordAndFlush(
          traceId,
          article,
          productGateResult,
          'HEURISTIC',
          executionPath,
          errors,
          startTime,
          productGateResult.exclusion_reason || 'NON_CLINICAL'
        );
        return this.buildResult(traceId, article.pmid, productGateResult, undefined, undefined, undefined,
          true, true, Date.now() - startTime, executionPath, errors);
      }

      // ========================================================================
      // STEP 2: STAGE WORKING PAYLOAD IN REDIS ZDR STORE (24h TTL)
      // ========================================================================
      const ingestionPayload: IngestionPayload = {
        trace_id: traceId,
        tenant_id: this.config.tenantId,
        pmid: article.pmid,
        source: 'PUBMED',
        title: article.title,
        abstract: article.abstract,
        full_text: article.full_text,
        mesh_terms: article.mesh_terms,
        chemicals: article.chemicals,
        publication_types: article.publication_types,
        language: article.language || 'en',
        classification: 'CLINICAL',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        pii_redacted: false,
        pii_types_found: [],
      };

      await this.config.redisStore.storeIngestion(traceId, ingestionPayload);
      executionPath.push({
        step: 'REDIS_INGESTION_STORE',
        latencyMs: 0,
        status: 'SUCCESS',
        details: `Stored ingestion payload for trace ${traceId}`
      });

      // ========================================================================
      // STEP 3: TRANSLATION (if non-English) - Using AG10
      // ========================================================================
      let translationResult: TranslationResult | undefined;
      let textForScreening = article.abstract;
      let fullTextForScreening = article.full_text;

      if (this.config.enableTranslation && article.language && article.language !== 'en') {
        const transStartTime = Date.now();
        try {
          // Use AG10 Translation Adapter
          const supportedLang = this.mapToSupportedLanguage(article.language);
          const ag10Result = await this.ag10Translation.translate(article.abstract, 'en', supportedLang);
          translationResult = {
            originalText: article.abstract,
            translatedText: ag10Result.translatedText,
            sourceLanguage: supportedLang,
            targetLanguage: 'en',
            translationStatus: 'SUCCESS',
            confidence: ag10Result.confidence,
            latencyMs: Date.now() - transStartTime,
            modelHash: 'ag10-medical-translation-v1',
            tokensUsed: 0,
            preservedTerms: ag10Result.preservedTerms,
          };
          textForScreening = ag10Result.translatedText;

          if (article.full_text) {
            const fullTextResult = await this.ag10Translation.translate(article.full_text, 'en', supportedLang);
            fullTextForScreening = fullTextResult.translatedText;
          }

          executionPath.push({
            step: 'AG10_TRANSLATION',
            latencyMs: Date.now() - transStartTime,
            status: 'SUCCESS',
            details: `AG10: ${article.language} → English, Confidence: ${(ag10Result.confidence * 100).toFixed(0)}%`
          });
        } catch (err) {
          errors.push(`AG10 Translation failed: ${err instanceof Error ? err.message : String(err)}`);
          executionPath.push({
            step: 'AG10_TRANSLATION',
            latencyMs: Date.now() - transStartTime,
            status: 'FAILED',
            details: String(err)
          });
          // Fallback to NLLB
          try {
            translationResult = await this.config.nllbTranslator.translate(article.abstract, 'en', article.language as any);
            textForScreening = translationResult.translatedText;
            if (article.full_text) {
              const fullTextTrans = await this.config.nllbTranslator.translate(article.full_text, 'en', article.language as any);
              fullTextForScreening = fullTextTrans.translatedText;
            }
            executionPath.push({
              step: 'NLLB_TRANSLATION_FALLBACK',
              latencyMs: Date.now() - transStartTime,
              status: 'SUCCESS',
              details: `Fallback to NLLB successful`
            });
          } catch (fallbackErr) {
            errors.push(`Fallback translation also failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`);
          }
        }
      } else {
        executionPath.push({
          step: 'TRANSLATION',
          latencyMs: 0,
          status: 'SKIPPED',
          details: article.language === 'en' ? 'English text, translation not needed' : 'Translation disabled'
        });
      }

      // ========================================================================
      // STEP 4: SLM SCREENING EXTRACTION (via Hybrid Router)
      // ========================================================================
      const screeningInput: ScreeningInput = {
        pmid: article.pmid,
        title: article.title,
        abstract: textForScreening,
        matchedProducts: productGateResult.matched_products.map(p => ({
          product_id: p.product_id,
          brand_name: p.brand_name,
          active_substances: productGateResult.matched_substances
            .filter(s => s.inn === p.brand_name || s.alias_matched === p.brand_name)
            .map(s => s.inn)
            .concat(productGateResult.matched_products
              .flatMap(mp => productGateResult.matched_substances
                .filter(ms => ms.inn === mp.brand_name)
                .map(ms => ms.inn)))
            .filter((v, i, a) => a.indexOf(v) === i)
        })),
        fullText: fullTextForScreening,
        journal: article.journal,
        publicationDate: article.publication_date,
      };

      const slmStartTime = Date.now();
      let screeningResult: ScreeningResult;

      try {
        screeningResult = await this.config.slmScreener.screen(screeningInput);
        executionPath.push({
          step: 'SLM_SCREENING',
          tier: screeningResult.tier,
          latencyMs: Date.now() - slmStartTime,
          status: 'SUCCESS',
          details: `Decision: ${screeningResult.output.decision}, Confidence: ${screeningResult.output.confidence}, Tier: ${screeningResult.tier}`
        });
      } catch (err) {
        errors.push(`SLM screening failed: ${err instanceof Error ? err.message : String(err)}`);
        executionPath.push({
          step: 'SLM_SCREENING',
          latencyMs: Date.now() - slmStartTime,
          status: 'FAILED',
          details: String(err)
        });
        throw err;
      }

      // ========================================================================
      // STEP 5: AG17 SAFETY ASSESSMENT (Seriousness + Safety Relevance)
      // ========================================================================
      const ag17StartTime = Date.now();
      let ag17Result: any;

      try {
        // Build AG17 input from screening result
        const ag17Input = {
          products: productGateResult.matched_products.map(p => ({
            productId: p.product_id,
            role: 'SUSPECT' as const,
            eventRelation: 'SUPPORTED' as const,
            authorCausality: 'UNKNOWN' as const,
            alternativeCausePresent: 'UNKNOWN' as const,
          })),
          seriousnessInput: screeningResult.output.seriousness_flag ? {
            death: false,
            lifeThreatening: screeningResult.output.special_situations?.some(s => s.toLowerCase().includes('life')) || false,
            hospitalization: screeningResult.output.special_situations?.some(s => s.toLowerCase().includes('hospital')) || false,
            disability: false,
            congenitalAnomaly: false,
            medicallySignificant: screeningResult.output.special_situations?.some(s => s.toLowerCase().includes('medical')) || false,
          } : undefined,
          humanPopulation: 'PRESENT' as const,
          identifiablePatient: 'PRESENT' as const,
          adverseEventOrReaction: screeningResult.output.adverse_events && screeningResult.output.adverse_events.length > 0 ? 'PRESENT' as const : 'ABSENT' as const,
          specialSituations: screeningResult.output.special_situations || [],
          aggregateSafetyEvidence: [],
          sourceCoverage: (article.full_text ? 'FULL_TEXT' : 'ABSTRACT_ONLY') as 'FULL_TEXT' | 'ABSTRACT_ONLY' | 'TITLE_ONLY',
          publicationType: article.publication_types?.[0] || 'Journal Article',
          finalDiagnosis: undefined,
          symptoms: screeningResult.output.adverse_events?.map(ae => ae.verbatim_text) || [],
          eventEvidence: screeningResult.output.verbatim_quotes || [],
        };

        ag17Result = await this.ag17Safety.assessSafety(ag17Input);

        executionPath.push({
          step: 'AG17_SAFETY_ASSESSMENT',
          latencyMs: Date.now() - ag17StartTime,
          status: 'SUCCESS',
          details: `Safety: ${ag17Result.safetyRelevance}, Seriousness: ${ag17Result.seriousness?.criteriaMet.join(', ') || 'none'}, Review: ${ag17Result.manualReviewRequired ? 'required' : 'not required'}`
        });
      } catch (err) {
        errors.push(`AG17 Safety assessment failed: ${err instanceof Error ? err.message : String(err)}`);
        executionPath.push({
          step: 'AG17_SAFETY_ASSESSMENT',
          latencyMs: Date.now() - ag17StartTime,
          status: 'FAILED',
          details: String(err)
        });
        // Continue with fallback
        ag17Result = {
          safetyRelevance: 'CASE_SAFETY',
          fullScreeningRequired: true,
          manualReviewRequired: screeningResult.output.seriousness_flag || false,
          seriousness: screeningResult.output.seriousness_flag ? { manualReviewRequired: true, criteriaMet: ['SCREENING_FLAG'] } : undefined,
        };
      }

      // ========================================================================
      // STEP 6: AG08 COUNTRY OF INCIDENT (Regulatory Routing)
      // ========================================================================
      const ag08StartTime = Date.now();
      let ag08Result: any;

      try {
        ag08Result = await this.ag08COI.determineCountries(
          article.title,
          article.abstract,
          article.full_text,
          article.pmid
        );

        executionPath.push({
          step: 'AG08_COUNTRY_OF_INCIDENT',
          latencyMs: Date.now() - ag08StartTime,
          status: 'SUCCESS',
          details: `Primary event country: ${ag08Result.eventCountries[0]?.countryCode || 'unknown'}, Status: ${ag08Result.eventCountries[0]?.status || 'unknown'}`
        });
      } catch (err) {
        errors.push(`AG08 COI determination failed: ${err instanceof Error ? err.message : String(err)}`);
        executionPath.push({
          step: 'AG08_COUNTRY_OF_INCIDENT',
          latencyMs: Date.now() - ag08StartTime,
          status: 'FAILED',
          details: String(err)
        });
        // Continue with fallback
        ag08Result = {
          eventCountries: [{
            eventId: 'event-1',
            countryCode: null,
            status: 'unknown',
            reviewRequired: false,
            evidence: [],
          }],
        };
      }

      // ========================================================================
      // STEP 7: STAGE POST-SLM PAYLOAD IN REDIS (7d TTL)
      // ========================================================================
      const postSlmPayload: PostSlmPayload = {
        trace_id: traceId,
        tenant_id: this.config.tenantId,
        pmid: article.pmid,
        execution_tier: screeningResult.tier,
        model_name: screeningResult.modelName,
        model_hash: screeningResult.modelHash,
        decision: screeningResult.output.decision,
        confidence: screeningResult.output.confidence,
        adverse_events: (screeningResult.output.adverse_events || []).map((ae: any) => ({
          meddra_llt: ae.meddra_llt,
          verbatim_text: ae.verbatim_text,
          seriousness: ae.seriousness,
        })),
        verbatim_quotes: screeningResult.output.verbatim_quotes || [],
        seriousness_flag: screeningResult.output.seriousness_flag ?? false,
        special_situations: screeningResult.output.special_situations || [],
        exclusion_criteria: screeningResult.output.exclusion_criteria || [],
        classification: 'REDACTED',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };

      await this.config.redisStore.storePostSlm(traceId, postSlmPayload);
      executionPath.push({
        step: 'REDIS_POST_SLM_STORE',
        latencyMs: 0,
        status: 'SUCCESS',
        details: `Stored post-SLM payload for trace ${traceId}`
      });

      // ========================================================================
      // STEP 6: DETERMINE HUMAN REVIEW STATUS (with AG17)
      // ========================================================================
      const humanReviewStatus = this.determineHumanReviewStatus(screeningResult.output, ag17Result?.manualReviewRequired);

      // ========================================================================
      // STEP 7: GxP AUDIT COMMIT (Merkle chain)
      // ========================================================================
      const auditStartTime = Date.now();
      await this.recordAuditEntry(
        traceId,
        article,
        productGateResult,
        screeningResult,
        screeningResult.tier,
        humanReviewStatus,
        executionPath
      );
      executionPath.push({
        step: 'AUDIT_LEDGER_COMMIT',
        latencyMs: Date.now() - auditStartTime,
        status: 'SUCCESS',
        details: `Recorded to audit ledger with Merkle chain`
      });

      // ========================================================================
      // STEP 8: EXPLICIT ZDR FLUSH (cleanup transient working memory)
      // ========================================================================
      const flushStartTime = Date.now();
      await this.config.redisStore.flushIngestion(traceId);
      await this.config.redisStore.flushPostSlm(traceId);
      executionPath.push({
        step: 'ZDR_FLUSH',
        latencyMs: Date.now() - flushStartTime,
        status: 'SUCCESS',
        details: `Flushed transient Redis keys for trace ${traceId}`
      });

      // ========================================================================
      // BUILD FINAL RESULT
      // ========================================================================
      return this.buildResult(
        traceId,
        article.pmid,
        productGateResult,
        screeningResult,
        undefined,
        translationResult,
        true,
        true,
        Date.now() - startTime,
        executionPath,
        errors
      );

    } catch (err) {
      errors.push(`Workflow failed: ${err instanceof Error ? err.message : String(err)}`);
      executionPath.push({
        step: 'WORKFLOW_ERROR',
        latencyMs: Date.now() - startTime,
        status: 'FAILED',
        details: String(err)
      });

      // Attempt audit recording even on failure
      try {
        await this.recordAuditEntry(
          traceId,
          article,
          { decision: 'MANUAL_REVIEW_REQUIRED', confidence: 0, matched_products: [], matched_substances: [], exclusion_reason: undefined, rule_trace: [], processing_ms: 0 } as any,
          undefined,
          'DLQ',
          'MANUAL_REVIEW_REQUIRED',
          executionPath
        );
      } catch (auditErr) {
        errors.push(`Audit recording also failed: ${auditErr instanceof Error ? auditErr.message : String(auditErr)}`);
      }

      return this.buildResult(
        traceId,
        article.pmid,
        { decision: 'MANUAL_REVIEW_REQUIRED', confidence: 0, matched_products: [], matched_substances: [], exclusion_reason: undefined, rule_trace: [], processing_ms: 0 } as any,
        undefined,
        undefined,
        undefined,
        false,
        false,
        Date.now() - startTime,
        executionPath,
        errors
      );
    }
  }

  /**
   * Determine if human review is required
   * Now considers AG17 safety assessment
   */
  private determineHumanReviewStatus(output: ScreeningResult['output'], ag17ManualReviewRequired?: boolean): HumanReviewStatus {
    // Always require human review for INCLUDE, SERIOUS, or REVIEW decisions
    if (output.decision === 'INCLUDE' || output.decision === 'SERIOUS' || output.decision === 'REVIEW') {
      return 'AWAITING_HUMAN_REVIEW';
    }
    // AG17 safety assessment requires review
    if (ag17ManualReviewRequired) {
      return 'AWAITING_HUMAN_REVIEW';
    }
    // EXCLUDE decisions don't require human review (auto-archive)
    return 'NOT_REQUIRED';
  }

  /**
   * Record audit ledger entry
   */
  private async recordAuditEntry(
    traceId: string,
    article: CanonicalArticle,
    productGateResult: ProductGateResult,
    screeningResult: ScreeningResult | undefined,
    executionTier: InferenceTier,
    humanReviewStatus: HumanReviewStatus,
    executionPath: ExecutionStep[]
  ): Promise<void> {
    // Build prompt text (what was sent to the model)
    const promptText = this.buildPromptText(article, productGateResult);

    // Build raw output (model response)
    const rawOutput = screeningResult
      ? JSON.stringify(screeningResult.output)
      : JSON.stringify({
          decision: productGateResult.decision,
          reason: productGateResult.exclusion_reason || 'NO_COMPANY_PRODUCT',
          confidence: productGateResult.confidence,
        });

    // Compute hashes (ZDR: no raw PHI in ledger)
    const promptHash = createHash('sha256').update(promptText).digest('hex');
    const outputHash = createHash('sha256').update(rawOutput).digest('hex');

    // Determine decision and confidence
    const decision = screeningResult ? screeningResult.output.decision : productGateResult.decision;
    const confidence = screeningResult ? screeningResult.output.confidence : productGateResult.confidence;

    // MedDRA PTs from screening result
    const meddraPts = screeningResult && screeningResult.output.adverse_events
      ? screeningResult.output.adverse_events.map((ae: any) => ae.meddra_llt).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)
      : [];

    // Seriousness flag
    const seriousnessFlag = screeningResult ? (screeningResult.output.seriousness_flag ?? false) : false;

    const entry: LedgerEntryInput = {
      tenantId: this.config.tenantId,
      traceId,
      spanId: createHash('sha256').update(traceId + executionTier).digest('hex').slice(0, 32),
      correlationId: traceId,
      agentName: executionTier === 'HEURISTIC' ? 'deterministic-product-gate' : 'local-slm-screener',
      executionTier,
      modelName: screeningResult?.modelName || 'deterministic-product-gate',
      modelHash: screeningResult?.modelHash || 'deterministic-v1',
      temperature: 0.0,
      seed: 42,
      grammarVersion: executionTier !== 'HEURISTIC' ? 'screening-grammar-v1.2.0' : undefined,
      promptText,
      rawOutput,
      redactionSummary: { piiTypes: [], charsRedacted: 0 },
      decision,
      confidence,
      meddraPts,
      seriousnessFlag,
    };

    await this.config.auditLedger.recordExecution(entry);
  }

  /**
   * Build prompt text for audit trail
   */
  private buildPromptText(article: CanonicalArticle, productGateResult: ProductGateResult): string {
    const productInfo = productGateResult.matched_products
      .map(p => `- ${p.brand_name} (${productGateResult.matched_substances
        .filter(s => s.inn === p.brand_name || s.alias_matched === p.brand_name)
        .map(s => s.inn).join(', ')})`)
      .join('\n');

    return `PMID: ${article.pmid}

MATCHED PRODUCTS:
${productInfo}

TITLE: ${article.title}

ABSTRACT: ${article.abstract}`;
  }

  /**
   * Early exit recording and flush
   */
  private async recordAndFlush(
    traceId: string,
    article: CanonicalArticle,
    productGateResult: ProductGateResult,
    executionTier: InferenceTier,
    executionPath: ExecutionStep[],
    errors: string[],
    startTime: number,
    reason: string
  ): Promise<void> {
    // Record audit entry
    await this.recordAuditEntry(
      traceId,
      article,
      productGateResult,
      undefined,
      executionTier,
      'NOT_REQUIRED',
      executionPath
    );

    // Flush any staged data (none for early exit, but for completeness)
    executionPath.push({
      step: 'AUDIT_LEDGER_COMMIT',
      latencyMs: 0,
      status: 'SUCCESS',
      details: `Early exit: ${reason}`
    });

    executionPath.push({
      step: 'ZDR_FLUSH',
      latencyMs: 0,
      status: 'SUCCESS',
      details: `No transient data to flush (early exit at product gate)`
    });
  }

  /**
   * Build final workflow result
   */
  private buildResult(
    traceId: string,
    pmid: string,
    productGateResult: ProductGateResult,
    screeningResult: ScreeningResult | undefined,
    icrResult: ICRResult | undefined,
    translationResult: TranslationResult | undefined,
    auditRecorded: boolean,
    flushCompleted: boolean,
    totalLatencyMs: number,
    executionPath: ExecutionStep[],
    errors: string[]
  ): ScreeningWorkflowResult {
    return {
      traceId,
      pmid,
      productGateResult,
      screeningResult,
      icrResult,
      translationResult,
      auditRecorded,
      flushCompleted,
      totalLatencyMs,
      executionPath,
      errors,
    };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createScreeningWorkflowService(config: ScreeningWorkflowConfig): ScreeningWorkflowService {
  return new ScreeningWorkflowService(config);
}

// ============================================================================
// CLI / TESTING
// ============================================================================

if (require.main === module) {
  (async () => {
    console.log('ScreeningWorkflowService module loaded. Use as library.');
    console.log('Example usage:');
    console.log(`
const workflow = createScreeningWorkflowService({
  tenantId: 'tenant-001',
  productGate: await createProductGate('./product-master.json'),
  inferenceRouter: createStandardRouter(...),
  slmScreener: createLocalSlmScreener(router),
  nllbTranslator: createNllbTranslatorFromEnv(),
  redisStore: createZDRStore('tenant-001'),
  auditLedger: createAuditLedgerServiceFromEnv('tenant-001'),
  enableTranslation: true,
  maxLatencyMs: 30000,
});

const result = await workflow.execute({
  pmid: '12345678',
  title: 'Hepatotoxicity case report',
  abstract: 'Patient developed severe liver injury...',
  // ...
});
    `);
  })().catch(console.error);
}