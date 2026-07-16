import { evidenceNormalizer } from "./evidence-normalizer";

import type {
  EvidenceNormalizationResult,
  EvidenceNormalizationStatus,
  RawEvidenceInput,
} from "./evidence-normalization-types";

class EvidenceNormalizationService {
  private history: EvidenceNormalizationResult[] = [];

  normalize(input: RawEvidenceInput) {
    const result = evidenceNormalizer.normalize(input);

    this.history.unshift(result);

    return result;
  }

  list(limit = 20) {
    return this.history.slice(0, limit);
  }

  getStatus(): EvidenceNormalizationStatus {
    return {
      totalPackages: this.history.length,
      warningCount: this.history.reduce(
        (sum, item) => sum + item.warnings.length,
        0,
      ),
    };
  }
}

export const evidenceNormalizationService =
  new EvidenceNormalizationService();