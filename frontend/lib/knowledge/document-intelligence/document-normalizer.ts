import { headingDetector } from "./heading-detector";
import { referenceDetector } from "./reference-detector";
import { sectionBuilder } from "./section-builder";

import type {
  DocumentNormalizationResult,
  NormalizedKnowledgeBlock,
  NormalizedKnowledgeDocument,
} from "./document-intelligence-types";

import type {
  KnowledgeDocumentBlock,
  ParsedKnowledgeDocument,
} from "@/lib/knowledge/parsers/parser-types";

const NORMALIZER_NAME = "ClinixAI Universal Knowledge Normalizer";
const NORMALIZER_VERSION = "1.0.0";

function normalizeText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeBlock(
  block: KnowledgeDocumentBlock,
): NormalizedKnowledgeBlock {
  const normalizedText = normalizeText(block.text);
  const heading = headingDetector.detect({
    ...block,
    text: normalizedText,
  });

  const reference = referenceDetector.detect({
    ...block,
    text: normalizedText,
  });

  let type = block.type;
  let level = block.level;
  let sectionNumber = block.sectionNumber;

  if (heading.isHeading && heading.confidence >= 0.7) {
    type = "heading";
    level = heading.level;
    sectionNumber = heading.sectionNumber ?? sectionNumber;
  } else if (
    reference.isReference &&
    reference.confidence >= 0.75
  ) {
    type = "reference";
  }

  return {
    ...block,
    type,
    text: normalizedText,
    normalizedText,
    level,
    sectionNumber,
    headingConfidence: heading.confidence,
    referenceConfidence: reference.confidence,
    metadata: {
      ...(block.metadata ?? {}),
      headingDetectionReason: heading.reason,
      referenceDetectionReason: reference.reason,
    },
  };
}

export class DocumentNormalizer {
  normalize(
    source: ParsedKnowledgeDocument,
  ): DocumentNormalizationResult {
    const warnings = [...source.warnings];

    const blocks = source.blocks
      .map(normalizeBlock)
      .filter((block) => {
        if (block.normalizedText) {
          return true;
        }

        warnings.push(
          `Empty block removed during normalization: ${block.id}`,
        );

        return false;
      })
      .map((block, order) => ({
        ...block,
        position: {
          ...block.position,
          order,
        },
      }));

    if (blocks.length === 0) {
      throw new Error(
        `Document ${source.fileName} contains no usable blocks after normalization.`,
      );
    }

    const sections = sectionBuilder.build(
      source.documentId,
      blocks,
    );

    const fullText = blocks
      .map((block) => block.normalizedText)
      .filter(Boolean)
      .join("\n\n")
      .trim();

    if (!fullText) {
      throw new Error(
        `Document ${source.fileName} contains no usable text after normalization.`,
      );
    }

    const document: NormalizedKnowledgeDocument = {
      documentId: source.documentId,
      sourcePath: source.sourcePath,
      relativePath: source.relativePath,
      fileName: source.fileName,
      format: source.format,
      title: normalizeText(source.title),
      language: source.language,
      pageCount: source.pageCount,
      blocks,
      sections,
      fullText,
      metadata: {
        ...source.metadata,
        normalizedBlockCount: blocks.length,
        normalizedSectionCount: sections.length,
      },
      warnings,
      parsedAt: source.parsedAt,
      normalizedAt: new Date().toISOString(),
      parserName: source.parserName,
      parserVersion: source.parserVersion,
      normalizerName: NORMALIZER_NAME,
      normalizerVersion: NORMALIZER_VERSION,
    };

    return {
      source,
      document,
    };
  }
}

export const documentNormalizer = new DocumentNormalizer();