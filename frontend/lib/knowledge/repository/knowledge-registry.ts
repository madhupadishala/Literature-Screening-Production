import type {
  KnowledgeDocument,
  KnowledgeRepositoryStatus,
  KnowledgeStatus,
} from "./knowledge-types";

class KnowledgeRegistry {
  private documents = new Map<string, KnowledgeDocument>();

  register(document: KnowledgeDocument) {
    this.documents.set(document.id, document);
    return document;
  }

  get(id: string) {
    return this.documents.get(id) ?? null;
  }

  list() {
    return Array.from(this.documents.values()).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }

  listByTenant(tenantId?: string) {
    return this.list().filter(
      (document) => !document.tenantId || document.tenantId === tenantId,
    );
  }

  updateStatus(id: string, status: KnowledgeStatus) {
    const existing = this.get(id);

    if (!existing) {
      return null;
    }

    const updated: KnowledgeDocument = {
      ...existing,
      status,
      updatedAt: new Date().toISOString(),
    };

    this.documents.set(id, updated);
    return updated;
  }

  status(): KnowledgeRepositoryStatus {
    const documents = this.list();

    return {
      totalDocuments: documents.length,
      activeDocuments: documents.filter((item) => item.status === "active")
        .length,
      globalDocuments: documents.filter((item) => !item.tenantId).length,
      tenantDocuments: documents.filter((item) => item.tenantId).length,
    };
  }
}

export const knowledgeRegistry = new KnowledgeRegistry();