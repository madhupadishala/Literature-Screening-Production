import { knowledgeRegistry } from "./knowledge-registry";
import type {
  CreateKnowledgeDocumentInput,
  KnowledgeDocument,
} from "./knowledge-types";

function createKnowledgeId() {
  return `knowledge_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

class KnowledgeStore {
  create(input: CreateKnowledgeDocumentInput): KnowledgeDocument {
    const now = new Date().toISOString();

    return knowledgeRegistry.register({
      id: createKnowledgeId(),
      tenantId: input.tenantId,
      title: input.title,
      category: input.category,
      version: input.version,
      status: "draft",
      sourceAuthority: input.sourceAuthority,
      country: input.country,
      language: input.language ?? "en",
      effectiveDate: input.effectiveDate,
      tags: input.tags ?? [],
      summary: input.summary,
      content: input.content,
      createdAt: now,
      updatedAt: now,
    });
  }

  activate(id: string) {
    return knowledgeRegistry.updateStatus(id, "active");
  }

  supersede(id: string) {
    return knowledgeRegistry.updateStatus(id, "superseded");
  }

  get(id: string) {
    return knowledgeRegistry.get(id);
  }

  list(tenantId?: string) {
    return knowledgeRegistry.listByTenant(tenantId);
  }

  getStatus() {
    return knowledgeRegistry.status();
  }
}

export const knowledgeStore = new KnowledgeStore();