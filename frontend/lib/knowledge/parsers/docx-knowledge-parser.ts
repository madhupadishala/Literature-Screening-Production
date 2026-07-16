import "server-only";

import { createHash } from "node:crypto";
import path from "node:path";

import * as cheerio from "cheerio";
import mammoth from "mammoth";

import { BaseKnowledgeParser } from "./knowledge-parser";
import {
  KnowledgeParserError,
  type KnowledgeDocumentBlock,
  type KnowledgeParserInput,
  type KnowledgeParserSupport,
  type ParsedKnowledgeDocument,
} from "./parser-types";

const PARSER_NAME = "ClinixAI Mammoth DOCX Knowledge Parser";
const PARSER_VERSION = "1.0.0";

function createDocumentId(input: KnowledgeParserInput) {
  const identity = [
    input.relativePath,
    input.checksum ?? "",
    input.fileName,
  ].join("|");

  return `knowledge_docx_${createHash("sha256")
    .update(identity)
    .digest("hex")
    .slice(0, 24)}`;
}

function normalizeText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function classifyTag(
  tagName: string,
): {
  type: KnowledgeDocumentBlock["type"];
  level?: number;
} {
  if (/^h[1-6]$/.test(tagName)) {
    return {
      type: "heading",
      level: Number(tagName.slice(1)),
    };
  }

  if (tagName === "li") {
    return {
      type: "list_item",
    };
  }

  if (tagName === "table") {
    return {
      type: "table",
    };
  }

  if (tagName === "blockquote") {
    return {
      type: "reference",
    };
  }

  return {
    type: "paragraph",
  };
}

export class DOCXKnowledgeParser extends BaseKnowledgeParser {
  readonly name = PARSER_NAME;
  readonly version = PARSER_VERSION;

  readonly support: KnowledgeParserSupport = {
    extensions: [".docx"],
    formats: ["docx"],
  };

  async parse(
    input: KnowledgeParserInput,
  ): Promise<ParsedKnowledgeDocument> {
    if (!this.supports(input.extension)) {
      throw new KnowledgeParserError(
        `The DOCX parser does not support ${input.extension}.`,
        "UNSUPPORTED_FORMAT",
        input.absolutePath,
      );
    }

    try {
      const conversion = await mammoth.convertToHtml({
        path: input.absolutePath,
      });

      const html = conversion.value;

      if (!html.trim()) {
        throw new KnowledgeParserError(
          "No readable DOCX content was extracted.",
          "EMPTY_DOCUMENT",
          input.absolutePath,
        );
      }

      const $ = cheerio.load(html, null, false);
      const documentId = createDocumentId(input);
      const blocks: KnowledgeDocumentBlock[] = [];

      $.root()
        .find(
          "h1,h2,h3,h4,h5,h6,p,li,table,blockquote",
        )
        .each((_, element) => {
          const tagName = element.tagName.toLowerCase();
          const classification = classifyTag(tagName);

          let text = "";

          if (tagName === "table") {
            const rows: string[] = [];

            $(element)
              .find("tr")
              .each((__, row) => {
                const cells = $(row)
                  .find("th,td")
                  .map((___, cell) =>
                    normalizeText($(cell).text()),
                  )
                  .get()
                  .filter(Boolean);

                if (cells.length > 0) {
                  rows.push(cells.join(" | "));
                }
              });

            text = rows.join("\n");
          } else {
            text = normalizeText($(element).text());
          }

          if (!text) {
            return;
          }

          blocks.push({
            id: `${documentId}_block_${blocks.length}`,
            type: classification.type,
            text,
            level: classification.level,
            position: {
              order: blocks.length,
            },
            metadata: {
              sourceTag: tagName,
            },
          });
        });

      const fullText = blocks
        .map((block) => block.text)
        .filter(Boolean)
        .join("\n\n")
        .trim();

      if (!fullText) {
        throw new KnowledgeParserError(
          "The DOCX file produced no normalized document content.",
          "EMPTY_DOCUMENT",
          input.absolutePath,
        );
      }

      const warnings = conversion.messages.map((message) =>
        message.message.trim(),
      );

      const title =
        blocks.find((block) => block.type === "heading")?.text ??
        path.parse(input.fileName).name;

      return {
        documentId,
        sourcePath: input.absolutePath,
        relativePath: input.relativePath,
        fileName: input.fileName,
        format: "docx",
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
          mammothMessages: warnings.length,
        },
        warnings,
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
          ? `DOCX parsing failed: ${error.message}`
          : "DOCX parsing failed for an unknown reason.",
        "PARSER_FAILURE",
        input.absolutePath,
        error,
      );
    }
  }
}

export const docxKnowledgeParser =
  new DOCXKnowledgeParser();