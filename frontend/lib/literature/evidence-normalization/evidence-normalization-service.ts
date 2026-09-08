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

  list(tenantId: string, limit = 20) {
    return this.history
      .filter((item) => item.package.tenantId === tenantId)
      .slice(0, limit);
  }

  getStatus(tenantId: string): EvidenceNormalizationStatus {
    const tenantHistory = this.history.filter(
      (item) => item.package.tenantId === tenantId,
    );
    return {
      totalPackages: tenantHistory.length,
      warningCount: tenantHistory.reduce(
        (sum, item) => sum + item.warnings.length,
        0,
      ),
    };
  }
}

export const evidenceNormalizationService =
  new EvidenceNormalizationService();