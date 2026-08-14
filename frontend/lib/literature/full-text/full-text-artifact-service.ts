import "server-only";

import { createHash } from "node:crypto";
import { extractText, getDocumentProxy } from "unpdf";

const DEFAULT_MAX_PDF_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_PAGES = 250;
const DEFAULT_TIMEOUT_MS = 30_000;

export interface FullTextArtifact {
  source: "EuropePMC";
  pmcid: string;
  provenanceUrl: string;
  mediaType: "application/pdf";
  fileName: string;
  sizeBytes: number;
  sha256: string;
  retrievedAt: string;
  pageCount: number;
  extractedText: string;
  bytesBase64: string;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function fullTextEnabled(): boolean {
  return process.env.CLINIXAI_FULL_TEXT_FETCH_ENABLED === "true";
}

function validatePmcid(pmcid: string): string {
  const normalized = pmcid.trim().toUpperCase();
  if (!/^PMC\d+$/.test(normalized)) {
    throw new Error("Invalid PMCID.");
  }
  return normalized;
}

export async function resolveOpenAccessPmcPdf(
  pmcid: string | undefined,
): Promise<FullTextArtifact | undefined> {
  if (!pmcid || !fullTextEnabled()) return undefined;

  const normalizedPmcid = validatePmcid(pmcid);
  const provenanceUrl =
    `https://www.ebi.ac.uk/europepmc/webservices/rest/${normalizedPmcid}/fullTextPDF`;
  const timeoutMs = positiveInteger(
    process.env.CLINIXAI_FULL_TEXT_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
  );
  const maxBytes = positiveInteger(
    process.env.CLINIXAI_FULL_TEXT_MAX_BYTES,
    DEFAULT_MAX_PDF_BYTES,
  );
  const maxPages = positiveInteger(
    process.env.CLINIXAI_FULL_TEXT_MAX_PAGES,
    DEFAULT_MAX_PAGES,
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(provenanceUrl, {
      signal: controller.signal,
      headers: {
        Accept: "application/pdf",
        "User-Agent": process.env.NCBI_TOOL || "ClinixAI-Literature-Screening",
      },
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 404) return undefined;
  if (!response.ok) {
    throw new Error(
      `Europe PMC full-text retrieval failed for ${normalizedPmcid}: HTTP ${response.status}.`,
    );
  }

  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > maxBytes) {
    throw new Error(
      `Full-text PDF exceeds the configured ${maxBytes}-byte limit.`,
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) {
    throw new Error("Full-text PDF is empty or exceeds the configured size limit.");
  }

  const signature = new TextDecoder("ascii").decode(bytes.slice(0, 5));
  if (signature !== "%PDF-") {
    throw new Error("Full-text response is not a valid PDF document.");
  }

  const pdf = await getDocumentProxy(bytes, {
    maxImageSize: 16_777_216,
  });
  if (pdf.numPages > maxPages) {
    await pdf.destroy();
    throw new Error(
      `Full-text PDF has ${pdf.numPages} pages; configured maximum is ${maxPages}.`,
    );
  }

  try {
    const extracted = await extractText(pdf, { mergePages: true });
    const text = typeof extracted.text === "string"
      ? extracted.text.trim()
      : extracted.text.join("\n\n").trim();

    return {
      source: "EuropePMC",
      pmcid: normalizedPmcid,
      provenanceUrl,
      mediaType: "application/pdf",
      fileName: `${normalizedPmcid}.pdf`,
      sizeBytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      retrievedAt: new Date().toISOString(),
      pageCount: extracted.totalPages,
      extractedText: text,
      bytesBase64: Buffer.from(bytes).toString("base64"),
    };
  } finally {
    await pdf.destroy();
  }
}
