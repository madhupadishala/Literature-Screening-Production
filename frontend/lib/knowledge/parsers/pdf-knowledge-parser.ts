import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { BaseKnowledgeParser } from "./knowledge-parser";
import {
  KnowledgeParserError,
  type KnowledgeDocumentBlock,
  type KnowledgeDocumentPage,
  type KnowledgeParserInput,
  type KnowledgeParserSupport,
  type ParsedKnowledgeDocument,
} from "./parser-types";

interface PDFTextItem {
  str: string;
  width: number;
  height: number;
  transform: number[];
  hasEOL?: boolean;
}

interface PositionedPDFText {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PDFLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PDFDocumentMetadata {
  info?: Record<string, unknown>;
  metadata?: {
    get(name: string): unknown;
  } | null;
}

interface PDFPageProxy {
  getViewport(options: {
    scale: number;
  }): {
    width: number;
    height: number;
  };

  getTextContent(): Promise<{
    items: unknown[];
  }>;
}

interface PDFDocumentProxy {
  numPages: number;
  getMetadata(): Promise<PDFDocumentMetadata>;
  getPage(pageNumber: number): Promise<PDFPageProxy>;
}

interface PDFLoadingTask {
  promise: Promise<PDFDocumentProxy>;
  destroy(): Promise<void>;
}

const PARSER_NAME = "ClinixAI PDF.js Knowledge Parser";
const PARSER_VERSION = "1.0.0";
const LINE_TOLERANCE = 3;

function createDocumentId(input: KnowledgeParserInput) {
  const identity = [
    input.relativePath,
    input.checksum ?? "",
    input.fileName,
  ].join("|");

  return `knowledge_pdf_${createHash("sha256")
    .update(identity)
    .digest("hex")
    .slice(0, 24)}`;
}

function createBlockId(
  documentId: string,
  pageNumber: number,
  order: number,
) {
  return `${documentId}_page_${pageNumber}_block_${order}`;
}

function normalizeWhitespace(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function isPDFTextItem(value: unknown): value is PDFTextItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Partial<PDFTextItem>;

  return (
    typeof item.str === "string" &&
    typeof item.width === "number" &&
    typeof item.height === "number" &&
    Array.isArray(item.transform) &&
    item.transform.length >= 6
  );
}

function groupTextItemsIntoLines(
  items: PositionedPDFText[],
): PDFLine[] {
  const sortedItems = [...items].sort((left, right) => {
    const verticalDifference = right.y - left.y;

    if (Math.abs(verticalDifference) > LINE_TOLERANCE) {
      return verticalDifference;
    }

    return left.x - right.x;
  });

  const lines: Array<{
    y: number;
    items: PositionedPDFText[];
  }> = [];

  for (const item of sortedItems) {
    const existingLine = lines.find(
      (line) => Math.abs(line.y - item.y) <= LINE_TOLERANCE,
    );

    if (existingLine) {
      existingLine.items.push(item);
      continue;
    }

    lines.push({
      y: item.y,
      items: [item],
    });
  }

  return lines
    .sort((left, right) => right.y - left.y)
    .map((line) => {
      const lineItems = line.items.sort(
        (left, right) => left.x - right.x,
      );

      const text = normalizeWhitespace(
        lineItems.map((item) => item.text).join(" "),
      );

      const minimumX = Math.min(
        ...lineItems.map((item) => item.x),
      );

      const maximumX = Math.max(
        ...lineItems.map((item) => item.x + item.width),
      );

      const height = Math.max(
        ...lineItems.map((item) => item.height),
      );

      return {
        text,
        x: minimumX,
        y: line.y,
        width: maximumX - minimumX,
        height,
      };
    })
    .filter((line) => line.text.length > 0);
}

function calculateMedian(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort(
    (left, right) => left - right,
  );

  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function resolveSectionNumber(text: string) {
  const match = text.match(
    /^((?:[A-Z]{1,5}\.)?\d+(?:\.\d+){0,6})[\s:.-]+/,
  );

  return match?.[1];
}

function looksLikeReference(text: string) {
  return (
    /^\[\d+\]/.test(text) ||
    /^\d+\.\s+[A-Z][a-z]+/.test(text) ||
    /^references?$/i.test(text) ||
    /^bibliography$/i.test(text)
  );
}

function looksLikeListItem(text: string) {
  return (
    /^[-•▪◦]\s+/.test(text) ||
    /^\d+[.)]\s+/.test(text) ||
    /^[a-zA-Z][.)]\s+/.test(text)
  );
}

function resolveBlockType(
  line: PDFLine,
  medianHeight: number,
): {
  type: KnowledgeDocumentBlock["type"];
  level?: number;
} {
  const text = line.text;
  const sectionNumber = resolveSectionNumber(text);

  if (looksLikeReference(text)) {
    return {
      type: "reference",
    };
  }

  if (looksLikeListItem(text)) {
    return {
      type: "list_item",
    };
  }

  if (
    sectionNumber ||
    (medianHeight > 0 &&
      line.height >= medianHeight * 1.35 &&
      text.length <= 180)
  ) {
    return {
      type: "heading",
      level:
        sectionNumber?.split(".").filter(Boolean).length ?? 1,
    };
  }

  return {
    type: "paragraph",
  };
}

function inferTitle(
  pages: KnowledgeDocumentPage[],
  fallbackFileName: string,
) {
  const firstPageHeading = pages[0]?.blocks.find(
    (block) =>
      block.type === "heading" &&
      block.text.trim().length > 3,
  );

  if (firstPageHeading) {
    return firstPageHeading.text;
  }

  return path.parse(fallbackFileName).name;
}

function readMetadataString(
  metadata: Record<string, unknown>,
  key: string,
) {
  const value = metadata[key];

  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

export class PDFKnowledgeParser extends BaseKnowledgeParser {
  readonly name = PARSER_NAME;
  readonly version = PARSER_VERSION;

  readonly support: KnowledgeParserSupport = {
    extensions: [".pdf"],
    formats: ["pdf"],
  };

  async parse(
    input: KnowledgeParserInput,
  ): Promise<ParsedKnowledgeDocument> {
    if (!this.supports(input.extension)) {
      throw new KnowledgeParserError(
        `The PDF parser does not support ${input.extension}.`,
        "UNSUPPORTED_FORMAT",
        input.absolutePath,
      );
    }

    let loadingTask: PDFLoadingTask | undefined;

    try {
      const buffer = await readFile(input.absolutePath);

      if (buffer.length === 0) {
        throw new KnowledgeParserError(
          "The PDF file is empty.",
          "EMPTY_DOCUMENT",
          input.absolutePath,
        );
      }

      const pdfjs = await import(
        "pdfjs-dist/legacy/build/pdf.mjs"
      );

      loadingTask = pdfjs.getDocument({
        data: new Uint8Array(buffer),
        useSystemFonts: true,
      }) as unknown as PDFLoadingTask;

      const pdfDocument = await loadingTask.promise;
      const documentId = createDocumentId(input);
      const pages: KnowledgeDocumentPage[] = [];
      const warnings: string[] = [];

      let metadataResult: PDFDocumentMetadata | undefined;

      try {
        metadataResult = await pdfDocument.getMetadata();
      } catch {
        warnings.push(
          "PDF metadata could not be extracted.",
        );
      }

      for (
        let pageNumber = 1;
        pageNumber <= pdfDocument.numPages;
        pageNumber += 1
      ) {
        const page = await pdfDocument.getPage(pageNumber);

        const viewport = page.getViewport({
          scale: 1,
        });

        const textContent = await page.getTextContent();

        const positionedItems = textContent.items
          .filter(isPDFTextItem)
          .map<PositionedPDFText>((item) => {
            const x = item.transform[4] ?? 0;
            const y = item.transform[5] ?? 0;

            const calculatedHeight =
              item.height ||
              Math.abs(item.transform[3] ?? 0);

            return {
              text: normalizeWhitespace(item.str),
              x,
              y,
              width: item.width,
              height: calculatedHeight,
            };
          })
          .filter((item) => item.text.length > 0);

        const lines =
          groupTextItemsIntoLines(positionedItems);

        const medianHeight = calculateMedian(
          lines
            .map((line) => line.height)
            .filter((height) => height > 0),
        );

        const blocks: KnowledgeDocumentBlock[] = lines.map(
          (line, order) => {
            const classification = resolveBlockType(
              line,
              medianHeight || line.height,
            );

            return {
              id: createBlockId(
                documentId,
                pageNumber,
                order,
              ),
              type: classification.type,
              text: line.text,
              level: classification.level,
              sectionNumber: resolveSectionNumber(
                line.text,
              ),
              position: {
                pageNumber,
                order,
                x: line.x,
                y: line.y,
                width: line.width,
                height: line.height,
              },
            };
          },
        );

        const pageText = blocks
          .map((block) => block.text)
          .join("\n")
          .trim();

        if (!pageText) {
          warnings.push(
            `Page ${pageNumber} contains no extractable digital text and may require OCR.`,
          );
        }

        pages.push({
          pageNumber,
          width: viewport.width,
          height: viewport.height,
          text: pageText,
          blocks,
        });
      }

      const allBlocks = pages.flatMap(
        (page) => page.blocks,
      );

      const fullText = pages
        .map((page) => page.text)
        .filter(Boolean)
        .join("\n\n")
        .trim();

      if (!fullText) {
        throw new KnowledgeParserError(
          "No digital text could be extracted from the PDF. OCR is required.",
          "EMPTY_DOCUMENT",
          input.absolutePath,
        );
      }

      const pdfInfo = metadataResult?.info ?? {};

      const metadataTitle = readMetadataString(
        pdfInfo,
        "Title",
      );

      const title =
        metadataTitle ??
        inferTitle(pages, input.fileName);

      return {
        documentId,
        sourcePath: input.absolutePath,
        relativePath: input.relativePath,
        fileName: input.fileName,
        format: "pdf",
        title,
        language: "en",
        pageCount: pages.length,
        pages,
        blocks: allBlocks,
        fullText,
        metadata: {
          checksum: input.checksum ?? null,
          tenantId: input.tenantId ?? null,
          pdfTitle: metadataTitle,
          author: readMetadataString(pdfInfo, "Author"),
          subject: readMetadataString(pdfInfo, "Subject"),
          creator: readMetadataString(pdfInfo, "Creator"),
          producer: readMetadataString(pdfInfo, "Producer"),
          pdfVersion: readMetadataString(
            pdfInfo,
            "PDFFormatVersion",
          ),
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
          ? `PDF parsing failed: ${error.message}`
          : "PDF parsing failed for an unknown reason.",
        "PARSER_FAILURE",
        input.absolutePath,
        error,
      );
    } finally {
      if (loadingTask) {
        await loadingTask.destroy().catch(() => undefined);
      }
    }
  }
}

export const pdfKnowledgeParser =
  new PDFKnowledgeParser();