import type {
  VectorProvider,
  VectorRecord,
  VectorSearchRequest,
  VectorSearchResult,
} from "./vector-types";

function cosineSimilarity(a: number[], b: number[]) {
  if (a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  if (magA === 0 || magB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

class MemoryVectorProvider {
  readonly provider: VectorProvider = "memory";

  private vectors: VectorRecord[] = [];

  upsert(record: VectorRecord) {
    const index = this.vectors.findIndex((item) => item.id === record.id);

    if (index >= 0) {
      this.vectors[index] = record;
    } else {
      this.vectors.push(record);
    }

    return record;
  }

  search(request: VectorSearchRequest): VectorSearchResult[] {
    return this.vectors
      .filter(
        (item) => item.metadata.tenantId === request.tenantId,
      )
      .map((item) => ({
        id: item.id,
        score: cosineSimilarity(item.vector, request.queryVector),
        metadata: item.metadata,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, request.topK ?? 10);
  }

  count() {
    return this.vectors.length;
  }
}

export const memoryVectorProvider = new MemoryVectorProvider();