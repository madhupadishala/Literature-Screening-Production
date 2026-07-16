import { embeddingService } from "./embedding-service";
import type {
  VectorDocument,
  VectorSearchRequest,
  VectorSearchResponse,
  VectorSearchResult,
  VectorUpsertInput,
} from "./vector-types";

const vectorDocuments = new Map<string, VectorDocument>();

function normalizeContent(content: string): string {
  return content
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function createVectorDocumentId(input: VectorUpsertInput): string {
  return [
    input.tenantId,
    input.sourceType,
    input.sourceId,
    input.versionId ?? "latest",
  ].join(":");
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length) {
    return 0;
  }

  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    dotProduct += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function keywordScore(query: string, content: string): number {
  const queryTokens = normalizeContent(query)
    .split(" ")
    .filter(Boolean);

  if (queryTokens.length === 0) {
    return 0;
  }

  const matchedTokens = queryTokens.filter((token) => content.includes(token));

  return matchedTokens.length / queryTokens.length;
}

export class VectorStore {
  async upsertDocument(input: VectorUpsertInput): Promise<VectorDocument> {
    const normalizedContent = normalizeContent(input.content);

    if (!input.tenantId) {
      throw new Error("tenantId is required.");
    }

    if (!normalizedContent) {
      throw new Error("Vector document content cannot be empty.");
    }

    const embeddingResponse = await embeddingService.generateEmbedding({
      tenantId: input.tenantId,
      text: normalizedContent,
    });

    const now = new Date().toISOString();
    const id = createVectorDocumentId(input);

    const document: VectorDocument = {
      id,
      tenantId: input.tenantId,
      content: input.content,
      normalizedContent,
      embedding: embeddingResponse.embedding,
      metadata: {
        tenantId: input.tenantId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        sourceName: input.sourceName,
        versionId: input.versionId,
        createdBy: input.createdBy,
        createdAt: vectorDocuments.get(id)?.metadata.createdAt ?? now,
        updatedAt: now,
        tags: input.tags ?? [],
        status: "active",
        regulatoryContext: input.regulatoryContext,
      },
    };

    vectorDocuments.set(id, document);

    return document;
  }

  async search(request: VectorSearchRequest): Promise<VectorSearchResponse> {
    const mode = request.mode ?? "hybrid";
    const topK = request.topK ?? 10;
    const minScore = request.minScore ?? 0;

    if (!request.tenantId) {
      throw new Error("tenantId is required.");
    }

    if (!request.query.trim()) {
      throw new Error("Search query cannot be empty.");
    }

    const queryEmbeddingResponse = await embeddingService.generateEmbedding({
      tenantId: request.tenantId,
      text: request.query,
    });

    const candidates = Array.from(vectorDocuments.values()).filter((document) => {
      if (document.tenantId !== request.tenantId) {
        return false;
      }

      if (document.metadata.status !== "active") {
        return false;
      }

      if (
        request.sourceTypes?.length &&
        !request.sourceTypes.includes(document.metadata.sourceType)
      ) {
        return false;
      }

      if (
        request.tags?.length &&
        !request.tags.some((tag) => document.metadata.tags?.includes(tag))
      ) {
        return false;
      }

      return true;
    });

    const results: VectorSearchResult[] = candidates
      .map((document) => {
        const semanticScore = cosineSimilarity(
          queryEmbeddingResponse.embedding,
          document.embedding,
        );
        const lexicalScore = keywordScore(request.query, document.normalizedContent);

        let score = semanticScore;

        if (mode === "keyword") {
          score = lexicalScore;
        }

        if (mode === "hybrid") {
          score = semanticScore * 0.7 + lexicalScore * 0.3;
        }

        return {
          document,
          score: Number(score.toFixed(6)),
          matchedBy: mode,
          explanation: `Matched using ${mode} search against ${document.metadata.sourceType}.`,
        };
      })
      .filter((result) => result.score >= minScore)
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);

    return {
      tenantId: request.tenantId,
      query: request.query,
      mode,
      results,
      totalResults: results.length,
      generatedAt: new Date().toISOString(),
    };
  }

  listDocuments(tenantId: string): VectorDocument[] {
    return Array.from(vectorDocuments.values()).filter(
      (document) => document.tenantId === tenantId && document.metadata.status === "active",
    );
  }

  archiveDocument(documentId: string): boolean {
    const document = vectorDocuments.get(documentId);

    if (!document) {
      return false;
    }

    vectorDocuments.set(documentId, {
      ...document,
      metadata: {
        ...document.metadata,
        status: "archived",
        updatedAt: new Date().toISOString(),
      },
    });

    return true;
  }

  clearTenantDocuments(tenantId: string): number {
    let removedCount = 0;

    for (const [documentId, document] of vectorDocuments.entries()) {
      if (document.tenantId === tenantId) {
        vectorDocuments.delete(documentId);
        removedCount += 1;
      }
    }

    return removedCount;
  }
}

export const vectorStore = new VectorStore();