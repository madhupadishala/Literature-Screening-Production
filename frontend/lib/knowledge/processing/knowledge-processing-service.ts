import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { documentNormalizer } from "@/lib/knowledge/document-intelligence/document-normalizer";
import { discoverKnowledgeFiles } from "@/lib/knowledge/ingestion/knowledge-file-discovery";
import { knowledgeParserFactory } from "@/lib/knowledge/parsers/knowledge-parser-factory";
import { KnowledgeParserError } from "@/lib/knowledge/parsers/parser-types";

import { ensureKnowledgeRoot } from "./knowledge-root";
import { ProcessedDocumentRepository } from "./processed-document-repository";

import type {
  KnowledgeProcessingFileResult,
  KnowledgeProcessingRunResult,
} from "./knowledge-processing-types";

function createChecksum(content: Buffer) {
  return createHash("sha256")
    .update(content)
    .digest("hex");
}

function createUnsupportedResult(
  relativePath: string,
  fileName: string,
  extension: string,
): KnowledgeProcessingFileResult {
  return {
    relativePath,
    fileName,
    extension,
    status: "unsupported",
    warnings: [
      `No registered parser supports ${
        extension || "(no extension)"
      }.`,
    ],
    errorCode: "UNSUPPORTED_FORMAT",
    processedAt: new Date().toISOString(),
  };
}

export class KnowledgeProcessingService {
  async processAll(): Promise<KnowledgeProcessingRunResult> {
    const rootPath = await ensureKnowledgeRoot();
    const startedAt = new Date().toISOString();

    const repository =
      new ProcessedDocumentRepository(rootPath);

    const discoveredFiles =
      await discoverKnowledgeFiles(rootPath);

    const results: KnowledgeProcessingFileResult[] = [];

    for (const file of discoveredFiles) {
      if (
        !knowledgeParserFactory.supports(
          file.extension,
        )
      ) {
        results.push(
          createUnsupportedResult(
            file.relativePath,
            file.fileName,
            file.extension,
          ),
        );

        continue;
      }

      try {
        const fileBuffer = await readFile(
          file.absolutePath,
        );

        const checksum =
          createChecksum(fileBuffer);

        const existingSummary =
          await repository.getSummary(
            file.relativePath,
          );

        if (
          existingSummary &&
          existingSummary.checksum === checksum
        ) {
          results.push({
            relativePath: file.relativePath,
            fileName: file.fileName,
            extension: file.extension,
            status: "unchanged",
            checksum,
            documentId: existingSummary.id,
            title: existingSummary.title,
            pageCount: existingSummary.pageCount,
            blockCount: existingSummary.blockCount,
            sectionCount:
              existingSummary.sectionCount,
            warnings: [],
            processedAt:
              new Date().toISOString(),
          });

          continue;
        }

        const parsed =
          await knowledgeParserFactory.parse({
            absolutePath: file.absolutePath,
            relativePath: file.relativePath,
            fileName: file.fileName,
            extension: file.extension,
            checksum,
            tenantId: file.tenantId,
          });

        const normalization =
          documentNormalizer.normalize(parsed);

        const saved = await repository.save(
          file,
          checksum,
          normalization.document,
        );

        results.push({
          relativePath: file.relativePath,
          fileName: file.fileName,
          extension: file.extension,
          status: "processed",
          checksum,
          documentId:
            saved.document.documentId,
          title: saved.document.title,
          pageCount:
            saved.document.pageCount,
          blockCount:
            saved.document.blocks.length,
          sectionCount:
            saved.document.sections.length,
          warnings:
            saved.document.warnings,
          processedAt:
            saved.processedAt,
        });
      } catch (error) {
        const parserError =
          error instanceof KnowledgeParserError
            ? error
            : null;

        results.push({
          relativePath: file.relativePath,
          fileName: file.fileName,
          extension: file.extension,
          status: "failed",
          warnings: [],
          errorCode:
            parserError?.code ??
            "PROCESSING_FAILURE",
          error:
            error instanceof Error
              ? error.message
              : "Unknown knowledge processing failure.",
          processedAt:
            new Date().toISOString(),
        });
      }
    }

    return {
      runId: randomUUID(),
      rootPath,
      startedAt,
      completedAt: new Date().toISOString(),
      discovered: discoveredFiles.length,
      processed: results.filter(
        (result) =>
          result.status === "processed",
      ).length,
      unchanged: results.filter(
        (result) =>
          result.status === "unchanged",
      ).length,
      unsupported: results.filter(
        (result) =>
          result.status === "unsupported",
      ).length,
      failed: results.filter(
        (result) =>
          result.status === "failed",
      ).length,
      results,
    };
  }

  async listProcessedDocuments() {
    const rootPath = await ensureKnowledgeRoot();

    const repository =
      new ProcessedDocumentRepository(rootPath);

    return repository.listSummaries();
  }

  async getProcessedDocument(
    relativePath: string,
  ) {
    const rootPath = await ensureKnowledgeRoot();

    const repository =
      new ProcessedDocumentRepository(rootPath);

    return repository.readDocument(relativePath);
  }
}

export const knowledgeProcessingService =
  new KnowledgeProcessingService();