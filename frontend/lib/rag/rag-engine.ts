import { vectorStore } from "@/lib/vector/vector-store";
import { mergeRAGContext } from "./context-merger";
import type {
  RAGContextRequest,
  RAGEngineResponse,
  RAGRetrievalResult,
} from "./rag-types";

function buildExpandedQuery(request: RAGContextRequest): string {
  const parts = [
    request.query,
    request.productName ? `product ${request.productName}` : "",
    request.country ? `country ${request.country}` : "",
    request.processArea ? `process area ${request.processArea}` : "",
    request.caseType ? `case type ${request.caseType}` : "",
    request.evidencePackageId ? `evidence package ${request.evidencePackageId}` : "",
  ];

  return parts.filter(Boolean).join(" | ");
}

export class RAGEngine {
  async retrieve(request: RAGContextRequest): Promise<RAGRetrievalResult> {
    if (!request.tenantId) {
      throw new Error("tenantId is required.");
    }

    if (!request.query.trim()) {
      throw new Error("RAG query cannot be empty.");
    }

    const expandedQuery = buildExpandedQuery(request);

    const searchResponse = await vectorStore.search({
      tenantId: request.tenantId,
      query: expandedQuery,
      mode: request.searchMode ?? "hybrid",
      sourceTypes: request.sourceTypes,
      topK: request.topK ?? 10,
      minScore: request.minScore ?? 0,
    });

    return {
      request,
      vectorResults: searchResponse.results,
      generatedAt: new Date().toISOString(),
    };
  }

  async buildContext(request: RAGContextRequest): Promise<RAGEngineResponse> {
    const retrieval = await this.retrieve(request);

    const context = mergeRAGContext(request, retrieval.vectorResults, {
      maxChunks: request.topK ?? 10,
      includeLowPriority: true,
      deduplicate: true,
    });

    return {
      success: true,
      context,
    };
  }
}

export const ragEngine = new RAGEngine();