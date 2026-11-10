import "server-only";

import {
  TranslationService,
  type TranslationInput,
  type TranslationResult,
  type BatchTranslationInput,
  type BatchTranslationResult,
  type LanguageDetectionResult,
  type SupportedLanguage,
} from "@/lib/contracts/translation";

// Re-export contract types for consumers
export type {
  TranslationService,
  TranslationInput,
  TranslationResult,
  BatchTranslationInput,
  BatchTranslationResult,
  LanguageDetectionResult,
  SupportedLanguage,
} from "@/lib/contracts/translation";

import { medicalTranslationService } from "@/lib/literature/translation/medical-translation-service";
import { languageDetector } from "@/lib/literature/translation/language-detector";
import type { SupportedLanguage as FrontendSupportedLanguage } from "@/lib/literature/translation/translation-types";

/**
 * Translation Adapter
 *
 * Wraps the existing Frontend TypeScript translation service (lib/literature/translation/*).
 * Frontend owns translation - it's TypeScript native and used directly in UI.
 *
 * Agentic_AI AG10 exists but is not the primary implementation for UI integration.
 */

// Map frontend SupportedLanguage to contract SupportedLanguage
const CONTRACT_SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  "en", "es", "fr", "de", "it", "pt", "nl", "pl",
  "zh", "ja", "ko", "ru", "ar", "hi", "tr", "sv"
];

// Frontend includes "unknown" but contract doesn't
const FRONTEND_SUPPORTED_LANGUAGES: FrontendSupportedLanguage[] = [
  "en", "ja", "ko", "zh", "es", "pt", "fr", "de", "ru", "unknown"
];

function toContractLanguage(lang: FrontendSupportedLanguage): SupportedLanguage {
  // The contract's SupportedLanguage doesn't include "unknown", so we default to "en"
  if (lang === "unknown") return "en";
  // Check against contract's supported languages
  if (CONTRACT_SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage)) {
    return lang as SupportedLanguage;
  }
  return "en";
}

function toFrontendLanguage(lang: SupportedLanguage): FrontendSupportedLanguage {
  if (FRONTEND_SUPPORTED_LANGUAGES.includes(lang as FrontendSupportedLanguage)) {
    return lang as FrontendSupportedLanguage;
  }
  return "en";
}

export class FrontendTranslationAdapter implements TranslationService {
  async translate(input: TranslationInput): Promise<TranslationResult> {
    const startTime = Date.now();

    try {
      // Map the input to the medical translation service request
      const request = {
        tenantId: "default", // Would come from context
        sourceText: input.text,
        sourceLanguage: input.sourceLanguage === "auto" ? undefined : toFrontendLanguage(input.sourceLanguage),
        targetLanguage: toFrontendLanguage(input.targetLanguage),
        preserveTerms: input.domain ? [input.domain] : undefined,
      };

      const result = medicalTranslationService.translate(request);

      return {
        translatedText: result.translatedText,
        sourceLanguage: toContractLanguage(result.sourceLanguage),
        targetLanguage: toContractLanguage(result.targetLanguage),
        confidence: result.confidence / 100, // Frontend uses 0-100, contract uses 0-1
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      throw new Error(`Translation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async batchTranslate(input: BatchTranslationInput): Promise<BatchTranslationResult> {
    const startTime = Date.now();
    const translations: TranslationResult[] = [];

    for (const text of input.texts) {
      const result = await this.translate({
        text,
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
        domain: input.domain,
      });
      translations.push(result);
    }

    return {
      translations,
      totalProcessingTimeMs: Date.now() - startTime,
    };
  }

  async detectLanguage(text: string): Promise<LanguageDetectionResult> {
    const detected = languageDetector.detect({ text });

    return {
      language: toContractLanguage(detected.language),
      confidence: detected.confidence / 100,
      alternatives: [],
    };
  }

  async getSupportedLanguages(): Promise<SupportedLanguage[]> {
    // Return contract-supported languages
    return CONTRACT_SUPPORTED_LANGUAGES;
  }

  isLanguagePairSupported(source: SupportedLanguage, target: SupportedLanguage): boolean {
    return CONTRACT_SUPPORTED_LANGUAGES.includes(source) &&
           CONTRACT_SUPPORTED_LANGUAGES.includes(target) &&
           source !== target;
  }
}

export function createTranslationService(): TranslationService {
  return new FrontendTranslationAdapter();
}