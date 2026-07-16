import type {
  RAGContextChunk,
  RAGContextPriority,
  RAGContextRequest,
  RAGMergedContext,
  RAGMergeOptions,
} from "./rag-types";
import type { VectorSearchResult } from "@/lib/vector/vector-types";

function resolvePriority(score: number, source: string): RAGContextPriority {
  if (source === "evidence_package" && score >= 0.45) {
    return "critical";
  }

  if (source === "sop" && score >= 0.4) {
    return "high";
  }

  if (score >= 0.55) {
    return "high";
  }

  if (score >= 0.3) {
    return "medium";
  }

  return "low";
}

function createRetrievalReason(result: VectorSearchResult): string {
  const sourceName = result.document.metadata.sourceName ?? result.document.metadata.sourceType;

  return `Retrieved from ${sourceName} using ${result.matchedBy} search with score ${result.score.toFixed(
    4,
  )}.`;
}

function toContextChunk(
  result: VectorSearchResult,
  request: RAGContextRequest,
): RAGContextChunk {
  const metadata = result.document.metadata;

  return {
    id: result.document.id,
    source: metadata.sourceType,
    sourceId: metadata.sourceId,
    sourceName: metadata.sourceName,
    content: result.document.content,
    score: result.score,
    priority: resolvePriority(result.score, metadata.sourceType),
    retrievalReason: createRetrievalReason(result),
    metadata: {
      tenantId: metadata.tenantId,
      versionId: metadata.versionId,
      productName: metadata.regulatoryContext?.productName ?? request.productName,
      country: metadata.regulatoryContext?.country ?? request.country,
      processArea: metadata.regulatoryContext?.processArea ?? request.processArea,
      caseType: metadata.regulatoryContext?.caseType ?? request.caseType,
      evidencePackageId:
        metadata.sourceType === "evidence_package"
          ? metadata.sourceId
          : request.evidencePackageId,
      tags: metadata.tags,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
    },
  };
}

function deduplicateChunks(chunks: RAGContextChunk[]): RAGContextChunk[] {
  const seen = new Set<string>();

  return chunks.filter((chunk) => {
    const key = `${chunk.source}:${chunk.sourceId}:${chunk.content.slice(0, 120)}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function createSourceBreakdown(chunks: RAGContextChunk[]): Record<string, number> {
  return chunks.reduce<Record<string, number>>((breakdown, chunk) => {
    breakdown[chunk.source] = (breakdown[chunk.source] ?? 0) + 1;
    return breakdown;
  }, {});
}

function createWarnings(chunks: RAGContextChunk[], request: RAGContextRequest): string[] {
  const warnings: string[] = [];

  if (chunks.length === 0) {
    warnings.push("No RAG context chunks were retrieved for this query.");
  }

  if (request.productName) {
    const hasProductContext = chunks.some(
      (chunk) =>
        chunk.metadata.productName?.toLowerCase() === request.productName?.toLowerCase(),
    );

    if (!hasProductContext) {
      warnings.push(`No product-specific context found for ${request.productName}.`);
    }
  }

  if (request.country) {
    const hasCountryContext = chunks.some(
      (chunk) => chunk.metadata.country?.toLowerCase() === request.country?.toLowerCase(),
    );

    if (!hasCountryContext) {
      warnings.push(`No country-specific context found for ${request.country}.`);
    }
  }

  return warnings;
}

function createSummary(chunks: RAGContextChunk[]): string {
  if (chunks.length === 0) {
    return "No relevant enterprise context was found.";
  }

  const criticalCount = chunks.filter((chunk) => chunk.priority === "critical").length;
  const highCount = chunks.filter((chunk) => chunk.priority === "high").length;

  return `Retrieved ${chunks.length} enterprise context chunk(s), including ${criticalCount} critical and ${highCount} high-priority chunk(s).`;
}

export function mergeRAGContext(
  request: RAGContextRequest,
  vectorResults: VectorSearchResult[],
  options: RAGMergeOptions = {},
): RAGMergedContext {
  const maxChunks = options.maxChunks ?? request.topK ?? 10;
  const includeLowPriority = options.includeLowPriority ?? true;
  const shouldDeduplicate = options.deduplicate ?? true;

  let chunks = vectorResults.map((result) => toContextChunk(result, request));

  if (!includeLowPriority) {
    chunks = chunks.filter((chunk) => chunk.priority !== "low");
  }

  if (shouldDeduplicate) {
    chunks = deduplicateChunks(chunks);
  }

  chunks = chunks
    .sort((left, right) => {
      const priorityOrder: Record<RAGContextPriority, number> = {
        critical: 4,
        high: 3,
        medium: 2,
        low: 1,
      };

      return (
        priorityOrder[right.priority] - priorityOrder[left.priority] ||
        right.score - left.score
      );
    })
    .slice(0, maxChunks);

  return {
    tenantId: request.tenantId,
    query: request.query,
    summary: createSummary(chunks),
    chunks,
    sourceBreakdown: createSourceBreakdown(chunks),
    warnings: createWarnings(chunks, request),
    generatedAt: new Date().toISOString(),
  };
}