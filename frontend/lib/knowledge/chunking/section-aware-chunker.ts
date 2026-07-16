import "server-only";

import { createHash } from "node:crypto";

import type {
  NormalizedKnowledgeBlock,
  NormalizedKnowledgeDocument,
  NormalizedKnowledgeSection,
} from "@/lib/knowledge/document-intelligence/document-intelligence-types";

import { knowledgeChunkValidator } from "./knowledge-chunk-validator";
import { knowledgeTokenCounter } from "./knowledge-token-counter";

import type {
  KnowledgeChunk,
  KnowledgeChunkCitation,
  KnowledgeChunkingOptions,
  KnowledgeChunkingRequest,
  KnowledgeChunkingResult,
} from "./knowledge-chunk-types";

const CHUNKER_NAME = "ClinixAI Section-Aware Knowledge Chunker";
const CHUNKER_VERSION = "1.0.0";

const DEFAULT_OPTIONS: KnowledgeChunkingOptions = {
  maxTokens: 800,
  targetTokens: 600,
  overlapTokens: 80,
  minimumTokens: 20,
  tokenizer: "cl100k_base",
};

interface ChunkUnit {
  text: string;
  blockIds: string[];
  pageStart?: number;
  pageEnd?: number;
}

function normalizeText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function createContentHash(value: string) {
  return createHash("sha256")
    .update(normalizeText(value))
    .digest("hex");
}

function createChunkId(
  documentId: string,
  sectionId: string | undefined,
  index: number,
  contentHash: string,
) {
  return [
    documentId,
    sectionId ?? "document",
    index,
    contentHash.slice(0, 16),
  ].join("_");
}

function resolvePages(blocks: NormalizedKnowledgeBlock[]) {
  const pages = blocks
    .map((block) => block.position.pageNumber)
    .filter(
      (page): page is number =>
        typeof page === "number",
    );

  if (pages.length === 0) {
    return {
      pageStart: undefined,
      pageEnd: undefined,
    };
  }

  return {
    pageStart: Math.min(...pages),
    pageEnd: Math.max(...pages),
  };
}

function splitIntoSentences(text: string) {
  const matches = text.match(
    /[^.!?。！？]+(?:[.!?。！？]+|$)/g,
  );

  return (matches ?? [text])
    .map((sentence) => normalizeText(sentence))
    .filter(Boolean);
}

function splitOversizedText(
  text: string,
  maxTokens: number,
): string[] {
  if (knowledgeTokenCounter.fits(text, maxTokens)) {
    return [text];
  }

  const sentences = splitIntoSentences(text);
  const segments: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const candidate = normalizeText(
      [current, sentence].filter(Boolean).join(" "),
    );

    if (
      current &&
      !knowledgeTokenCounter.fits(
        candidate,
        maxTokens,
      )
    ) {
      segments.push(current);
      current = sentence;
      continue;
    }

    if (
      !current &&
      !knowledgeTokenCounter.fits(
        sentence,
        maxTokens,
      )
    ) {
      const words = sentence.split(/\s+/);
      let wordSegment = "";

      for (const word of words) {
        const wordCandidate = normalizeText(
          [wordSegment, word]
            .filter(Boolean)
            .join(" "),
        );

        if (
          wordSegment &&
          !knowledgeTokenCounter.fits(
            wordCandidate,
            maxTokens,
          )
        ) {
          segments.push(wordSegment);
          wordSegment = word;
        } else {
          wordSegment = wordCandidate;
        }
      }

      if (wordSegment) {
        segments.push(wordSegment);
      }

      current = "";
      continue;
    }

    current = candidate;
  }

  if (current) {
    segments.push(current);
  }

  return segments.filter(Boolean);
}

function createUnits(
  sectionBlocks: NormalizedKnowledgeBlock[],
  maxTokens: number,
): ChunkUnit[] {
  const units: ChunkUnit[] = [];

  for (const block of sectionBlocks) {
    const segments = splitOversizedText(
      block.normalizedText,
      maxTokens,
    );

    for (const segment of segments) {
      units.push({
        text: segment,
        blockIds: [block.id],
        pageStart: block.position.pageNumber,
        pageEnd: block.position.pageNumber,
      });
    }
  }

  return units;
}

function createCitation(
  document: NormalizedKnowledgeDocument,
  section: NormalizedKnowledgeSection | undefined,
  pageStart?: number,
  pageEnd?: number,
): KnowledgeChunkCitation {
  const parts = [document.title];

  if (section?.sectionNumber) {
    parts.push(`Section ${section.sectionNumber}`);
  } else if (section?.title) {
    parts.push(section.title);
  }

  if (
    typeof pageStart === "number" &&
    typeof pageEnd === "number"
  ) {
    parts.push(
      pageStart === pageEnd
        ? `Page ${pageStart}`
        : `Pages ${pageStart}-${pageEnd}`,
    );
  }

  return {
    documentId: document.documentId,
    documentTitle: document.title,
    relativePath: document.relativePath,
    sectionId: section?.id,
    sectionTitle: section?.title,
    sectionNumber: section?.sectionNumber,
    pageStart,
    pageEnd,
    citationText: parts.join(", "),
  };
}

function mergePageRange(
  currentStart: number | undefined,
  currentEnd: number | undefined,
  unit: ChunkUnit,
) {
  const available = [
    currentStart,
    currentEnd,
    unit.pageStart,
    unit.pageEnd,
  ].filter(
    (value): value is number =>
      typeof value === "number",
  );

  if (available.length === 0) {
    return {
      pageStart: undefined,
      pageEnd: undefined,
    };
  }

  return {
    pageStart: Math.min(...available),
    pageEnd: Math.max(...available),
  };
}

function buildSectionChunks(
  document: NormalizedKnowledgeDocument,
  section: NormalizedKnowledgeSection,
  sectionBlocks: NormalizedKnowledgeBlock[],
  options: KnowledgeChunkingOptions,
  startingIndex: number,
  request: KnowledgeChunkingRequest,
): KnowledgeChunk[] {
  const units = createUnits(
    sectionBlocks,
    options.maxTokens,
  );

  const chunks: KnowledgeChunk[] = [];
  let currentUnits: ChunkUnit[] = [];
  let currentText = "";
  let currentTokens = 0;
  let pageStart: number | undefined;
  let pageEnd: number | undefined;

  function flush() {
    const text = normalizeText(currentText);

    if (!text) {
      currentUnits = [];
      currentText = "";
      currentTokens = 0;
      pageStart = undefined;
      pageEnd = undefined;
      return;
    }

    const contentHash = createContentHash(text);
    const index = startingIndex + chunks.length;

    chunks.push({
      id: createChunkId(
        document.documentId,
        section.id,
        index,
        contentHash,
      ),
      documentId: document.documentId,
      sectionId: section.id,
      index,
      text,
      tokenCount: knowledgeTokenCounter.count(text),
      contentHash,
      blockIds: Array.from(
        new Set(
          currentUnits.flatMap(
            (unit) => unit.blockIds,
          ),
        ),
      ),
      citation: createCitation(
        document,
        section,
        pageStart,
        pageEnd,
      ),
      metadata: {
        tenantId: request.context.tenantId,
        layer: request.context.layer,
        category: request.context.category,
        authority: request.context.authority,
        jurisdiction:
          request.context.jurisdiction,
        documentVersion:
          request.context.documentVersion,
        effectiveDate:
          request.context.effectiveDate,
        language: document.language,
        sourceFormat: document.format,
        parserName: document.parserName,
        parserVersion: document.parserVersion,
        normalizerName: document.normalizerName,
        normalizerVersion:
          document.normalizerVersion,
      },
      createdAt: new Date().toISOString(),
    });

    const overlapUnits: ChunkUnit[] = [];
    let overlapTokens = 0;

    for (
      let index = currentUnits.length - 1;
      index >= 0;
      index -= 1
    ) {
      const unit = currentUnits[index];
      const unitTokens =
        knowledgeTokenCounter.count(unit.text);

      if (
        overlapUnits.length > 0 &&
        overlapTokens + unitTokens >
          options.overlapTokens
      ) {
        break;
      }

      overlapUnits.unshift(unit);
      overlapTokens += unitTokens;
    }

    currentUnits = overlapUnits;
    currentText = overlapUnits
      .map((unit) => unit.text)
      .join("\n\n");
    currentTokens =
      knowledgeTokenCounter.count(currentText);

    const overlapPages = resolvePages(
      sectionBlocks.filter((block) =>
        overlapUnits.some((unit) =>
          unit.blockIds.includes(block.id),
        ),
      ),
    );

    pageStart = overlapPages.pageStart;
    pageEnd = overlapPages.pageEnd;
  }

  for (const unit of units) {
    const candidateText = normalizeText(
      [currentText, unit.text]
        .filter(Boolean)
        .join("\n\n"),
    );

    const candidateTokens =
      knowledgeTokenCounter.count(candidateText);

    if (
      currentUnits.length > 0 &&
      candidateTokens > options.maxTokens
    ) {
      flush();
    }

    currentUnits.push(unit);

    currentText = normalizeText(
      [currentText, unit.text]
        .filter(Boolean)
        .join("\n\n"),
    );

    currentTokens =
      knowledgeTokenCounter.count(currentText);

    const pages = mergePageRange(
      pageStart,
      pageEnd,
      unit,
    );

    pageStart = pages.pageStart;
    pageEnd = pages.pageEnd;

    if (currentTokens >= options.targetTokens) {
      flush();
    }
  }

  if (currentUnits.length > 0) {
    flush();
  }

  return chunks;
}

export class SectionAwareChunker {
  chunk(
    request: KnowledgeChunkingRequest,
  ): KnowledgeChunkingResult {
    const options: KnowledgeChunkingOptions = {
      ...DEFAULT_OPTIONS,
      ...(request.options ?? {}),
      tokenizer: "cl100k_base",
    };

    if (
      options.minimumTokens < 1 ||
      options.targetTokens < options.minimumTokens ||
      options.maxTokens < options.targetTokens ||
      options.overlapTokens < 0 ||
      options.overlapTokens >= options.maxTokens
    ) {
      throw new Error(
        "Invalid knowledge chunking configuration.",
      );
    }

    const chunks: KnowledgeChunk[] = [];

    for (const section of request.document.sections) {
      const sectionBlocks =
        request.document.blocks.filter(
          (block) =>
            block.sectionId === section.id,
        );

      if (sectionBlocks.length === 0) {
        continue;
      }

      chunks.push(
        ...buildSectionChunks(
          request.document,
          section,
          sectionBlocks,
          options,
          chunks.length,
          request,
        ),
      );
    }

    if (
      chunks.length === 0 &&
      request.document.blocks.length > 0
    ) {
      const fallbackSection: NormalizedKnowledgeSection = {
        id: `${request.document.documentId}_section_document`,
        documentId: request.document.documentId,
        title: "Document Content",
        level: 1,
        order: 0,
        blockIds: request.document.blocks.map(
          (block) => block.id,
        ),
        text: request.document.fullText,
      };

      chunks.push(
        ...buildSectionChunks(
          request.document,
          fallbackSection,
          request.document.blocks,
          options,
          0,
          request,
        ),
      );
    }

    const validation =
      knowledgeChunkValidator.validate(
        chunks,
        options,
      );

    return {
      documentId: request.document.documentId,
      documentTitle: request.document.title,
      chunks,
      sourceSections:
        request.document.sections,
      totalTokens: chunks.reduce(
        (total, chunk) =>
          total + chunk.tokenCount,
        0,
      ),
      validation,
      chunkedAt: new Date().toISOString(),
      chunkerName: CHUNKER_NAME,
      chunkerVersion: CHUNKER_VERSION,
    };
  }
}

export const sectionAwareChunker =
  new SectionAwareChunker();