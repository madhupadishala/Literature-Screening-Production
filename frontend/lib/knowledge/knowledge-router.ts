import {
  KnowledgeDocument,
  KnowledgeSearchRequest,
  KnowledgeSearchResult,
} from "./knowledge-types";

const documents: KnowledgeDocument[] = [];

export function registerKnowledgeDocument(
  document: KnowledgeDocument
): void {
  documents.push(document);
}

export function getKnowledgeDocuments(
  tenantId: string
): KnowledgeDocument[] {
  return documents.filter((d) => d.tenantId === tenantId);
}

export function searchKnowledge(
  request: KnowledgeSearchRequest
): KnowledgeSearchResult[] {
  const query = request.query.toLowerCase();

  const results: KnowledgeSearchResult[] = [];

  for (const document of getKnowledgeDocuments(request.tenantId)) {
    for (const chunk of document.chunks) {
      if (chunk.text.toLowerCase().includes(query)) {
        results.push({
          document,
          chunk,
          score: 1,
        });
      }
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, request.topK ?? 10);
}