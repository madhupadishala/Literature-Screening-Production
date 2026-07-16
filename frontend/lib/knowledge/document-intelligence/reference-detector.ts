import type { KnowledgeDocumentBlock } from "@/lib/knowledge/parsers/parser-types";

import type { ReferenceDetectionResult } from "./document-intelligence-types";

const DOI_PATTERN = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/i;
const PMID_PATTERN = /\bPMID\s*:?\s*\d{6,10}\b/i;
const URL_PATTERN = /\bhttps?:\/\/\S+/i;
const YEAR_PATTERN = /\b(?:19|20)\d{2}\b/;

function normalizeText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function looksLikeNumberedCitation(text: string) {
  return (
    /^\[\d+(?:[-,]\d+)*\]/.test(text) ||
    /^\(\d+(?:[-,]\d+)*\)/.test(text) ||
    /^\d+\.\s+[A-Z]/.test(text)
  );
}

function looksLikeBibliographicEntry(text: string) {
  const hasYear = YEAR_PATTERN.test(text);

  const hasJournalPattern =
    /\b(?:vol\.?|volume|issue|pp?\.?|journal|doi|et al\.)\b/i.test(
      text,
    );

  const hasAuthorPattern =
    /^[A-Z][A-Za-z'-]+(?:,\s*[A-Z](?:\.[A-Z])?\.?)+(?:\s+et al\.)?/i.test(
      text,
    );

  return hasYear && (hasJournalPattern || hasAuthorPattern);
}

export class ReferenceDetector {
  detect(block: KnowledgeDocumentBlock): ReferenceDetectionResult {
    const text = normalizeText(block.text);

    if (!text) {
      return {
        isReference: false,
        confidence: 0,
        reason: "Empty block",
      };
    }

    if (block.type === "reference") {
      return {
        isReference: true,
        confidence: 1,
        reason: "Parser identified reference",
      };
    }

    if (/^(references?|bibliography)$/i.test(text)) {
      return {
        isReference: true,
        confidence: 0.99,
        reason: "Reference section heading",
      };
    }

    if (DOI_PATTERN.test(text)) {
      return {
        isReference: true,
        confidence: 0.96,
        reason: "DOI detected",
      };
    }

    if (PMID_PATTERN.test(text)) {
      return {
        isReference: true,
        confidence: 0.95,
        reason: "PMID detected",
      };
    }

    if (looksLikeNumberedCitation(text)) {
      return {
        isReference: true,
        confidence: 0.9,
        reason: "Numbered citation format",
      };
    }

    if (looksLikeBibliographicEntry(text)) {
      return {
        isReference: true,
        confidence: 0.85,
        reason: "Bibliographic structure detected",
      };
    }

    if (URL_PATTERN.test(text) && YEAR_PATTERN.test(text)) {
      return {
        isReference: true,
        confidence: 0.78,
        reason: "URL and publication year detected",
      };
    }

    return {
      isReference: false,
      confidence: 0.1,
      reason: "No reference indicators detected",
    };
  }
}

export const referenceDetector = new ReferenceDetector();