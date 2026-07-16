import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { BaseKnowledgeParser } from "./knowledge-parser";
import {
  KnowledgeParserError,
  type KnowledgeDocumentBlock,
  type KnowledgeParserInput,
  type KnowledgeParserSupport,
  type ParsedKnowledgeDocument,
} from "./parser-types";

const PARSER_NAME = "ClinixAI JSON Knowledge Parser";
const PARSER_VERSION = "1.0.0";
const MAX_DEPTH = 30;

function createDocumentId(input: KnowledgeParserInput) {
  const identity = [
    input.relativePath,
    input.checksum ?? "",
    input.fileName,
  ].join("|");

  return `knowledge_json_${createHash("sha256")
    .update(identity)
    .digest("hex")
    .slice(0, 24)}`;
}

function formatPrimitive(value: unknown) {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  return "";
}

function flattenJson(
  documentId: string,
  value: unknown,
  pathSegments: string[],
  blocks: KnowledgeDocumentBlock[],
  depth = 0,
) {
  if (depth > MAX_DEPTH) {
    throw new Error(
      `JSON depth exceeds the supported maximum of ${MAX_DEPTH}.`,
    );
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    const text = formatPrimitive(value);

    if (text) {
      const label =
        pathSegments.length > 0
          ? `${pathSegments.join(".")}: ${text}`
          : text;

      blocks.push({
        id: `${documentId}_block_${blocks.length}`,
        type: "paragraph",
        text: label,
        position: {
          order: blocks.length,
        },
        metadata: {
          jsonPath: pathSegments.join("."),
        },
      });
    }

    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      flattenJson(
        documentId,
        item,
        [...pathSegments, String(index)],
        blocks,
        depth + 1,
      );
    });

    return;
  }

  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const childPath = [...pathSegments, key];

      if (
        child !== null &&
        typeof child === "object"
      ) {
        blocks.push({
          id: `${documentId}_block_${blocks.length}`,
          type: "heading",
          text: key,
          level: Math.min(depth + 1, 6),
          position: {
            order: blocks.length,
          },
          metadata: {
            jsonPath: childPath.join("."),
          },
        });
      }

      flattenJson(
        documentId,
        child,
        childPath,
        blocks,
        depth + 1,
      );
    }
  }
}

export class JSONKnowledgeParser extends BaseKnowledgeParser {
  readonly name = PARSER_NAME;
  readonly version = PARSER_VERSION;

  readonly support: KnowledgeParserSupport = {
    extensions: [".json"],
    formats: ["json"],
  };

  async parse(
    input: KnowledgeParserInput,
  ): Promise<ParsedKnowledgeDocument> {
    if (!this.supports(input.extension)) {
      throw new KnowledgeParserError(
        `The JSON parser does not support ${input.extension}.`,
        "UNSUPPORTED_FORMAT",
        input.absolutePath,
      );
    }

    try {
      const raw = await readFile(input.absolutePath, "utf8");

      if (!raw.trim()) {
        throw new KnowledgeParserError(
          "The JSON document is empty.",
          "EMPTY_DOCUMENT",
          input.absolutePath,
        );
      }

      let parsed: unknown;

      try {
        parsed = JSON.parse(raw) as unknown;
      } catch (error) {
        throw new KnowledgeParserError(
          error instanceof Error
            ? `Invalid JSON document: ${error.message}`
            : "Invalid JSON document.",
          "INVALID_DOCUMENT",
          input.absolutePath,
          error,
        );
      }

      const documentId = createDocumentId(input);
      const blocks: KnowledgeDocumentBlock[] = [];

      flattenJson(documentId, parsed, [], blocks);

      const fullText = blocks
        .map((block) => block.text)
        .filter(Boolean)
        .join("\n")
        .trim();

      if (!fullText) {
        throw new KnowledgeParserError(
          "No readable JSON content was extracted.",
          "EMPTY_DOCUMENT",
          input.absolutePath,
        );
      }

      const topLevelTitle =
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        "title" in parsed &&
        typeof parsed.title === "string"
          ? parsed.title.trim()
          : "";

      return {
        documentId,
        sourcePath: input.absolutePath,
        relativePath: input.relativePath,
        fileName: input.fileName,
        format: "json",
        title:
          topLevelTitle ||
          path.parse(input.fileName).name,
        language: "en",
        pageCount: 1,
        pages: [
          {
            pageNumber: 1,
            text: fullText,
            blocks,
          },
        ],
        blocks,
        fullText,
        metadata: {
          checksum: input.checksum ?? null,
          tenantId: input.tenantId ?? null,
          rootType: Array.isArray(parsed)
            ? "array"
            : typeof parsed,
        },
        warnings: [],
        parsedAt: new Date().toISOString(),
        parserName: this.name,
        parserVersion: this.version,
      };
    } catch (error) {
      if (error instanceof KnowledgeParserError) {
        throw error;
      }

      throw new KnowledgeParserError(
        error instanceof Error
          ? `JSON parsing failed: ${error.message}`
          : "JSON parsing failed for an unknown reason.",
        "PARSER_FAILURE",
        input.absolutePath,
        error,
      );
    }
  }
}

export const jsonKnowledgeParser =
  new JSONKnowledgeParser();