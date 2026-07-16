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

const PARSER_NAME = "ClinixAI Text Knowledge Parser";
const PARSER_VERSION = "1.0.0";

function createDocumentId(input: KnowledgeParserInput) {
  const identity = [
    input.relativePath,
    input.checksum ?? "",
    input.fileName,
  ].join("|");

  return `knowledge_text_${createHash("sha256")
    .update(identity)
    .digest("hex")
    .slice(0, 24)}`;
}

function normalizeText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function resolveSectionNumber(text: string) {
  return text.match(
    /^((?:[A-Z]{1,5}\.)?\d+(?:\.\d+){0,6})[\s:.-]+/,
  )?.[1];
}

function isHeading(text: string) {
  if (resolveSectionNumber(text)) {
    return true;
  }

  if (/^[A-Z][A-Z0-9\s/&(),.-]{3,120}$/.test(text)) {
    return true;
  }

  return (
    text.length <= 120 &&
    !/[.!?;:]$/.test(text) &&
    /^[A-Z]/.test(text)
  );
}

export class TextKnowledgeParser extends BaseKnowledgeParser {
  readonly name = PARSER_NAME;
  readonly version = PARSER_VERSION;

  readonly support: KnowledgeParserSupport = {
    extensions: [".txt"],
    formats: ["text"],
  };

  async parse(
    input: KnowledgeParserInput,
  ): Promise<ParsedKnowledgeDocument> {
    if (!this.supports(input.extension)) {
      throw new KnowledgeParserError(
        `The text parser does not support ${input.extension}.`,
        "UNSUPPORTED_FORMAT",
        input.absolutePath,
      );
    }

    try {
      const raw = await readFile(input.absolutePath, "utf8");
      const fullText = normalizeText(raw);

      if (!fullText) {
        throw new KnowledgeParserError(
          "The text document is empty.",
          "EMPTY_DOCUMENT",
          input.absolutePath,
        );
      }

      const documentId = createDocumentId(input);
      const units = fullText
        .split(/\n{2,}|\n(?=\d+(?:\.\d+)*[\s:.-]+)/)
        .map((unit) => normalizeText(unit))
        .filter(Boolean);

      const blocks: KnowledgeDocumentBlock[] = units.map(
        (text, order) => {
          const heading = isHeading(text);
          const sectionNumber = resolveSectionNumber(text);

          return {
            id: `${documentId}_block_${order}`,
            type: heading ? "heading" : "paragraph",
            text,
            level: heading
              ? sectionNumber?.split(".").length ?? 1
              : undefined,
            sectionNumber,
            position: {
              order,
            },
          };
        },
      );

      const title =
        blocks.find((block) => block.type === "heading")?.text ??
        path.parse(input.fileName).name;

      return {
        documentId,
        sourcePath: input.absolutePath,
        relativePath: input.relativePath,
        fileName: input.fileName,
        format: "text",
        title,
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
          ? `Text parsing failed: ${error.message}`
          : "Text parsing failed for an unknown reason.",
        "PARSER_FAILURE",
        input.absolutePath,
        error,
      );
    }
  }
}

export const textKnowledgeParser = new TextKnowledgeParser();