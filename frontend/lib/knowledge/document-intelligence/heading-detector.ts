import type { KnowledgeDocumentBlock } from "@/lib/knowledge/parsers/parser-types";

import type { HeadingDetectionResult } from "./document-intelligence-types";

const NUMBERED_SECTION_PATTERN =
  /^((?:[A-Z]{1,8}\.)?\d+(?:\.\d+){0,8})(?:[\s:.)-]+)(.+)$/;

const ROMAN_SECTION_PATTERN =
  /^([IVXLCDM]{1,8})(?:[\s:.)-]+)(.+)$/i;

const APPENDIX_PATTERN =
  /^(appendix|annex|attachment|schedule)\s+([A-Z0-9.-]+)/i;

const COMMON_HEADINGS = new Set([
  "purpose",
  "scope",
  "definitions",
  "responsibilities",
  "procedure",
  "process",
  "references",
  "reference",
  "appendix",
  "annex",
  "background",
  "introduction",
  "objective",
  "objectives",
  "requirements",
  "roles and responsibilities",
  "training",
  "deviations",
  "records",
  "revision history",
  "effective date",
  "document history",
]);

function normalizeText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function extractSectionNumber(text: string) {
  const numberedMatch = text.match(NUMBERED_SECTION_PATTERN);

  if (numberedMatch) {
    return numberedMatch[1];
  }

  const romanMatch = text.match(ROMAN_SECTION_PATTERN);

  if (romanMatch) {
    return romanMatch[1].toUpperCase();
  }

  const appendixMatch = text.match(APPENDIX_PATTERN);

  if (appendixMatch) {
    return `${appendixMatch[1]} ${appendixMatch[2]}`;
  }

  return undefined;
}

function inferLevel(sectionNumber?: string) {
  if (!sectionNumber) {
    return 1;
  }

  const normalized = sectionNumber.toLowerCase();

  if (
    normalized.startsWith("appendix") ||
    normalized.startsWith("annex") ||
    normalized.startsWith("attachment") ||
    normalized.startsWith("schedule")
  ) {
    return 1;
  }

  if (/^[IVXLCDM]+$/i.test(sectionNumber)) {
    return 1;
  }

  return Math.min(sectionNumber.split(".").length, 6);
}

function isMostlyUppercase(text: string) {
  const letters = text.replace(/[^A-Za-z]/g, "");

  if (letters.length < 3) {
    return false;
  }

  const uppercaseLetters = letters.replace(/[^A-Z]/g, "");

  return uppercaseLetters.length / letters.length >= 0.8;
}

function looksLikeSentence(text: string) {
  return (
    text.length > 180 ||
    /[.!?]$/.test(text) ||
    text.split(/\s+/).length > 24
  );
}

export class HeadingDetector {
  detect(block: KnowledgeDocumentBlock): HeadingDetectionResult {
    const text = normalizeText(block.text);

    if (!text) {
      return {
        isHeading: false,
        confidence: 0,
        reason: "Empty block",
      };
    }

    if (block.type === "heading") {
      const sectionNumber =
        block.sectionNumber ?? extractSectionNumber(text);

      return {
        isHeading: true,
        level: block.level ?? inferLevel(sectionNumber),
        sectionNumber,
        confidence: 1,
        reason: "Parser identified heading",
      };
    }

    const sectionNumber = extractSectionNumber(text);

    if (sectionNumber && text.length <= 220) {
      return {
        isHeading: true,
        level: inferLevel(sectionNumber),
        sectionNumber,
        confidence: 0.96,
        reason: "Numbered or labelled section heading",
      };
    }

    const normalizedLower = text.toLowerCase().replace(/:$/, "");

    if (COMMON_HEADINGS.has(normalizedLower)) {
      return {
        isHeading: true,
        level: 1,
        confidence: 0.94,
        reason: "Recognized controlled-document heading",
      };
    }

    if (
      text.length <= 140 &&
      isMostlyUppercase(text) &&
      !looksLikeSentence(text)
    ) {
      return {
        isHeading: true,
        level: 1,
        confidence: 0.86,
        reason: "Short uppercase heading",
      };
    }

    const fontHeight = block.position.height;

    if (
      typeof fontHeight === "number" &&
      fontHeight >= 15 &&
      text.length <= 180 &&
      !looksLikeSentence(text)
    ) {
      return {
        isHeading: true,
        level: block.level ?? 2,
        confidence: 0.75,
        reason: "Large text block likely represents heading",
      };
    }

    return {
      isHeading: false,
      confidence: 0.1,
      reason: "No heading indicators detected",
    };
  }
}

export const headingDetector = new HeadingDetector();