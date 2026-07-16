import { languageDetector } from "./language-detector";

import type {
  MedicalTranslationRequest,
  MedicalTranslationResult,
  TranslationStatus,
} from "./translation-types";

function createTranslationId() {
  return `translation_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

class MedicalTranslationService {
  private history: MedicalTranslationResult[] = [];

  translate(request: MedicalTranslationRequest): MedicalTranslationResult {
    const detected = request.sourceLanguage
      ? {
          language: request.sourceLanguage,
          confidence: 100,
        }
      : languageDetector.detect({
          text: request.sourceText,
        });

    const targetLanguage = request.targetLanguage ?? "en";

    const result: MedicalTranslationResult = {
      id: createTranslationId(),
      sourceLanguage: detected.language,
      targetLanguage,
      originalText: request.sourceText,
      translatedText:
        detected.language === targetLanguage
          ? request.sourceText
          : `[Mock medical translation ${detected.language} → ${targetLanguage}] ${request.sourceText}`,
      preservedTerms: request.preserveTerms ?? [],
      confidence: detected.confidence,
      translatedAt: new Date().toISOString(),
    };

    this.history.unshift(result);

    return result;
  }

  list(limit = 20) {
    return this.history.slice(0, limit);
  }

  getStatus(): TranslationStatus {
    const totalTranslations = this.history.length;

    return {
      totalTranslations,
      averageConfidence:
        totalTranslations === 0
          ? 0
          : Number(
              (
                this.history.reduce((sum, item) => sum + item.confidence, 0) /
                totalTranslations
              ).toFixed(2),
            ),
    };
  }
}

export const medicalTranslationService = new MedicalTranslationService();