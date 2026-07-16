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

  list(limit = 20) {
    return this.history.slice(0, limit);
  }

  getStatus(): KnowledgeExtractionStatus {
    return {
      processedDocuments: this.history.length,
      extractedObjects: this.history.reduce(
        (sum, item) => sum + item.objects.length,
        0,
      ),
    };
  }
}

export const knowledgeExtractionService =
  new KnowledgeExtractionService();