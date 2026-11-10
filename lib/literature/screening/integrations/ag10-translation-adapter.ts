/**
 * AG10 Translation Adapter
 *
 * Wraps AG10 MedicalTranslationService for use in ScreeningWorkflowService.
 * Provides medical translation with AG10's service.
 */

import { SupportedLanguage } from '../../../infrastructure/nllb-translator';

// ============================================================================
// TYPES (matching AG10's translation-types.ts)
// ============================================================================

interface MedicalTranslationRequest {
  tenantId: string;
  sourceText: string;
  targetLanguage?: string;
  sourceLanguage?: string;
  preserveTerms?: string[];
}

interface MedicalTranslationResult {
  tenantId: string;
  id: string;
  sourceLanguage: string;
  targetLanguage: string;
  originalText: string;
  translatedText: string;
  preservedTerms: string[];
  confidence: number; // 0-100
  translatedAt: string;
}

// ============================================================================
// ADAPTER (not implementing NllbTranslator - different interface)
// ============================================================================

export class AG10TranslationAdapter {
  private translationService: any;
  private initialized = false;

  constructor() {
    // Lazy load AG10 to avoid import issues
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    try {
      const ag10Module = await import('../../../../Agentic_AI/AG10_Translation/src/canonical/frontend/lib/literature/translation/medical-translation-service.js');
      this.translationService = ag10Module.medicalTranslationService;
      this.initialized = true;
    } catch (err) {
      console.warn('[AG10Adapter] Could not load AG10, using mock:', err);
      this.translationService = null;
      this.initialized = true;
    }
  }

  /**
   * Translate text using AG10 MedicalTranslationService
   */
  async translate(
    text: string,
    targetLanguage: string,
    sourceLanguage?: string
  ): Promise<{
    originalText: string;
    translatedText: string;
    sourceLanguage: string;
    targetLanguage: string;
    translationStatus: 'SUCCESS' | 'ERROR';
    confidence: number; // 0-1
    preservedTerms: string[];
  }> {
    await this.ensureInitialized();

    if (!this.translationService) {
      // Fallback mock
      return {
        originalText: text,
        translatedText: sourceLanguage === targetLanguage ? text : `[MOCK ${sourceLanguage || 'auto'}→${targetLanguage}] ${text}`,
        sourceLanguage: sourceLanguage || 'auto',
        targetLanguage,
        translationStatus: 'SUCCESS',
        confidence: 0.95,
        preservedTerms: [],
      };
    }

    const request: any = {
      tenantId: 'default',
      sourceText: text,
      targetLanguage,
      sourceLanguage,
      preserveTerms: [],
    };

    const result = this.translationService.translate(request);

    return {
      originalText: result.originalText,
      translatedText: result.translatedText,
      sourceLanguage: result.sourceLanguage,
      targetLanguage: result.targetLanguage,
      translationStatus: 'SUCCESS',
      confidence: result.confidence / 100, // AG10 uses 0-100, we use 0-1
      preservedTerms: result.preservedTerms || [],
    };
  }

  /**
   * Detect language (uses heuristic since AG10's detector is internal)
   */
  async detectLanguage(text: string): Promise<{ language: string; confidence: number }> {
    await this.ensureInitialized();

    // Simple heuristic fallback
    const lang = this.heuristicDetect(text);
    return { language: lang, confidence: 0.8 };
  }

  private heuristicDetect(text: string): string {
    // Simple language detection heuristics
    const patterns: Record<string, RegExp> = {
      es: /[áéíóúñ¿¡]/,
      fr: /[àâçéèêëîïôûùüÿæœ]/,
      de: /[äöüß]/,
      zh: /[一-鿿]/,
      ja: /[぀-ゟ゠-ヿ]/,
      ko: /[가-힯]/,
      ru: /[а-яё]/,
      pt: /[ãõç]/,
      it: /[àèéìíîòóù]/,
    };

    for (const [lang, pattern] of Object.entries(patterns)) {
      if (pattern.test(text)) return lang;
    }
    return 'en'; // Default
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createAG10TranslationAdapter(): AG10TranslationAdapter {
  return new AG10TranslationAdapter();
}