import type {
  KnowledgeChunk,
  KnowledgeChunkValidationIssue,
  KnowledgeChunkValidationResult,
  KnowledgeChunkingOptions,
} from "./knowledge-chunk-types";

export class KnowledgeChunkValidator {
  validate(
    chunks: KnowledgeChunk[],
    options: KnowledgeChunkingOptions,
  ): KnowledgeChunkValidationResult {
    const issues: KnowledgeChunkValidationIssue[] = [];
    const contentHashes = new Set<string>();

    for (const chunk of chunks) {
      if (!chunk.documentId) {
        issues.push({
          code: "MISSING_DOCUMENT_ID",
          severity: "error",
          message: "Chunk does not contain a document ID.",
          chunkId: chunk.id,
        });
      }

      if (!chunk.text.trim()) {
        issues.push({
          code: "EMPTY_TEXT",
          severity: "error",
          message: "Chunk contains no text.",
          chunkId: chunk.id,
        });
      }

      if (chunk.tokenCount > options.maxTokens) {
        issues.push({
          code: "TOKEN_LIMIT_EXCEEDED",
          severity: "error",
          message: `Chunk contains ${chunk.tokenCount} tokens; maximum is ${options.maxTokens}.`,
          chunkId: chunk.id,
        });
      }

      if (
        chunk.tokenCount < options.minimumTokens &&
        chunks.length > 1
      ) {
        issues.push({
          code: "BELOW_MINIMUM_SIZE",
          severity: "warning",
          message: `Chunk contains only ${chunk.tokenCount} tokens.`,
          chunkId: chunk.id,
        });
      }

      if (!chunk.citation.citationText.trim()) {
        issues.push({
          code: "MISSING_CITATION",
          severity: "error",
          message: "Chunk does not contain a usable citation.",
          chunkId: chunk.id,
        });
      }

      if (contentHashes.has(chunk.contentHash)) {
        issues.push({
          code: "DUPLICATE_CONTENT",
          severity: "warning",
          message:
            "Another chunk in this document has identical normalized content.",
          chunkId: chunk.id,
        });
      }

      contentHashes.add(chunk.contentHash);
    }

    return {
      valid: !issues.some(
        (issue) => issue.severity === "error",
      ),
      issues,
    };
  }
}

export const knowledgeChunkValidator =
  new KnowledgeChunkValidator();