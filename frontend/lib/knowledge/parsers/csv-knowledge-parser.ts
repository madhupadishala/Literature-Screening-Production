import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import Papa from "papaparse";

import { BaseKnowledgeParser } from "./knowledge-parser";
import {
  KnowledgeParserError,
  type KnowledgeDocumentBlock,
  type KnowledgeParserInput,
  type KnowledgeParserSupport,
  type ParsedKnowledgeDocument,
} from "./parser-types";

const PARSER_NAME = "ClinixAI Papa Parse CSV Knowledge Parser";
const PARSER_VERSION = "1.0.0";

function createDocumentId(input: KnowledgeParserInput) {
  const identity = [
    input.relativePath,
    input.checksum ?? "",
    input.fileName,
  ].join("|");

  return `knowledge_csv_${createHash("sha256")
    .update(identity)
    .digest("hex")
    .slice(0, 24)}`;
}

function normalizeCell(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .trim();
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  return JSON.stringify(value);
}

function rowToText(row: unknown[]) {
  return row
    .map(normalizeCell)
    .join(" | ")
    .trim();
}

function isEmptyRow(row: unknown[]) {
  return row.every(
    (cell) => normalizeCell(cell).length === 0,
  );
}

export class CSVKnowledgeParser extends BaseKnowledgeParser {
  readonly name = PARSER_NAME;
  readonly version = PARSER_VERSION;

  readonly support: KnowledgeParserSupport = {
    extensions: [".csv", ".tsv"],
    formats: ["csv"],
  };

  async parse(
    input: KnowledgeParserInput,
  ): Promise<ParsedKnowledgeDocument> {
    if (!this.supports(input.extension)) {
      throw new KnowledgeParserError(
        `The CSV parser does not support ${input.extension}.`,
        "UNSUPPORTED_FORMAT",
        input.absolutePath,
      );
    }

    try {
      const raw = await readFile(
        input.absolutePath,
        "utf8",
      );

      if (!raw.trim()) {
        throw new KnowledgeParserError(
          "The delimited document is empty.",
          "EMPTY_DOCUMENT",
          input.absolutePath,
        );
      }

      const delimiter =
        input.extension.toLowerCase() === ".tsv"
          ? "\t"
          : undefined;

      const result = Papa.parse<unknown[]>(raw, {
        delimiter,
        skipEmptyLines: "greedy",
        dynamicTyping: false,
      });

      const rows = result.data.filter(
        (row): row is unknown[] =>
          Array.isArray(row) && !isEmptyRow(row),
      );

      if (rows.length === 0) {
        throw new KnowledgeParserError(
          "No readable rows were extracted.",
          "EMPTY_DOCUMENT",
          input.absolutePath,
        );
      }

      const documentId = createDocumentId(input);
      const blocks: KnowledgeDocumentBlock[] = [];

      const headerRow = rows[0] ?? [];
      const headerText = rowToText(headerRow);

      if (headerText) {
        blocks.push({
          id: `${documentId}_block_0`,
          type: "heading",
          text: headerText,
          level: 1,
          position: {
            order: 0,
          },
          metadata: {
            rowNumber: 1,
            role: "header",
            columnCount: headerRow.length,
          },
        });
      }

      rows.slice(1).forEach((row, rowIndex) => {
        const text = rowToText(row);

        if (!text) {
          return;
        }

        blocks.push({
          id: `${documentId}_block_${blocks.length}`,
          type: "table",
          text,
          position: {
            order: blocks.length,
          },
          metadata: {
            rowNumber: rowIndex + 2,
            columnCount: row.length,
          },
        });
      });

      const fullText = blocks
        .map((block) => block.text)
        .filter(Boolean)
        .join("\n")
        .trim();

      if (!fullText) {
        throw new KnowledgeParserError(
          "The CSV file produced no normalized content.",
          "EMPTY_DOCUMENT",
          input.absolutePath,
        );
      }

      const warnings = result.errors.map(
        (error) =>
          [
            error.code,
            error.message,
            typeof error.row === "number"
              ? `row ${error.row + 1}`
              : null,
          ]
            .filter(Boolean)
            .join(": "),
      );

      return {
        documentId,
        sourcePath: input.absolutePath,
        relativePath: input.relativePath,
        fileName: input.fileName,
        format: "csv",
        title: path.parse(input.fileName).name,
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
          delimiter:
            result.meta.delimiter ||
            delimiter ||
            null,
          rowCount: rows.length,
          columnCount: Math.max(
            ...rows.map((row) => row.length),
          ),
          fields:
            result.meta.fields?.join(", ") ?? null,
          truncated:
            result.meta.truncated ?? false,
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
          ? `CSV parsing failed: ${error.message}`
          : "CSV parsing failed for an unknown reason.",
        "PARSER_FAILURE",
        input.absolutePath,
        error,
      );
    }
  }
}

export const csvKnowledgeParser =
  new CSVKnowledgeParser();