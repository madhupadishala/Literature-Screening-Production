import { createHash } from "node:crypto";

import type { NormalizedKnowledgeBlock } from "./document-intelligence-types";
import type { NormalizedKnowledgeSection } from "./document-intelligence-types";

interface SectionStackItem {
  id: string;
  level: number;
}

function createSectionId(
  documentId: string,
  order: number,
  title: string,
) {
  const hash = createHash("sha256")
    .update(`${documentId}|${order}|${title}`)
    .digest("hex")
    .slice(0, 16);

  return `${documentId}_section_${hash}`;
}

function resolvePageRange(blocks: NormalizedKnowledgeBlock[]) {
  const pages = blocks
    .map((block) => block.position.pageNumber)
    .filter((page): page is number => typeof page === "number");

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

export class SectionBuilder {
  build(
    documentId: string,
    blocks: NormalizedKnowledgeBlock[],
  ): NormalizedKnowledgeSection[] {
    const sections: NormalizedKnowledgeSection[] = [];
    const stack: SectionStackItem[] = [];

    let currentSection:
      | NormalizedKnowledgeSection
      | undefined;

    for (const block of blocks) {
      if (block.type === "heading") {
        const level = Math.max(1, Math.min(block.level ?? 1, 6));

        while (
          stack.length > 0 &&
          stack[stack.length - 1].level >= level
        ) {
          stack.pop();
        }

        const sectionId = createSectionId(
          documentId,
          sections.length,
          block.normalizedText,
        );

        currentSection = {
          id: sectionId,
          documentId,
          title: block.normalizedText,
          sectionNumber: block.sectionNumber,
          level,
          order: sections.length,
          parentSectionId:
            stack.length > 0
              ? stack[stack.length - 1].id
              : undefined,
          blockIds: [block.id],
          text: block.normalizedText,
        };

        block.sectionId = sectionId;
        block.parentHeadingId = block.id;

        sections.push(currentSection);

        stack.push({
          id: sectionId,
          level,
        });

        continue;
      }

      if (!currentSection) {
        const sectionId = createSectionId(
          documentId,
          sections.length,
          "Document Content",
        );

        currentSection = {
          id: sectionId,
          documentId,
          title: "Document Content",
          level: 1,
          order: sections.length,
          blockIds: [],
          text: "",
        };

        sections.push(currentSection);

        stack.push({
          id: sectionId,
          level: 1,
        });
      }

      block.sectionId = currentSection.id;
      block.parentHeadingId =
        currentSection.blockIds[0] ?? undefined;

      currentSection.blockIds.push(block.id);

      currentSection.text = [
        currentSection.text,
        block.normalizedText,
      ]
        .filter(Boolean)
        .join("\n");
    }

    for (const section of sections) {
      const sectionBlocks = blocks.filter(
        (block) => block.sectionId === section.id,
      );

      const pageRange = resolvePageRange(sectionBlocks);

      section.pageStart = pageRange.pageStart;
      section.pageEnd = pageRange.pageEnd;
      section.text = sectionBlocks
        .map((block) => block.normalizedText)
        .filter(Boolean)
        .join("\n")
        .trim();
    }

    return sections;
  }
}

export const sectionBuilder = new SectionBuilder();