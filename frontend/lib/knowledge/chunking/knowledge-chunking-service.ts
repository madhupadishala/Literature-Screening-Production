import "server-only";

import { randomUUID } from "node:crypto";

import { ensureKnowledgeRoot } from "@/lib/knowledge/processing/knowledge-root";
import { ProcessedDocumentRepository } from "@/lib/knowledge/processing/processed-document-repository";

import { KnowledgeChunkRepository } from "./knowledge-chunk-repository";
import { sectionAwareChunker } from "./section-aware-chunker";

interface KnowledgeChunkingFileResult {
  relativePath: string;
  fileName: string;
  status:
    | "chunked"
    | "unchanged"
    | "failed";
  documentId?: string;
  chunkCount?: number;
  totalTokens?: number;
  valid?: boolean;
  issueCount?: number;
  warnings: string[];
  error?: string;
  completedAt: string;
}

interface KnowledgeChunkingRunResult {
  runId: string;
  startedAt: string;
  completedAt: string;
  processedDocuments: number;
  chunked: number;
  unchanged: number;
  failed: number;
  totalChunks: number;
  totalTokens: number;
  results: KnowledgeChunkingFileResult[];
}

export class KnowledgeChunkingService {
  async chunkAll(): Promise<KnowledgeChunkingRunResult> {
    const knowledgeRoot =
      await ensureKnowledgeRoot();

    const startedAt =
      new Date().toISOString();

    const processedRepository =
      new ProcessedDocumentRepository(
        knowledgeRoot,
      );

    const chunkRepository =
      new KnowledgeChunkRepository(
        knowledgeRoot,
      );

    const processedDocuments =
      await processedRepository.listSummaries();

    const results: KnowledgeChunkingFileResult[] =
      [];

    for (const summary of processedDocuments) {
      try {
        const existing =
          await chunkRepository.getSummary(
            summary.relativePath,
          );

        if (
          existing &&
          existing.sourceChecksum ===
            summary.checksum
        ) {
          results.push({
            relativePath:
              summary.relativePath,
            fileName: summary.fileName,
            status: "unchanged",
            documentId:
              summary.id,
            chunkCount:
              existing.chunkCount,
            totalTokens:
              existing.totalTokens,
            valid: existing.valid,
            issueCount:
              existing.issueCount,
            warnings: [],
            completedAt:
              new Date().toISOString(),
          });

          continue;
        }

        const processedRecord =
          await processedRepository.readDocument(
            summary.relativePath,
          );

        if (!processedRecord) {
          throw new Error(
            "Processed document record could not be found.",
          );
        }

        const chunkingResult =
          sectionAwareChunker.chunk({
            document:
              processedRecord.document,
            context: {
              layer:
                processedRecord.layer,
              category:
                processedRecord.category,
              authority:
                processedRecord.authority,
              tenantId:
                processedRecord.tenantId,
            },
          });

        if (!chunkingResult.validation.valid) {
          const errors =
            chunkingResult.validation.issues.filter(
              (issue) =>
                issue.severity === "error",
            );

          throw new Error(
            `Chunk validation failed with ${errors.length} error(s): ${errors
              .map((issue) => issue.code)
              .join(", ")}`,
          );
        }

        await chunkRepository.save(
          summary.relativePath,
          summary.checksum,
          chunkingResult,
        );

        results.push({
          relativePath:
            summary.relativePath,
          fileName: summary.fileName,
          status: "chunked",
          documentId:
            chunkingResult.documentId,
          chunkCount:
            chunkingResult.chunks.length,
          totalTokens:
            chunkingResult.totalTokens,
          valid:
            chunkingResult.validation.valid,
          issueCount:
            chunkingResult.validation.issues
              .length,
          warnings:
            chunkingResult.validation.issues
              .filter(
                (issue) =>
                  issue.severity === "warning",
              )
              .map(
                (issue) =>
                  `${issue.code}: ${issue.message}`,
              ),
          completedAt:
            new Date().toISOString(),
        });
      } catch (error) {
        results.push({
          relativePath:
            summary.relativePath,
          fileName: summary.fileName,
          status: "failed",
          warnings: [],
          error:
            error instanceof Error
              ? error.message
              : "Unknown knowledge chunking failure.",
          completedAt:
            new Date().toISOString(),
        });
      }
    }

    return {
      runId: randomUUID(),
      startedAt,
      completedAt:
        new Date().toISOString(),
      processedDocuments:
        processedDocuments.length,
      chunked: results.filter(
        (result) =>
          result.status === "chunked",
      ).length,
      unchanged: results.filter(
        (result) =>
          result.status === "unchanged",
      ).length,
      failed: results.filter(
        (result) =>
          result.status === "failed",
      ).length,
      totalChunks: results.reduce(
        (total, result) =>
          total +
          (result.chunkCount ?? 0),
        0,
      ),
      totalTokens: results.reduce(
        (total, result) =>
          total +
          (result.totalTokens ?? 0),
        0,
      ),
      results,
    };
  }

  async listChunkedDocuments() {
    const knowledgeRoot =
      await ensureKnowledgeRoot();

    const repository =
      new KnowledgeChunkRepository(
        knowledgeRoot,
      );

    return repository.listSummaries();
  }

  async getDocumentChunks(
    relativePath: string,
  ) {
    const knowledgeRoot =
      await ensureKnowledgeRoot();

    const repository =
      new KnowledgeChunkRepository(
        knowledgeRoot,
      );

    return repository.read(relativePath);
  }
}

export const knowledgeChunkingService =
  new KnowledgeChunkingService();