import type {
  KnowledgeExtractionRequest,
  KnowledgeExtractionResult,
  KnowledgeObject,
} from "./knowledge-extraction-types";

function createObjectId() {
  return `kobj_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export class KnowledgeExtractor {
  extract(
    request: KnowledgeExtractionRequest,
  ): KnowledgeExtractionResult {
    const objects: KnowledgeObject[] = [
      {
        id: createObjectId(),
        documentId: request.documentId,
        type: "definition",
        title: "Placeholder Definition",
        description:
          "Production Beta placeholder knowledge object.",
        sourceSection: "Section 1",
        keywords: ["definition"],
      },
      {
        id: createObjectId(),
        documentId: request.documentId,
        type: "rule",
        title: "Placeholder Rule",
        description:
          "Rule extracted from uploaded knowledge document.",
        sourceSection: "Section 2",
        keywords: ["rule"],
      },
    ];

    return {
      documentId: request.documentId,
      objects,
      extractedAt: new Date().toISOString(),
    };
  }
}

export const knowledgeExtractor = new KnowledgeExtractor();