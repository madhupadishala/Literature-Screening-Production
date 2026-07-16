import type { RAGMergedContext } from "@/lib/rag/rag-types";
import type { ReviewRecord } from "@/lib/review/review-types";

import type {
  EvidenceAIRuntime,
  EvidenceArticleInformation,
  EvidencePackage,
} from "./evidence-types";

interface BuildEvidencePackageInput {
  tenantId: string;

  articleId?: string;

  article: EvidenceArticleInformation;

  ragContext: RAGMergedContext;

  aiExecution: EvidenceAIRuntime;

  aiResult: unknown;

  review?: ReviewRecord;

  generatedBy?: string;
}

const evidencePackages = new Map<string, EvidencePackage>();

function simpleHash(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index++) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash).toString(16);
}

function createPackageId(
  tenantId: string,
  articleId?: string,
): string {
  return [
    tenantId,
    articleId ?? "article",
    Date.now(),
  ].join("-");
}

export class EvidencePackageGenerator {
  build(
    input: BuildEvidencePackageInput,
  ): EvidencePackage {
    const packageId = createPackageId(
      input.tenantId,
      input.articleId,
    );

    const packageHash = simpleHash(
      JSON.stringify({
        article: input.article,
        rag: input.ragContext.summary,
        ai: input.aiResult,
        review: input.review,
      }),
    );

    const evidencePackage: EvidencePackage = {
      metadata: {
        packageId,
        tenantId: input.tenantId,

        articleId: input.articleId,

        packageVersion: 1,

        packageHash,

        createdAt: new Date().toISOString(),

        generatedBy:
          input.generatedBy ??
          "ClinixAI Evidence Builder",

        status: input.review
          ? "reviewed"
          : "draft",
      },

      article: input.article,

      ragContext: input.ragContext,

      aiExecution: input.aiExecution,

      aiResult: input.aiResult,

      review: input.review,

      auditReferences: input.review
        ? [input.review.id]
        : [],

      notes: [],
    };

    evidencePackages.set(
      evidencePackage.metadata.packageId,
      evidencePackage,
    );

    return evidencePackage;
  }

  get(
    packageId: string,
  ): EvidencePackage | undefined {
    return evidencePackages.get(packageId);
  }

  list(
    tenantId: string,
  ): EvidencePackage[] {
    return Array.from(
      evidencePackages.values(),
    ).filter(
      (item) =>
        item.metadata.tenantId === tenantId,
    );
  }

  archive(
    packageId: string,
  ): boolean {
    const existing =
      evidencePackages.get(packageId);

    if (!existing) {
      return false;
    }

    evidencePackages.set(packageId, {
      ...existing,

      metadata: {
        ...existing.metadata,

        status: "archived",
      },
    });

    return true;
  }
}

export const evidencePackageGenerator =
  new EvidencePackageGenerator();