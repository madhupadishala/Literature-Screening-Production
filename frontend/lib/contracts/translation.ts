/**
 * Translation Service Contract
 *
 * Defines the interface for medical document translation.
 * Implemented by: Frontend lib/literature/translation/* (TypeScript native)
 * Agentic_AI AG10 (Translation agent)
 * Note: Frontend implementation is preferred for UI integration
 */

export type SupportedLanguage =
  | "en" | "es" | "fr" | "de" | "it" | "pt" | "nl" | "pl"
  | "zh" | "ja" | "ko" | "ru" | "ar" | "hi" | "tr" | "sv";

export interface TranslationInput {
  text: string;
  sourceLanguage: SupportedLanguage | "auto";
  targetLanguage: SupportedLanguage;
  domain?: "medical" | "regulatory" | "general";
  preserveFormatting?: boolean;
}

export interface TranslationResult {
  translatedText: string;
  sourceLanguage: SupportedLanguage;
  targetLanguage: SupportedLanguage;
  confidence: number; // 0-1
  alternatives?: string[];
  processingTimeMs: number;
}

export interface BatchTranslationInput {
  texts: string[];
  sourceLanguage: SupportedLanguage | "auto";
  targetLanguage: SupportedLanguage;
  domain?: "medical" | "regulatory" | "general";
}

export interface BatchTranslationResult {
  translations: TranslationResult[];
  totalProcessingTimeMs: number;
}

export interface LanguageDetectionResult {
  language: SupportedLanguage;
  confidence: number;
  alternatives: { language: SupportedLanguage; confidence: number }[];
}

export interface TranslationService {
  /**
   * Translate text from source to target language
   */
  translate(input: TranslationInput): Promise<TranslationResult>;

  /**
   * Batch translate multiple texts
   */
  batchTranslate(input: BatchTranslationInput): Promise<BatchTranslationResult>;

  /**
   * Detect language of text
   */
  detectLanguage(text: string): Promise<LanguageDetectionResult>;

  /**
   * Get supported languages
   */
  getSupportedLanguages(): Promise<SupportedLanguage[]>;

  /**
   * Check if language pair is supported
   */
  isLanguagePairSupported(source: SupportedLanguage, target: SupportedLanguage): boolean;
}