import type {
  DuplicateCheckRequest,
  DuplicateCheckResponse,
  DuplicateMatch,
} from "./duplicate-types";

export class DuplicateEngine {
  check(
    request: DuplicateCheckRequest,
  ): DuplicateCheckResponse {
    const matches: DuplicateMatch[] = [];

    const incoming = request.article;

    const incomingTitle = incoming.title
      .trim()
      .toLowerCase();

    const incomingProduct = (
      incoming.productName ?? ""
    ).trim().toLowerCase();

    for (const existing of request.existingArticles) {
      // PMID Match
      if (
        incoming.pmid &&
        existing.pmid &&
        incoming.pmid === existing.pmid
      ) {
        matches.push({
          articleId: existing.articleId,
          matchType: "PMID",
          confidence: 1,
          reason: "Duplicate PMID detected.",
        });

        continue;
      }

      // DOI Match
      if (
        incoming.doi &&
        existing.doi &&
        incoming.doi === existing.doi
      ) {
        matches.push({
          articleId: existing.articleId,
          matchType: "DOI",
          confidence: 1,
          reason: "Duplicate DOI detected.",
        });

        continue;
      }

      const existingTitle = existing.title
        .trim()
        .toLowerCase();

      // Exact Title Match
      if (incomingTitle === existingTitle) {
        matches.push({
          articleId: existing.articleId,
          matchType: "TITLE",
          confidence: 0.95,
          reason: "Identical article title.",
        });

        continue;
      }

      // Same Product + Similar Title
      const existingProduct = (
        existing.productName ?? ""
      )
        .trim()
        .toLowerCase();

      if (
        incomingProduct &&
        existingProduct &&
        incomingProduct === existingProduct &&
        incomingTitle.includes(incomingProduct) &&
        existingTitle.includes(existingProduct)
      ) {
        matches.push({
          articleId: existing.articleId,
          matchType: "TITLE_PRODUCT",
          confidence: 0.90,
          reason:
            "Same product with similar article title.",
        });

        continue;
      }

      // Basic semantic similarity (Production Alpha)
      const incomingWords = new Set(
        incomingTitle.split(/\s+/),
      );

      const existingWords = new Set(
        existingTitle.split(/\s+/),
      );

      let commonWords = 0;

      for (const word of incomingWords) {
        if (
          word.length > 3 &&
          existingWords.has(word)
        ) {
          commonWords++;
        }
      }

      const similarity =
        commonWords /
        Math.max(
          incomingWords.size,
          existingWords.size,
        );

      if (similarity >= 0.75) {
        matches.push({
          articleId: existing.articleId,
          matchType: "SEMANTIC",
          confidence: Number(
            similarity.toFixed(2),
          ),
          reason:
            "High semantic similarity detected.",
        });
      }
    }

    const isDuplicate =
      matches.length > 0;

    const confidence = isDuplicate
      ? Math.max(
          ...matches.map(
            (match) => match.confidence,
          ),
        )
      : 0;

    return {
      candidate: request.article,

      isDuplicate,

      confidence,

      matches,

      checkedArticles:
        request.existingArticles.length,

      workflowStage:
        "DUPLICATE_CHECK_COMPLETED",

      checkedAt:
        new Date().toISOString(),
    };
  }
}

export const duplicateEngine =
  new DuplicateEngine();