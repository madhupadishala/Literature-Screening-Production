import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  KnowledgeIngestionManifest,
  KnowledgeIngestionRecord,
} from "./knowledge-ingestion-types";

const MANIFEST_FILE_NAME = ".clinixai-ingestion-manifest.json";

function createEmptyManifest(): KnowledgeIngestionManifest {
  return {
    schemaVersion: "1.0",
    updatedAt: new Date(0).toISOString(),
    records: {},
  };
}

export class KnowledgeIngestionManifestRepository {
  constructor(private readonly rootPath: string) {}

  private get manifestPath() {
    return path.join(this.rootPath, MANIFEST_FILE_NAME);
  }

  async load(): Promise<KnowledgeIngestionManifest> {
    try {
      const raw = await readFile(this.manifestPath, "utf8");
      const parsed = JSON.parse(raw) as KnowledgeIngestionManifest;

      if (
        parsed.schemaVersion !== "1.0" ||
        typeof parsed.records !== "object" ||
        parsed.records === null
      ) {
        throw new Error("Invalid ingestion manifest structure");
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
        return createEmptyManifest();
      }

      throw error;
    }
  }

  async saveRecord(record: KnowledgeIngestionRecord) {
    const manifest = await this.load();

    manifest.records[record.relativePath] = record;
    manifest.updatedAt = new Date().toISOString();

    await this.save(manifest);

    return record;
  }

  async saveRecords(records: KnowledgeIngestionRecord[]) {
    const manifest = await this.load();

    for (const record of records) {
      manifest.records[record.relativePath] = record;
    }

    manifest.updatedAt = new Date().toISOString();

    await this.save(manifest);

    return manifest;
  }

  async getRecord(relativePath: string) {
    const manifest = await this.load();
    return manifest.records[relativePath] ?? null;
  }

  private async save(manifest: KnowledgeIngestionManifest) {
    await mkdir(this.rootPath, {
      recursive: true,
    });

    const temporaryPath = `${this.manifestPath}.tmp`;

    await writeFile(
      temporaryPath,
      JSON.stringify(manifest, null, 2),
      "utf8",
    );

    await rename(temporaryPath, this.manifestPath);
  }
}