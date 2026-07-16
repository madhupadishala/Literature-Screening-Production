import "server-only";

import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import type {
  DiscoveredKnowledgeFile,
} from "@/lib/knowledge/ingestion/knowledge-ingestion-types";

import type {
  NormalizedKnowledgeDocument,
} from "@/lib/knowledge/document-intelligence/document-intelligence-types";

import type {
  ProcessedKnowledgeDocumentRecord,
  ProcessedKnowledgeDocumentSummary,
  ProcessedKnowledgeIndex,
} from "./knowledge-processing-types";

const STORAGE_DIRECTORY = ".clinixai";
const PROCESSED_DIRECTORY = "processed";
const INDEX_FILE_NAME = "processed-index.json";

function createEmptyIndex(): ProcessedKnowledgeIndex {
  return {
    schemaVersion: "1.0",
    updatedAt: new Date(0).toISOString(),
    documents: {},
  };
}

function createStorageKey(relativePath: string) {
  return createHash("sha256")
    .update(relativePath.toLowerCase())
    .digest("hex");
}

function createSummary(
  record: ProcessedKnowledgeDocumentRecord,
): ProcessedKnowledgeDocumentSummary {
  return {
    id: record.id,
    relativePath: record.relativePath,
    checksum: record.checksum,
    layer: record.layer,
    category: record.category,
    authority: record.authority,
    tenantId: record.tenantId,
    fileName: record.fileName,
    extension: record.extension,
    sizeBytes: record.sizeBytes,
    modifiedAt: record.modifiedAt,
    title: record.document.title,
    format: record.document.format,
    pageCount: record.document.pageCount,
    blockCount: record.document.blocks.length,
    sectionCount: record.document.sections.length,
    warningCount: record.document.warnings.length,
    parserName: record.document.parserName,
    parserVersion: record.document.parserVersion,
    processedAt: record.processedAt,
  };
}

export class ProcessedDocumentRepository {
  constructor(
    private readonly knowledgeRoot: string,
  ) {}

  private get storageRoot() {
    return path.join(
      this.knowledgeRoot,
      STORAGE_DIRECTORY,
    );
  }

  private get processedRoot() {
    return path.join(
      this.storageRoot,
      PROCESSED_DIRECTORY,
    );
  }

  private get indexPath() {
    return path.join(
      this.storageRoot,
      INDEX_FILE_NAME,
    );
  }

  private getDocumentPath(relativePath: string) {
    const storageKey = createStorageKey(relativePath);

    return path.join(
      this.processedRoot,
      `${storageKey}.json`,
    );
  }

  async initialize() {
    await mkdir(this.processedRoot, {
      recursive: true,
    });
  }

  async loadIndex(): Promise<ProcessedKnowledgeIndex> {
    await this.initialize();

    try {
      const raw = await readFile(
        this.indexPath,
        "utf8",
      );

      const parsed =
        JSON.parse(raw) as ProcessedKnowledgeIndex;

      if (
        parsed.schemaVersion !== "1.0" ||
        !parsed.documents ||
        typeof parsed.documents !== "object"
      ) {
        throw new Error(
          "Processed knowledge index has an invalid structure.",
        );
      }

      return parsed;
    } catch (error) {
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error
          ? String(error.code)
          : "";

      if (code === "ENOENT") {
        return createEmptyIndex();
      }

      throw error;
    }
  }

  async getSummary(relativePath: string) {
    const index = await this.loadIndex();

    return index.documents[relativePath] ?? null;
  }

  async listSummaries() {
    const index = await this.loadIndex();

    return Object.values(index.documents).sort(
      (left, right) =>
        right.processedAt.localeCompare(
          left.processedAt,
        ),
    );
  }

  async readDocument(
    relativePath: string,
  ): Promise<ProcessedKnowledgeDocumentRecord | null> {
    await this.initialize();

    try {
      const raw = await readFile(
        this.getDocumentPath(relativePath),
        "utf8",
      );

      return JSON.parse(
        raw,
      ) as ProcessedKnowledgeDocumentRecord;
    } catch (error) {
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error
          ? String(error.code)
          : "";

      if (code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  async save(
    file: DiscoveredKnowledgeFile,
    checksum: string,
    document: NormalizedKnowledgeDocument,
  ) {
    await this.initialize();

    const existing =
      await this.getSummary(file.relativePath);

    const record: ProcessedKnowledgeDocumentRecord = {
      id: existing?.id ?? randomUUID(),
      relativePath: file.relativePath,
      checksum,
      layer: file.layer,
      category: file.category,
      authority: file.authority,
      tenantId: file.tenantId,
      fileName: file.fileName,
      extension: file.extension,
      sizeBytes: file.sizeBytes,
      modifiedAt: file.modifiedAt,
      status: "processed",
      document,
      processedAt: new Date().toISOString(),
    };

    await this.writeJsonAtomically(
      this.getDocumentPath(file.relativePath),
      record,
    );

    const index = await this.loadIndex();

    index.documents[file.relativePath] =
      createSummary(record);

    index.updatedAt = new Date().toISOString();

    await this.writeJsonAtomically(
      this.indexPath,
      index,
    );

    return record;
  }

  private async writeJsonAtomically(
    targetPath: string,
    value: unknown,
  ) {
    const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;

    await writeFile(
      temporaryPath,
      JSON.stringify(value, null, 2),
      "utf8",
    );

    await rename(
      temporaryPath,
      targetPath,
    );
  }
}