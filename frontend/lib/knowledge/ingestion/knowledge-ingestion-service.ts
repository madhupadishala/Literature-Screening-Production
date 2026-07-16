import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  isSupportedKnowledgeExtension,
  readKnowledgeContent,
} from "./knowledge-content-reader";
import { discoverKnowledgeFiles } from "./knowledge-file-discovery";
import { KnowledgeIngestionManifestRepository } from "./knowledge-ingestion-manifest";

import type {
  DiscoveredKnowledgeFile,
  KnowledgeIngestionRecord,
  KnowledgeIngestionRunResult,
} from "./knowledge-ingestion-types";

function createChecksum(content: Buffer) {
  return createHash("sha256").update(content).digest("hex");
}

function createRecord(
  file: DiscoveredKnowledgeFile,
  input: {
    checksum: string;
    contentLength: number;
    status: KnowledgeIngestionRecord["status"];
    warnings?: string[];
    error?: string;
  },
): KnowledgeIngestionRecord {
  return {
    id: randomUUID(),
    relativePath: file.relativePath,
    checksum: input.checksum,
    layer: file.layer,
    category: file.category,
    authority: file.authority,
    tenantId: file.tenantId,
    fileName: file.fileName,
    extension: file.extension,
    sizeBytes: file.sizeBytes,
    modifiedAt: file.modifiedAt,
    contentLength: input.contentLength,
    status: input.status,
    warnings: input.warnings ?? [],
    error: input.error,
    processedAt: new Date().toISOString(),
  };
}

export class KnowledgeIngestionService {
  async ingest(rootPath: string): Promise<KnowledgeIngestionRunResult> {
    const resolvedRootPath = path.resolve(rootPath);
    const startedAt = new Date().toISOString();

    await mkdir(resolvedRootPath, {
      recursive: true,
    });

    const manifestRepository =
      new KnowledgeIngestionManifestRepository(resolvedRootPath);

    const manifest = await manifestRepository.load();
    const files = await discoverKnowledgeFiles(resolvedRootPath);
    const records: KnowledgeIngestionRecord[] = [];

    for (const file of files) {
      if (!isSupportedKnowledgeExtension(file.extension)) {
        records.push(
          createRecord(file, {
            checksum: "",
            contentLength: 0,
            status: "unsupported",
            warnings: [
              `Extension ${file.extension || "(none)"} is not supported by the current reader.`,
            ],
          }),
        );

        continue;
      }

      try {
        const fileBuffer = await readFile(file.absolutePath);
        const checksum = createChecksum(fileBuffer);
        const previousRecord = manifest.records[file.relativePath];

        if (
          previousRecord &&
          previousRecord.checksum === checksum &&
          previousRecord.status === "processed"
        ) {
          records.push({
            ...previousRecord,
            status: "unchanged",
            processedAt: new Date().toISOString(),
          });

          continue;
        }

        const content = await readKnowledgeContent(file);

        if (!content.text) {
          records.push(
            createRecord(file, {
              checksum,
              contentLength: 0,
              status: "failed",
              warnings: content.warnings,
              error: "EMPTY_EXTRACTED_CONTENT",
            }),
          );

          continue;
        }

        records.push(
          createRecord(file, {
            checksum,
            contentLength: content.text.length,
            status: "processed",
            warnings: content.warnings,
          }),
        );
      } catch (error) {
        records.push(
          createRecord(file, {
            checksum: "",
            contentLength: 0,
            status: "failed",
            error:
              error instanceof Error
                ? error.message
                : "Unknown knowledge ingestion failure",
          }),
        );
      }
    }

    await manifestRepository.saveRecords(records);

    return {
      runId: randomUUID(),
      rootPath: resolvedRootPath,
      startedAt,
      completedAt: new Date().toISOString(),
      discovered: files.length,
      processed: records.filter((record) => record.status === "processed")
        .length,
      unchanged: records.filter((record) => record.status === "unchanged")
        .length,
      unsupported: records.filter((record) => record.status === "unsupported")
        .length,
      failed: records.filter((record) => record.status === "failed").length,
      records,
    };
  }
}

export const knowledgeIngestionService =
  new KnowledgeIngestionService();