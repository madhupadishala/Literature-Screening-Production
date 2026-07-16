import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { XMLParser, XMLValidator } from "fast-xml-parser";

import { BaseKnowledgeParser } from "./knowledge-parser";
import {
  KnowledgeParserError,
  type KnowledgeDocumentBlock,
  type KnowledgeParserInput,
  type KnowledgeParserSupport,
  type ParsedKnowledgeDocument,
} from "./parser-types";

const PARSER_NAME = "ClinixAI Fast XML Knowledge Parser";
const PARSER_VERSION = "1.0.0";
const MAX_DEPTH = 40;

function createDocumentId(input: KnowledgeParserInput) {
  const identity = [
    input.relativePath,
    input.checksum ?? "",
    input.fileName,
  ].join("|");

  return `knowledge_xml_${createHash("sha256")
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

function walkXml(
  documentId: string,
  value: unknown,
  pathSegments: string[],
  blocks: KnowledgeDocumentBlock[],
  depth = 0,
) {
  if (depth > MAX_DEPTH) {
    throw new Error(
      `XML depth exceeds the supported maximum of ${MAX_DEPTH}.`,
    );
  }

  if (
    value === null ||
    value === undefined
  ) {
    return;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    const text = normalizeText(String(value));

    if (text) {
      blocks.push({
        id: `${documentId}_block_${blocks.length}`,
        type: "paragraph",
        text,
        position: {
          order: blocks.length,
        },
        metadata: {
          xmlPath: pathSegments.join("."),
        },
      });
    }

    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      walkXml(
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

      if (!key.startsWith("@_") && key !== "#text") {
        blocks.push({
          id: `${documentId}_block_${blocks.length}`,
          type: "heading",
          text: key,
          level: Math.min(depth + 1, 6),
          position: {
            order: blocks.length,
          },
          metadata: {
            xmlPath: childPath.join("."),
          },
        });
      }

      walkXml(
        documentId,
        child,
        childPath,
        blocks,
        depth + 1,
      );
    }
  }
}

export class XMLKnowledgeParser extends BaseKnowledgeParser {
  readonly name = PARSER_NAME;
  readonly version = PARSER_VERSION;

  readonly support: KnowledgeParserSupport = {
    extensions: [".xml"],
    formats: ["xml"],
  };

  async parse(
    input: KnowledgeParserInput,
  ): Promise<ParsedKnowledgeDocument> {
    if (!this.supports(input.extension)) {
      throw new KnowledgeParserError(
        `The XML parser does not support ${input.extension}.`,
        "UNSUPPORTED_FORMAT",
        input.absolutePath,
      );
    }

    try {
      const raw = await readFile(input.absolutePath, "utf8");

      if (!raw.trim()) {
        throw new KnowledgeParserError(
          "The XML document is empty.",
          "EMPTY_DOCUMENT",
          input.absolutePath,
        );
      }

      const validation = XMLValidator.validate(raw);

      if (validation !== true) {
        throw new KnowledgeParserError(
          `Invalid XML document: ${validation.err.msg}`,
          "INVALID_DOCUMENT",
          input.absolutePath,
          validation,
        );
      }

      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        textNodeName: "#text",
        trimValues: true,
        parseTagValue: false,
        parseAttributeValue: false,
        allowBooleanAttributes: true,
      });

      const parsed = parser.parse(raw) as unknown;
      const documentId = createDocumentId(input);
      const blocks: KnowledgeDocumentBlock[] = [];

      walkXml(documentId, parsed, [], blocks);

      const fullText = blocks
        .map((block) => block.text)
        .filter(Boolean)
        .join("\n")
        .trim();

      if (!fullText) {
        throw new KnowledgeParserError(
          "No readable XML content was extracted.",
          "EMPTY_DOCUMENT",
          input.absolutePath,
        );
      }

      const firstHeading = blocks.find(
        (block) => block.type === "heading",
      )?.text;

      return {
        documentId,
        sourcePath: input.absolutePath,
        relativePath: input.relativePath,
        fileName: input.fileName,
        format: "xml",
        title:
          firstHeading ||
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
          ? `XML parsing failed: ${error.message}`
          : "XML parsing failed for an unknown reason.",
        "PARSER_FAILURE",
        input.absolutePath,
        error,
      );
    }
  }
}

export const xmlKnowledgeParser =
  new XMLKnowledgeParser();