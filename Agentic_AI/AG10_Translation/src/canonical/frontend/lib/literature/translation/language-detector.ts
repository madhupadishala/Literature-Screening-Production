import type {
  LanguageDetectionRequest,
  LanguageDetectionResult,
  SupportedLanguage,
} from "./translation-types";

function detectByCharacterRange(text: string): SupportedLanguage {
  if (/[\u3040-\u30ff]/.test(text)) {
    return "ja";
  }

  if (/[\uac00-\ud7af]/.test(text)) {
    return "ko";
  }

  if (/[\u4e00-\u9fff]/.test(text)) {
    return "zh";
  }

  if (/[а-яА-Я]/.test(text)) {
    return "ru";
  }

  return "en";
}

class LanguageDetector {
  detect(request: LanguageDetectionRequest): LanguageDetectionResult {
    const language = detectByCharacterRange(request.text);

    return {
      language,
      confidence: language === "en" ? 85 : 92,
    };
  }
}

export const languageDetector = new LanguageDetector();