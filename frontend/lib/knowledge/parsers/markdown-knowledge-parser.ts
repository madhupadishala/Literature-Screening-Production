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

const PARSER_NAME = "ClinixAI Markdown Knowledge Parser";
const PARSER_VERSION = "1.0.0";

function createDocumentId(input: KnowledgeParserInput) {
  const identity = [
    input.relativePath,
    input.checksum ?? "",
    input.fileName,
  ].join("|");

  return `knowledge_markdown_${createHash("sha256")
    .update(identity)
    .digest("hex")
    .slice(0, 24)}`;
}

function normalizeText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function removeInlineMarkdown(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .trim();
}

function createBlock(
  documentId: string,
  order: number,
  type: KnowledgeDocumentBlock["type"],
  text: string,
  level?: number,
): KnowledgeDocumentBlock {
  return {
    id: `${documentId}_block_${order}`,
    type,
    text: removeInlineMarkdown(text),
    level,
    position: {
      order,
    },
  };
}

function parseMarkdownBlocks(
  documentId: string,
  markdown: string,
) {
  const lines = markdown.split("\n");
  const blocks: KnowledgeDocumentBlock[] = [];

  let paragraphBuffer: string[] = [];
  let codeFenceOpen = false;

  function flushParagraph() {
    const text = normalizeText(paragraphBuffer.join(" "));

    if (text) {
      blocks.push(
        createBlock(
          documentId,
          blocks.length,
          "paragraph",
          text,
        ),
      );
    }

    paragraphBuffer = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith("```")) {
      flushParagraph();
      codeFenceOpen = !codeFenceOpen;
      continue;
    }

    if (codeFenceOpen) {
      paragraphBuffer.push(rawLine);
      continue;
    }

    if (!line) {
      flushParagraph();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      flushParagraph();

      blocks.push(
        createBlock(
          documentId,
          blocks.length,
          "heading",
          headingMatch[2],
          headingMatch[1].length,
        ),
      );

      continue;
    }

    if (/^([-*+]|\d+[.)])\s+/.test(line)) {
      flushParagraph();

      blocks.push(
        createBlock(
          documentId,
          blocks.length,
          "list_item",
          line.replace(/^([-*+]|\d+[.)])\s+/, ""),
        ),
      );

      continue;
    }

    if (/^>\s?/.test(line)) {
      flushParagraph();

      blocks.push(
        createBlock(
          documentId,
          blocks.length,
          "reference",
          line.replace(/^>\s?/, ""),
        ),
      );

      continue;
    }

    paragraphBuffer.push(line);
  }

  flushParagraph();

  return blocks;
}

export class MarkdownKnowledgeParser extends BaseKnowledgeParser {
  readonly name = PARSER_NAME;
  readonly version = PARSER_VERSION;

  readonly support: KnowledgeParserSupport = {
    extensions: [".md", ".markdown"],
    formats: ["markdown"],
  };

  async parse(
    input: KnowledgeParserInput,
  ): Promise<ParsedKnowledgeDocument> {
    if (!this.supports(input.extension)) {
      throw new KnowledgeParserError(
        `The Markdown parser does not support ${input.extension}.`,
        "UNSUPPORTED_FORMAT",
        input.absolutePath,
      );
    }

    try {
      const raw = await readFile(input.absolutePath, "utf8");
      const normalizedMarkdown = normalizeText(raw);

      if (!normalizedMarkdown) {
        throw new KnowledgeParserError(
          "The Markdown document is empty.",
          "EMPTY_DOCUMENT",
          input.absolutePath,
        );
      }

      const documentId = createDocumentId(input);
      const blocks = parseMarkdownBlocks(
        documentId,
        normalizedMarkdown,
      );

      const fullText = blocks
        .map((block) => block.text)
        .filter(Boolean)
        .join("\n\n")
        .trim();

      if (!fullText) {
        throw new KnowledgeParserError(
          "No readable Markdown content was extracted.",
          "EMPTY_DOCUMENT",
          input.absolutePath,
        );
      }

      const title =
        blocks.find((block) => block.type === "heading")?.text ??
        path.parse(input.fileName).name;

      return {
        documentId,
        sourcePath: input.absolutePath,
        relativePath: input.relativePath,
        fileName: input.fileName,
        format: "markdown",
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
          ? `Markdown parsing failed: ${error.message}`
          : "Markdown parsing failed for an unknown reason.",
        "PARSER_FAILURE",
        input.absolutePath,
        error,
      );
    }
  }
}

export const markdownKnowledgeParser =
  new MarkdownKnowledgeParser();