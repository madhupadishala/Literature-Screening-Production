import { knowledgeExtractor } from "./knowledge-extractor";

import type {
  KnowledgeExtractionRequest,
  KnowledgeExtractionResult,
  KnowledgeExtractionStatus,
} from "./knowledge-extraction-types";

class KnowledgeExtractionService {
  private history: KnowledgeExtractionResult[] = [];

  extract(request: KnowledgeExtractionRequest) {
    const result = knowledgeExtractor.extract(request);

    this.history.unshift(result);

    return result;
  }

  list(tenantId: string, limit = 20) {
    return this.history
      .filter((item) => item.tenantId === tenantId)
      .slice(0, limit);
  }

  getStatus(tenantId: string): KnowledgeExtractionStatus {
    const tenantHistory = this.history.filter(
      (item) => item.tenantId === tenantId,
    );
    return {
      processedDocuments: tenantHistory.length,
      extractedObjects: tenantHistory.reduce(
        (sum, item) => sum + item.objects.length,
        0,
      ),
    };
  }
}

export const knowledgeExtractionService =
  new KnowledgeExtractionService();