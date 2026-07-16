import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  read,
  utils,
  type WorkBook,
  type WorkSheet,
} from "xlsx";

import { BaseKnowledgeParser } from "./knowledge-parser";
import {
  KnowledgeParserError,
  type KnowledgeDocumentBlock,
  type KnowledgeParserInput,
  type KnowledgeParserSupport,
  type ParsedKnowledgeDocument,
} from "./parser-types";

const PARSER_NAME = "ClinixAI SheetJS Knowledge Parser";
const PARSER_VERSION = "1.0.0";

function createDocumentId(input: KnowledgeParserInput) {
  const identity = [
    input.relativePath,
    input.checksum ?? "",
    input.fileName,
  ].join("|");

  return `knowledge_xlsx_${createHash("sha256")
    .update(identity)
    .digest("hex")
    .slice(0, 24)}`;
}

function normalizeCell(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
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

function isEmptyRow(row: unknown[]) {
  return row.every(
    (cell) => normalizeCell(cell).length === 0,
  );
}

function rowToText(row: unknown[]) {
  return row
    .map(normalizeCell)
    .join(" | ")
    .trim();
}

function sheetToRows(sheet: WorkSheet) {
  const rows = utils.sheet_to_json<unknown[]>(
    sheet,
    {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    },
  );

  return rows.filter(
    (row): row is unknown[] =>
      Array.isArray(row) && !isEmptyRow(row),
  );
}

function readWorkbookTitle(
  workbook: WorkBook,
  fallback: string,
) {
  const properties = workbook.Props;

  if (
    properties?.Title &&
    properties.Title.trim()
  ) {
    return properties.Title.trim();
  }

  return fallback;
}

export class XLSXKnowledgeParser extends BaseKnowledgeParser {
  readonly name = PARSER_NAME;
  readonly version = PARSER_VERSION;

  readonly support: KnowledgeParserSupport = {
    extensions: [".xlsx", ".xls", ".xlsm", ".xlsb"],
    formats: ["xlsx"],
  };

  async parse(
    input: KnowledgeParserInput,
  ): Promise<ParsedKnowledgeDocument> {
    if (!this.supports(input.extension)) {
      throw new KnowledgeParserError(
        `The spreadsheet parser does not support ${input.extension}.`,
        "UNSUPPORTED_FORMAT",
        input.absolutePath,
      );
    }

    try {
      const buffer = await readFile(input.absolutePath);

      if (buffer.length === 0) {
        throw new KnowledgeParserError(
          "The spreadsheet file is empty.",
          "EMPTY_DOCUMENT",
          input.absolutePath,
        );
      }

      const workbook = read(buffer, {
        type: "buffer",
        cellDates: true,
        cellFormula: false,
        cellHTML: false,
        cellNF: false,
        dense: true,
      });

      if (workbook.SheetNames.length === 0) {
        throw new KnowledgeParserError(
          "The workbook does not contain any worksheets.",
          "EMPTY_DOCUMENT",
          input.absolutePath,
        );
      }

      const documentId = createDocumentId(input);
      const blocks: KnowledgeDocumentBlock[] = [];
      const warnings: string[] = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];

        if (!sheet) {
          warnings.push(
            `Worksheet "${sheetName}" could not be opened.`,
          );
          continue;
        }

        const rows = sheetToRows(sheet);

        if (rows.length === 0) {
          warnings.push(
            `Worksheet "${sheetName}" contains no readable rows.`,
          );
          continue;
        }

        blocks.push({
          id: `${documentId}_block_${blocks.length}`,
          type: "heading",
          text: sheetName,
          level: 1,
          position: {
            order: blocks.length,
          },
          metadata: {
            sheetName,
            role: "sheet_heading",
          },
        });

        const firstRow = rows[0] ?? [];

        if (firstRow.length > 0) {
          blocks.push({
            id: `${documentId}_block_${blocks.length}`,
            type: "heading",
            text: rowToText(firstRow),
            level: 2,
            position: {
              order: blocks.length,
            },
            metadata: {
              sheetName,
              rowNumber: 1,
              role: "header",
              columnCount: firstRow.length,
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
              sheetName,
              rowNumber: rowIndex + 2,
              columnCount: row.length,
            },
          });
        });
      }

      const fullText = blocks
        .map((block) => block.text)
        .filter(Boolean)
        .join("\n")
        .trim();

      if (!fullText) {
        throw new KnowledgeParserError(
          "The workbook produced no normalized document content.",
          "EMPTY_DOCUMENT",
          input.absolutePath,
        );
      }

      const fallbackTitle =
        path.parse(input.fileName).name;

      return {
        documentId,
        sourcePath: input.absolutePath,
        relativePath: input.relativePath,
        fileName: input.fileName,
        format: "xlsx",
        title: readWorkbookTitle(
          workbook,
          fallbackTitle,
        ),
        language: "en",
        pageCount: workbook.SheetNames.length,
        pages: workbook.SheetNames.map(
          (sheetName, pageIndex) => {
            const pageBlocks = blocks.filter(
              (block) =>
                block.metadata?.sheetName ===
                sheetName,
            );

            return {
              pageNumber: pageIndex + 1,
              text: pageBlocks
                .map((block) => block.text)
                .join("\n"),
              blocks: pageBlocks,
            };
          },
        ),
        blocks,
        fullText,
        metadata: {
          checksum: input.checksum ?? null,
          tenantId: input.tenantId ?? null,
          sheetCount: workbook.SheetNames.length,
          sheetNames:
            workbook.SheetNames.join(", "),
          author:
            workbook.Props?.Author ?? null,
          company:
            workbook.Props?.Company ?? null,
          subject:
            workbook.Props?.Subject ?? null,
          createdDate:
            workbook.Props?.CreatedDate
              ? workbook.Props.CreatedDate.toISOString()
              : null,
          modifiedDate:
            workbook.Props?.ModifiedDate
              ? workbook.Props.ModifiedDate.toISOString()
              : null,
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
          ? `Spreadsheet parsing failed: ${error.message}`
          : "Spreadsheet parsing failed for an unknown reason.",
        "PARSER_FAILURE",
        input.absolutePath,
        error,
      );
    }
  }
}

export const xlsxKnowledgeParser =
  new XLSXKnowledgeParser();