import { contextBuilder } from "./context-builder";

import type {
  RAGRequest,
  RAGResponse,
  RAGSource,
  RAGStatus,
} from "./rag-types";

class EnterpriseRAG {
  private history: RAGResponse[] = [];

  buildContext(
    request: RAGRequest,
    sources: RAGSource[],
  ) {
    const context = contextBuilder.build(
      request,
      sources,
    );

    const prompt = `
You are the ClinixAI Enterprise AI.

Answer only using the supplied enterprise context.

${context.mergedContext}

User Question:

${request.query}
`.trim();

    const response: RAGResponse = {
      context,
      prompt,
    };

    this.history.unshift(response);

    return response;
  }

  listHistory(limit = 20) {
    return this.history.slice(0, limit);
  }

  getStatus(): RAGStatus {
    const totalSources = this.history.reduce(
      (sum, item) => sum + item.context.sources.length,
      0,
    );

    return {
      contextsBuilt: this.history.length,
      averageSourcesPerContext:
        this.history.length === 0
          ? 0
          : Number(
              (
                totalSources / this.history.length
              ).toFixed(2),
            ),
    };
  }
}

export const enterpriseRAG = new EnterpriseRAG();