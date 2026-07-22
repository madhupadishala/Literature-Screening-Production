import { buildAgentContextPack } from "@/lib/knowledge/retrieval/controlled-knowledge-service";
import type { ControlledKnowledgeSearchResult } from "@/lib/knowledge/retrieval/controlled-knowledge-types";

import type {
  RAGContextChunk,
  RAGContextPriority,
  RAGContextRequest,
  RAGEngineResponse,
  RAGMergedContext,
  RAGRetrievalResult,
} from "./rag-types";

function expandedQuery(request: RAGContextRequest): string {
  return [
    request.query,
    request.productName ? `product ${request.productName}` : "",
    request.country ? `country ${request.country}` : "",
    request.processArea ? `process area ${request.processArea}` : "",
    request.caseType ? `case type ${request.caseType}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

function priority(score: number): RAGContextPriority {
  if (score >= 0.75) return "critical";
  if (score >= 0.55) return "high";
  if (score >= 0.3) return "medium";
  return "low";
}

function contextChunk(result: ControlledKnowledgeSearchResult): RAGContextChunk {
  return {
    id: result.citation.chunkId,
    source: "knowledge_base",
    sourceId: result.citation.knowledgeObjectId,
    sourceName: result.citation.title,
    content: result.content,
    score: result.score,
    priority: priority(result.score),
    retrievalReason: `Retrieved from active controlled Knowledge Object ${result.citation.knowledgeObjectId} v${result.citation.version} using ${result.matchedBy} retrieval.`,
    citation: result.citation,
    metadata: {
      tenantId: "",
      versionId: result.citation.version,
      tags: [result.citation.domain, result.citation.section],
    },
  };
}

export class RAGEngine {
  async retrieve(request: RAGContextRequest): Promise<RAGRetrievalResult> {
    if (!request.tenantId?.trim()) throw new Error("tenantId is required.");
    if (!request.query?.trim()) throw new Error("RAG query cannot be empty.");
    const contextPack = await buildAgentContextPack({
      tenantId: request.tenantId,
      query: expandedQuery(request),
      mode: request.searchMode ?? "hybrid",
      topK: request.topK ?? 10,
      minScore: request.minScore ?? 0,
      actorId: request.actorId,
      requestId: request.requestId,
      correlationId: request.correlationId,
    });
    return { request, contextPack, generatedAt: new Date().toISOString() };
  }

  async buildContext(request: RAGContextRequest): Promise<RAGEngineResponse> {
    const retrieval = await this.retrieve(request);
    const chunks = retrieval.contextPack.results.map(contextChunk).map((chunk) => ({
      ...chunk,
      metadata: { ...chunk.metadata, tenantId: retrieval.contextPack.tenantId },
    }));
    const context: RAGMergedContext = {
      tenantId: retrieval.contextPack.tenantId,
      query: request.query,
      summary:
        chunks.length > 0
          ? `Retrieved ${chunks.length} approved controlled knowledge chunk(s) from repository ${retrieval.contextPack.repositoryVersion}.`
          : "No approved controlled knowledge was retrieved.",
      chunks,
      sourceBreakdown: { knowledge_base: chunks.length },
      warnings: chunks.length === 0 ? ["No approved controlled knowledge matched the query."] : [],
      contextPackId: retrieval.contextPack.contextPackId,
      repositoryId: retrieval.contextPack.repositoryId,
      repositoryVersion: retrieval.contextPack.repositoryVersion,
      repositoryManifestSha256: retrieval.contextPack.repositoryManifestSha256,
      citations: retrieval.contextPack.citations,
      generatedAt: retrieval.contextPack.generatedAt,
    };
    return { success: true, context };
  }
}

export const ragEngine = new RAGEngine();
