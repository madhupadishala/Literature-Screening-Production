export type SupportedLanguage =
  | "en"
  | "ja"
  | "ko"
  | "zh"
  | "es"
  | "pt"
  | "fr"
  | "de"
  | "ru"
  | "unknown";

export interface LanguageDetectionRequest {
  text: string;
}

export interface LanguageDetectionResult {
  language: SupportedLanguage;
  confidence: number;
}

export interface MedicalTranslationRequest {
  tenantId: string;
  sourceText: string;
  sourceLanguage?: SupportedLanguage;
  targetLanguage?: SupportedLanguage;
  preserveTerms?: string[];
}

export interface MedicalTranslationResult {
  id: string;
  sourceLanguage: SupportedLanguage;
  targetLanguage: SupportedLanguage;
  originalText: string;
  translatedText: string;
  preservedTerms: string[];
  confidence: number;
  translatedAt: string;
}

export interface TranslationStatus {
  totalTranslations: number;
  averageConfidence: number;
}