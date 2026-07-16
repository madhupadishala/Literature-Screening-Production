import type {
  RAGContext,
  RAGRequest,
  RAGSource,
} from "./rag-types";

function mergeSources(sources: RAGSource[]) {
  return sources
    .map(
      (source) =>
        `### ${source.title}\n${source.content}`,
    )
    .join("\n\n");
}

class ContextBuilder {
  build(
    request: RAGRequest,
    sources: RAGSource[],
  ): RAGContext {
    return {
      tenantId: request.tenantId,
      query: request.query,
      sources,
      mergedContext: mergeSources(sources),
      createdAt: new Date().toISOString(),
    };
  }
}

export const contextBuilder = new ContextBuilder();