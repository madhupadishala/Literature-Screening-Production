import { createHash } from "node:crypto";

export const INTAKE_PARSER_KEY = "NEXUS_ZERO_COST_DOCUMENT_PARSER";
export const INTAKE_PARSER_VERSION = "1.0.0";

export interface ExtractedDocumentText {
  text: string;
  pageCount?: number;
  textSha256: string;
  parserKey: typeof INTAKE_PARSER_KEY;
  parserVersion: typeof INTAKE_PARSER_VERSION;
}

function normalizeText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hashText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function extractDocumentText(input: {
  bytes: Buffer;
  contentType: string;
}): Promise<ExtractedDocumentText> {
  let text = "";
  let pageCount: number | undefined;

  if (input.contentType === "text/plain") {
    text = input.bytes.toString("utf8");
  } else if (
    input.contentType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: input.bytes });
    text = result.value;
  } else if (input.contentType === "application/pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(input.bytes));
    const result = await extractText(pdf, { mergePages: true });
    pageCount = result.totalPages;
    text = Array.isArray(result.text) ? result.text.join("\n\n") : result.text;
  } else if (input.contentType === "application/msword") {
    throw new Error(
      "Legacy DOC binary text extraction is not supported by the zero-cost parser. Review the original source manually or provide DOCX/PDF/TXT.",
    );
  } else {
    throw new Error("Unsupported document content type for extraction.");
  }

  const normalized = normalizeText(text);
  if (!normalized) {
    throw new Error("No machine-readable text could be extracted from the source document.");
  }

  return {
    text: normalized,
    pageCount,
    textSha256: hashText(normalized),
    parserKey: INTAKE_PARSER_KEY,
    parserVersion: INTAKE_PARSER_VERSION,
  };
}
