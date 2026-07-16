import { readFile } from "node:fs/promises";

import type {
  DiscoveredKnowledgeFile,
  ReadKnowledgeContent,
} from "./knowledge-ingestion-types";

const SUPPORTED_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".html",
  ".htm",
  ".xml",
  ".json",
  ".csv",
  ".tsv",
]);

function decodeEntities(value: string) {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'");
}

function removeMarkup(value: string) {
  return decodeEntities(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\/(p|div|section|article|h[1-6]|li|tr)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
}

function normalizeText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function serializeJson(value: unknown, depth = 0): string {
  if (depth > 20) {
    return "";
  }

  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => serializeJson(item, depth + 1))
      .filter(Boolean)
      .join("\n");
  }

  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, item]) => {
        const serialized = serializeJson(item, depth + 1);
        return serialized ? `${key}: ${serialized}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

export function isSupportedKnowledgeExtension(extension: string) {
  return SUPPORTED_EXTENSIONS.has(extension.toLowerCase());
}

export async function readKnowledgeContent(
  file: DiscoveredKnowledgeFile,
): Promise<ReadKnowledgeContent> {
  if (!isSupportedKnowledgeExtension(file.extension)) {
    throw new Error(`Unsupported knowledge file extension: ${file.extension}`);
  }

  const raw = await readFile(file.absolutePath, "utf8");
  const warnings: string[] = [];
  let text = raw;

  if (file.extension === ".html" || file.extension === ".htm") {
    text = removeMarkup(raw);
  }

  if (file.extension === ".xml") {
    text = removeMarkup(raw);
  }

  if (file.extension === ".json") {
    try {
      text = serializeJson(JSON.parse(raw) as unknown);
    } catch {
      warnings.push("JSON parsing failed. Raw text was retained.");
      text = raw;
    }
  }

  text = normalizeText(text);

  if (!text) {
    warnings.push("No readable text was extracted from the file.");
  }

  return {
    text,
    detectedFormat: file.extension.replace(".", "") || "unknown",
    warnings,
  };
}