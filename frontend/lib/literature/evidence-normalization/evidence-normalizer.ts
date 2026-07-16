import type {
  EvidenceNormalizationResult,
  RawEvidenceInput,
} from "./evidence-normalization-types";

function createEvidencePackageId() {
  return `evidence_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export class EvidenceNormalizer {
  normalize(input: RawEvidenceInput): EvidenceNormalizationResult {
    const warnings: string[] = [];

    const normalizedText = cleanText(input.content);

    if (!normalizedText) {
      warnings.push("Evidence content is empty after normalization.");
    }

    if (!input.title) {
      warnings.push("Evidence title is missing.");
    }

    return {
      package: {
        id: createEvidencePackageId(),
        tenantId: input.tenantId,
        sourceId: input.sourceId,
        sourceType: input.sourceType,
        title: input.title ?? "Untitled Evidence",
        language: input.originalLanguage ?? "unknown",
        normalizedText,
        metadata: input.metadata ?? {},
        normalizedAt: new Date().toISOString(),
      },
      warnings,
    };
  }
}

export const evidenceNormalizer = new EvidenceNormalizer();