import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import mammoth from "mammoth";
import { extractText } from "unpdf";
import type { ConfigurationResourceType } from "@/lib/configuration/types";

function normalizeHeader(value: unknown): string {
  return String(value || "")
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/[^a-zA-Z0-9]+(.)/g, (_match, chr: string) =>
      chr.toUpperCase(),
    )
    .replace(/^[A-Z]/, (chr) => chr.toLowerCase());
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (character === "," && !quoted) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current.trim());
  return values;
}

function parseCsv(content: string): Record<string, unknown>[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ""]),
    );
  });
}

async function parseExcel(
  absolutePath: string,
): Promise<Record<string, unknown>[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(absolutePath);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const headerRow = worksheet.getRow(1);
  const rawHeaders = Array.isArray(headerRow.values)
    ? headerRow.values.slice(1)
    : Object.values(headerRow.values);
  const headers = rawHeaders.map((value) => normalizeHeader(value));

  const records: Record<string, unknown>[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const values = Array.isArray(row.values)
      ? row.values.slice(1)
      : Object.values(row.values);
    const record = Object.fromEntries(
      headers.map((header, index) => {
        const cell = values[index];
        const value =
          cell && typeof cell === "object" && "text" in cell
            ? String((cell as { text: unknown }).text)
            : cell ?? "";
        return [header, value];
      }),
    );

    if (Object.values(record).some((value) => String(value).trim())) {
      records.push(record);
    }
  });

  return records;
}

function normalizeRecordPayload(
  resourceType: ConfigurationResourceType,
  records: Record<string, unknown>[],
): Record<string, unknown> {
  return {
    resourceType,
    recordCount: records.length,
    records,
    importedAt: new Date().toISOString(),
  };
}

async function parseGuideline(
  absolutePath: string,
  extension: string,
): Promise<Record<string, unknown>> {
  if (extension === ".txt" || extension === ".md") {
    const content = await readFile(absolutePath, "utf8");
    return {
      documentType: "client_guideline",
      content,
      extractionMethod: "plain_text",
    };
  }

  if (extension === ".docx") {
    const result = await mammoth.extractRawText({ path: absolutePath });
    return {
      documentType: "client_guideline",
      content: result.value,
      extractionMethod: "mammoth_docx",
      extractionMessages: result.messages,
    };
  }

  if (extension === ".pdf") {
    const buffer = await readFile(absolutePath);
    const result = await extractText(new Uint8Array(buffer), {
      mergePages: true,
    });
    return {
      documentType: "client_guideline",
      content: result.text,
      pageCount: result.totalPages,
      extractionMethod: "unpdf",
    };
  }

  throw new Error(
    "Client Guidelines support PDF, DOCX, TXT, and Markdown files.",
  );
}

export async function parseConfigurationUpload(input: {
  resourceType: ConfigurationResourceType;
  absolutePath: string;
  originalFilename: string;
}): Promise<unknown> {
  const extension = path.extname(input.originalFilename).toLowerCase();

  if (input.resourceType === "CLIENT_GUIDELINE") {
    return parseGuideline(input.absolutePath, extension);
  }

  if (extension === ".json") {
    const content = await readFile(input.absolutePath, "utf8");
    return JSON.parse(content);
  }

  if (extension === ".csv") {
    const content = await readFile(input.absolutePath, "utf8");
    return normalizeRecordPayload(
      input.resourceType,
      parseCsv(content),
    );
  }

  if (extension === ".xlsx") {
    const records = await parseExcel(input.absolutePath);
    return normalizeRecordPayload(input.resourceType, records);
  }

  throw new Error(
    `${input.resourceType} supports JSON, CSV, and XLSX uploads.`,
  );
}
