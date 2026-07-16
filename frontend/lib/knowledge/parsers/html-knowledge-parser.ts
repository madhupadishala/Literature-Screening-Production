import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import * as cheerio from "cheerio";

import { BaseKnowledgeParser } from "./knowledge-parser";
import {
  KnowledgeParserError,
  type KnowledgeDocumentBlock,
  type KnowledgeParserInput,
  type KnowledgeParserSupport,
  type ParsedKnowledgeDocument,
} from "./parser-types";

const PARSER_NAME = "ClinixAI Cheerio HTML Knowledge Parser";
const PARSER_VERSION = "1.0.0";

function createDocumentId(input: KnowledgeParserInput) {
  const identity = [
    input.relativePath,
    input.checksum ?? "",
    input.fileName,
  ].join("|");

  return `knowledge_html_${createHash("sha256")
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

function elementType(
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

  if (
    tagName === "blockquote" ||
    tagName === "cite"
  ) {
    return {
      type: "reference",
    };
  }

  return {
    type: "paragraph",
  };
}

export class HTMLKnowledgeParser extends BaseKnowledgeParser {
  readonly name = PARSER_NAME;
  readonly version = PARSER_VERSION;

  readonly support: KnowledgeParserSupport = {
    extensions: [".html", ".htm"],
    formats: ["html"],
  };

  async parse(
    input: KnowledgeParserInput,
  ): Promise<ParsedKnowledgeDocument> {
    if (!this.supports(input.extension)) {
      throw new KnowledgeParserError(
        `The HTML parser does not support ${input.extension}.`,
        "UNSUPPORTED_FORMAT",
        input.absolutePath,
      );
    }

    try {
      const raw = await readFile(input.absolutePath, "utf8");

      if (!raw.trim()) {
        throw new KnowledgeParserError(
          "The HTML document is empty.",
          "EMPTY_DOCUMENT",
          input.absolutePath,
        );
      }

      const $ = cheerio.load(raw);

      $("script, style, noscript, iframe, svg").remove();

      const documentId = createDocumentId(input);
      const blocks: KnowledgeDocumentBlock[] = [];

      $("body")
        .find(
          "h1,h2,h3,h4,h5,h6,p,li,table,blockquote,cite",
        )
        .each((_, element) => {
          const tagName = element.tagName.toLowerCase();
          const classification = elementType(tagName);

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
              htmlTag: tagName,
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
          "No readable HTML content was extracted.",
          "EMPTY_DOCUMENT",
          input.absolutePath,
        );
      }

      const htmlTitle = normalizeText(
        $("title").first().text(),
      );

      const headingTitle = blocks.find(
        (block) => block.type === "heading",
      )?.text;

      return {
        documentId,
        sourcePath: input.absolutePath,
        relativePath: input.relativePath,
        fileName: input.fileName,
        format: "html",
        title:
          htmlTitle ||
          headingTitle ||
          path.parse(input.fileName).name,
        language:
          $("html").attr("lang")?.trim() || "en",
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
          description:
            $('meta[name="description"]').attr("content") ??
            null,
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
          ? `HTML parsing failed: ${error.message}`
          : "HTML parsing failed for an unknown reason.",
        "PARSER_FAILURE",
        input.absolutePath,
        error,
      );
    }
  }
}

export const htmlKnowledgeParser =
  new HTMLKnowledgeParser();