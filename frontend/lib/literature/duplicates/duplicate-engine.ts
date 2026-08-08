import type {
  DuplicateCandidate,
  DuplicateCheckRequest,
  DuplicateCheckResponse,
  DuplicateMatch,
} from "./duplicate-types";

// Tiered, defensible matching hierarchy. Checked in this order per
// candidate; the first tier that matches wins for that pair (stronger
// signals aren't diluted by also computing weaker ones). Rationale for
// the ordering:
//   1. DOI       -- permanent, never reassigned, stable across an
//                   article's ahead-of-print -> final-publication
//                   lifecycle (unlike PMID, which can legitimately
//                   differ between those two versions of the same work).
//   2. Trial ID   -- a shared ClinicalTrials.gov/equivalent registry
//                   number is strong evidence of the same underlying
//                   study, independent of which journal record it is.
//   3. PMID       -- reliable, but checked after DOI/trial ID since a
//                   single study can carry two valid PMIDs over time.
//   4. Title+author+date -- hybrid fallback when no strong identifier
//                   is present or available identifiers didn't match.
//   5. Title+product similarity, then semantic -- weakest signals;
//                   semantic matches are NEVER auto-merge eligible,
//                   only flagged for human review (see requiresReview
//                   on DuplicateMatch/DuplicateCheckResponse).
const TITLE_WORD_MIN_LENGTH = 3;
const TITLE_AUTHOR_DATE_TITLE_THRESHOLD = 0.8;
const SEMANTIC_THRESHOLD = 0.75;
const PUBLICATION_DATE_WINDOW_DAYS = 60;

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "");
}

function titleWordOverlap(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/).filter((w) => w.length > TITLE_WORD_MIN_LENGTH));
  const wordsB = new Set(b.split(/\s+/).filter((w) => w.length > TITLE_WORD_MIN_LENGTH));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let common = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) common++;
  }

  return common / Math.max(wordsA.size, wordsB.size);
}

function normalizeAuthorSurname(name: string): string {
  // "Smith J" / "Smith, John" / "J Smith" -> take the longest token as a
  // rough surname proxy. Not perfect, but good enough to corroborate
  // (not solely determine) a match alongside title + date.
  return name
    .trim()
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] ?? "";
}

function authorOverlapRatio(a: string[] = [], b: string[] = []): number {
  const setA = new Set(a.map(normalizeAuthorSurname).filter(Boolean));
  const setB = new Set(b.map(normalizeAuthorSurname).filter(Boolean));

  if (setA.size === 0 || setB.size === 0) return 0;

  let common = 0;
  for (const surname of setA) {
    if (setB.has(surname)) common++;
  }

  return common / Math.min(setA.size, setB.size);
}

function datesWithinWindow(a?: string, b?: string, windowDays = PUBLICATION_DATE_WINDOW_DAYS): boolean {
  if (!a || !b) return false;

  const dateA = new Date(a).getTime();
  const dateB = new Date(b).getTime();

  if (Number.isNaN(dateA) || Number.isNaN(dateB)) return false;

  const diffDays = Math.abs(dateA - dateB) / (1000 * 60 * 60 * 24);
  return diffDays <= windowDays;
}

function matchOne(incoming: DuplicateCandidate, existing: DuplicateCandidate): DuplicateMatch | null {
  // Tier 1: DOI
  if (incoming.doi && existing.doi && incoming.doi.trim().toLowerCase() === existing.doi.trim().toLowerCase()) {
    return {
      articleId: existing.articleId,
      matchType: "DOI",
      confidence: 1,
      reason: "Identical DOI. DOIs are permanent and non-reassignable -- treated as the strongest identity signal.",
      requiresReview: false,
    };
  }

  // Tier 2: trial registry ID
  if (
    incoming.trialRegistryId &&
    existing.trialRegistryId &&
    incoming.trialRegistryId.trim().toLowerCase() === existing.trialRegistryId.trim().toLowerCase()
  ) {
    return {
      articleId: existing.articleId,
      matchType: "TRIAL_REGISTRY",
      confidence: 0.98,
      reason: `Same trial registry ID (${incoming.trialRegistryId}). Strong evidence of the same underlying study.`,
      requiresReview: false,
    };
  }

  // Tier 3: PMID
  if (incoming.pmid && existing.pmid && incoming.pmid === existing.pmid) {
    return {
      articleId: existing.articleId,
      matchType: "PMID",
      confidence: 0.97,
      reason:
        "Identical PMID. Checked after DOI/trial ID because a single study can carry two valid PMIDs across its ahead-of-print and final-publication versions.",
      requiresReview: false,
    };
  }

  const incomingTitle = normalizeTitle(incoming.title);
  const existingTitle = normalizeTitle(existing.title);

  // Tier 4a: exact normalized title match
  if (incomingTitle && incomingTitle === existingTitle) {
    return {
      articleId: existing.articleId,
      matchType: "TITLE",
      confidence: 0.95,
      reason: "Identical article title (normalized).",
      requiresReview: false,
    };
  }

  // Tier 4b: title + author + date hybrid
  const titleSimilarity = titleWordOverlap(incomingTitle, existingTitle);
  const authorOverlap = authorOverlapRatio(incoming.authors, existing.authors);
  const dateAligned = datesWithinWindow(incoming.publicationDate, existing.publicationDate);

  if (titleSimilarity >= TITLE_AUTHOR_DATE_TITLE_THRESHOLD && authorOverlap >= 0.5 && dateAligned) {
    return {
      articleId: existing.articleId,
      matchType: "TITLE_AUTHOR_DATE",
      confidence: Number((0.85 * titleSimilarity).toFixed(2)),
      reason: `High title similarity (${Math.round(titleSimilarity * 100)}%) with overlapping authors and publication dates within ${PUBLICATION_DATE_WINDOW_DAYS} days. No shared DOI/PMID -- likely the same article indexed by a different source, or an ahead-of-print/final-publication pair.`,
      requiresReview: false,
    };
  }

  // Tier 5a: same product + similar title
  const incomingProduct = (incoming.productName ?? "").trim().toLowerCase();
  const existingProduct = (existing.productName ?? "").trim().toLowerCase();

  if (
    incomingProduct &&
    existingProduct &&
    incomingProduct === existingProduct &&
    incomingTitle.includes(incomingProduct) &&
    existingTitle.includes(existingProduct)
  ) {
    return {
      articleId: existing.articleId,
      matchType: "TITLE_PRODUCT",
      confidence: 0.7,
      reason: "Same product mentioned with a similar article title, but no corroborating author/date match.",
      requiresReview: true,
    };
  }

  // Tier 5b: semantic-only. Deliberately never auto-merge eligible --
  // this is also the tier most likely to catch companion/sub-analysis
  // papers from the same underlying study, which are genuinely distinct
  // publications and should never be silently merged by a matching rule.
  if (titleSimilarity >= SEMANTIC_THRESHOLD) {
    return {
      articleId: existing.articleId,
      matchType: "SEMANTIC",
      confidence: Number(titleSimilarity.toFixed(2)),
      reason:
        "Title-word similarity above threshold with no corroborating identifier, author, or date match. May be a true duplicate, a companion/sub-analysis publication from the same study, or coincidental similarity -- requires human review, not auto-merge.",
      requiresReview: true,
    };
  }

  return null;
}

export class DuplicateEngine {
  check(request: DuplicateCheckRequest): DuplicateCheckResponse {
    const matches: DuplicateMatch[] = [];

    for (const existing of request.existingArticles) {
      const match = matchOne(request.article, existing);
      if (match) matches.push(match);
    }

    const isDuplicate = matches.some((match) => !match.requiresReview);
    const requiresReview = matches.some((match) => match.requiresReview) && !isDuplicate;

    const confidence = matches.length > 0 ? Math.max(...matches.map((match) => match.confidence)) : 0;

    return {
      candidate: request.article,
      isDuplicate,
      requiresReview,
      confidence,
      matches,
      checkedArticles: request.existingArticles.length,
      workflowStage: "DUPLICATE_CHECK_COMPLETED",
      checkedAt: new Date().toISOString(),
    };
  }
}

export const duplicateEngine = new DuplicateEngine();
