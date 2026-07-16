import { storageService } from "./storage-service";
import type {
  DocumentRegistryRecord,
  UploadDocumentInput,
} from "./storage-types";

const documentRegistry = new Map<string, DocumentRegistryRecord>();

function createDocumentId(): string {
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildStorageKey(input: UploadDocumentInput, documentId: string): string {
  return [
    input.tenantId,
    input.category,
    input.documentType,
    input.module ?? "general",
    documentId,
    input.fileName,
  ].join("/");
}

export class DocumentManager {
  async upload(input: UploadDocumentInput): Promise<DocumentRegistryRecord> {
    if (!input.tenantId) {
      throw new Error("tenantId is required.");
    }

    if (!input.fileName.trim()) {
      throw new Error("fileName is required.");
    }

    const documentId = createDocumentId();
    const storageKey = buildStorageKey(input, documentId);

    const storageObject = await storageService.putObject({
      key: storageKey,
      content: input.content,
      contentType: input.contentType,
      metadata: input.metadata,
    });

    const now = new Date().toISOString();

    const record: DocumentRegistryRecord = {
      id: documentId,
      tenantId: input.tenantId,
      category: input.category,
      documentType: input.documentType,
      fileName: input.fileName,
      contentType: input.contentType,
      storageKey: storageObject.key,
      storageBucket: storageObject.bucket,
      storageProvider: storageObject.provider,
      sizeBytes: storageObject.sizeBytes,
      checksum: storageObject.checksum,
      version: 1,
      status: "active",
      module: input.module,
      sourceId: input.sourceId,
      pmid: input.pmid,
      doi: input.doi,
      evidencePackageId: input.evidencePackageId,
      createdBy: input.createdBy,
      retentionPolicy: input.retentionPolicy ?? "selective",
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata,
    };

    documentRegistry.set(record.id, record);

    return record;
  }

  get(documentId: string): DocumentRegistryRecord | undefined {
    return documentRegistry.get(documentId);
  }

  list(tenantId: string): DocumentRegistryRecord[] {
    return Array.from(documentRegistry.values())
      .filter((document) => document.tenantId === tenantId)
      .filter((document) => document.status === "active")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  listByType(
    tenantId: string,
    documentType: DocumentRegistryRecord["documentType"],
  ): DocumentRegistryRecord[] {
    return this.list(tenantId).filter(
      (document) => document.documentType === documentType,
    );
  }

  archive(documentId: string): boolean {
    const existing = documentRegistry.get(documentId);

    if (!existing) {
      return false;
    }

    documentRegistry.set(documentId, {
      ...existing,
      status: "archived",
      updatedAt: new Date().toISOString(),
    });

    return true;
  }

  clearTenant(tenantId: string): number {
    let deleted = 0;

    for (const [id, document] of documentRegistry.entries()) {
      if (document.tenantId === tenantId) {
        documentRegistry.delete(id);
        deleted += 1;
      }
    }

    return deleted;
  }
}

export const documentManager = new DocumentManager();