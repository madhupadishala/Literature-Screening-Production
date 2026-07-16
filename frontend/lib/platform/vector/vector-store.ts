import { memoryVectorProvider } from "./vector-provider";
import type {
  VectorRecord,
  VectorSearchRequest,
  VectorStoreStatus,
} from "./vector-types";

class VectorStore {
  upsert(record: VectorRecord) {
    return memoryVectorProvider.upsert(record);
  }

  search(request: VectorSearchRequest) {
    return memoryVectorProvider.search(request);
  }

  getStatus(): VectorStoreStatus {
    return {
      provider: "memory",
      totalVectors: memoryVectorProvider.count(),
      namespaces: 1,
    };
  }
}

export const vectorStore = new VectorStore();