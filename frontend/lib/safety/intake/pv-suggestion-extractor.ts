export const PV_EXTRACTOR_KEY = "NEXUS_RULE_BASED_PV_EXTRACTOR";
export const PV_EXTRACTOR_VERSION = "1.0.0";

export type PvSuggestionType =
  | "PATIENT"
  | "REPORTER"
  | "PRODUCT"
  | "EVENT"
  | "TEST";

export interface PvExtractionSuggestion {
  suggestionType: PvSuggestionType;
  entityKey: string;
  suggestedPayload: Record<string, unknown>;
  confidence: number;
  evidenceText: string;
  sourceLocator: {
    start: number;
    end: number;
  };
}

function evidence(text: string, start: number, end: number): string {
  const left = Math.max(0, start - 70);
  const right = Math.min(text.length, end + 100);
  return text.slice(left, right).replace(/\s+/g, " ").trim();
}

function sexValue(value: string): "MALE" | "FEMALE" {
  return /female|woman|girl/i.test(value) ? "FEMALE" : "MALE";
}

function addUnique(
  output: PvExtractionSuggestion[],
  suggestion: PvExtractionSuggestion,
): void {
  const signature = JSON.stringify([
    suggestion.suggestionType,
    suggestion.suggestedPayload,
  ]);
  if (
    output.some(
      (item) =>
        JSON.stringify([item.suggestionType, item.suggestedPayload]) === signature,
    )
  ) {
    return;
  }
  output.push(suggestion);
}

export function extractPvSuggestions(text: string): PvExtractionSuggestion[] {
  const output: PvExtractionSuggestion[] = [];

  const ageSex =
    /\b(\d{1,3})\s*[- ]?(?:year|yr)s?\s*[- ]?old\s+(male|female|man|woman|boy|girl)\b/gi;
  for (const match of text.matchAll(ageSex)) {
    const start = match.index ?? 0;
    addUnique(output, {
      suggestionType: "PATIENT",
      entityKey: "patient-extracted-1",
      suggestedPayload: {
        patientKey: "patient-extracted-1",
        ageValue: Number(match[1]),
        ageUnit: "year",
        sex: sexValue(match[2]),
      },
      confidence: 0.93,
      evidenceText: evidence(text, start, start + match[0].length),
      sourceLocator: { start, end: start + match[0].length },
    });
    break;
  }

  const reporterQualification =
    /\b(physician|doctor|pharmacist|nurse|consumer|patient|lawyer)\b/gi;
  for (const match of text.matchAll(reporterQualification)) {
    const start = match.index ?? 0;
    addUnique(output, {
      suggestionType: "REPORTER",
      entityKey: "reporter-extracted-1",
      suggestedPayload: {
        reporterKey: "reporter-extracted-1",
        primarySource: true,
        qualification: match[1],
      },
      confidence: 0.72,
      evidenceText: evidence(text, start, start + match[0].length),
      sourceLocator: { start, end: start + match[0].length },
    });
    break;
  }

  const productPatterns = [
    /(?:suspect\s+(?:drug|product)|suspected\s+(?:drug|product))\s*[:\-]\s*([^.;\n]{2,100})/gi,
    /(?:drug|product)\s*[:\-]\s*([^.;\n]{2,100})/gi,
  ];
  let productIndex = 0;
  for (const pattern of productPatterns) {
    for (const match of text.matchAll(pattern)) {
      const name = match[1].trim();
      if (!name) continue;
      const start = match.index ?? 0;
      productIndex += 1;
      addUnique(output, {
        suggestionType: "PRODUCT",
        entityKey: `product-extracted-${productIndex}`,
        suggestedPayload: {
          productKey: `product-extracted-${productIndex}`,
          reportedName: name,
          roleCharacterization: "SUSPECT",
        },
        confidence: pattern === productPatterns[0] ? 0.91 : 0.78,
        evidenceText: evidence(text, start, start + match[0].length),
        sourceLocator: { start, end: start + match[0].length },
      });
      if (productIndex >= 5) break;
    }
    if (productIndex >= 5) break;
  }

  const eventPatterns = [
    /(?:adverse\s+(?:event|reaction)|reaction)\s*[:\-]\s*([^.;\n]{2,120})/gi,
    /(?:event)\s*[:\-]\s*([^.;\n]{2,120})/gi,
  ];
  let eventIndex = 0;
  for (const pattern of eventPatterns) {
    for (const match of text.matchAll(pattern)) {
      const term = match[1].trim();
      if (!term) continue;
      const start = match.index ?? 0;
      eventIndex += 1;
      addUnique(output, {
        suggestionType: "EVENT",
        entityKey: `event-extracted-${eventIndex}`,
        suggestedPayload: {
          eventKey: `event-extracted-${eventIndex}`,
          reportedTerm: term,
        },
        confidence: pattern === eventPatterns[0] ? 0.9 : 0.75,
        evidenceText: evidence(text, start, start + match[0].length),
        sourceLocator: { start, end: start + match[0].length },
      });
      if (eventIndex >= 8) break;
    }
    if (eventIndex >= 8) break;
  }

  return output;
}
