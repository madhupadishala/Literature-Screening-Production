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
  KnowledgeChunk,
  KnowledgeChunkingResult,
} from "./knowledge-chunk-types";

interface KnowledgeChunkDocumentSummary {
  documentId: string;
  relativePath: string;
  documentTitle: string;
  chunkCount: number;
  totalTokens: number;
  valid: boolean;
  issueCount: number;
  chunkedAt: string;
  chunkerName: string;
  chunkerVersion: string;
  sourceChecksum: string;
}

interface KnowledgeChunkIndex {
  schemaVersion: "1.0";
  updatedAt: string;
  documents: Record<string, KnowledgeChunkDocumentSummary>;
}

interface StoredKnowledgeChunks {
  id: string;
  documentId: string;
  relativePath: string;
  sourceChecksum: string;
  result: KnowledgeChunkingResult;
  chunks: KnowledgeChunk[];
  storedAt: string;
}

const STORAGE_DIRECTORY = ".clinixai";
const CHUNK_DIRECTORY = "chunks";
const INDEX_FILE_NAME = "chunk-index.json";

function createEmptyIndex(): KnowledgeChunkIndex {
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

export class KnowledgeChunkRepository {
  constructor(
    private readonly knowledgeRoot: string,
  ) {}

  private get storageRoot() {
    return path.join(
      this.knowledgeRoot,
      STORAGE_DIRECTORY,
    );
  }

  private get chunkRoot() {
    return path.join(
      this.storageRoot,
      CHUNK_DIRECTORY,
    );
  }

  private get indexPath() {
    return path.join(
      this.storageRoot,
      INDEX_FILE_NAME,
    );
  }

  private getChunkPath(relativePath: string) {
    return path.join(
      this.chunkRoot,
      `${createStorageKey(relativePath)}.json`,
    );
  }

  async initialize() {
    await mkdir(this.chunkRoot, {
      recursive: true,
    });
  }

  async loadIndex(): Promise<KnowledgeChunkIndex> {
    await this.initialize();

    try {
      const raw = await readFile(
        this.indexPath,
        "utf8",
      );

      const parsed =
        JSON.parse(raw) as KnowledgeChunkIndex;

      if (
        parsed.schemaVersion !== "1.0" ||
        !parsed.documents ||
        typeof parsed.documents !== "object"
      ) {
        throw new Error(
          "Knowledge chunk index has an invalid structure.",
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
        right.chunkedAt.localeCompare(
          left.chunkedAt,
        ),
    );
  }

  async read(
    relativePath: string,
  ): Promise<StoredKnowledgeChunks | null> {
    await this.initialize();

    try {
      const raw = await readFile(
        this.getChunkPath(relativePath),
        "utf8",
      );

      return JSON.parse(
        raw,
      ) as StoredKnowledgeChunks;
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
    relativePath: string,
    sourceChecksum: string,
    result: KnowledgeChunkingResult,
  ) {
    await this.initialize();

    const stored: StoredKnowledgeChunks = {
      id: randomUUID(),
      documentId: result.documentId,
      relativePath,
      sourceChecksum,
      result,
      chunks: result.chunks,
      storedAt: new Date().toISOString(),
    };

    await this.writeJsonAtomically(
      this.getChunkPath(relativePath),
      stored,
    );

    const index = await this.loadIndex();

    index.documents[relativePath] = {
      documentId: result.documentId,
      relativePath,
      documentTitle: result.documentTitle,
      chunkCount: result.chunks.length,
      totalTokens: result.totalTokens,
      valid: result.validation.valid,
      issueCount: result.validation.issues.length,
      chunkedAt: result.chunkedAt,
      chunkerName: result.chunkerName,
      chunkerVersion: result.chunkerVersion,
      sourceChecksum,
    };

    index.updatedAt = new Date().toISOString();

    await this.writeJsonAtomically(
      this.indexPath,
      index,
    );

    return stored;
  }

  private async writeJsonAtomically(
    targetPath: string,
    value: unknown,
  ) {
    const temporaryPath =
      `${targetPath}.${randomUUID()}.tmp`;

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