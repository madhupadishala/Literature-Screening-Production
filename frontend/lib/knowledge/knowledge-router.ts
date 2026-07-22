import { searchControlledKnowledge } from "@/lib/knowledge/retrieval/controlled-knowledge-service";
import type {
  KnowledgeSearchRequest,
  KnowledgeSearchResult,
} from "./knowledge-types";

export async function searchKnowledge(
  request: KnowledgeSearchRequest,
): Promise<KnowledgeSearchResult[]> {
  return (await searchControlledKnowledge(request)).results;
}
