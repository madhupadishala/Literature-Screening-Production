import type {
  DuplicateCandidate,
  DuplicateMatch,
} from "./duplicate-types";

function normalize(value?: string) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function titleScore(a: string, b: string) {
  const left = normalize(a);
  const right = normalize(b);

  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  if (left.includes(right) || right.includes(left)) {
    return 0.85;
  }

  return 0;
}

export class DuplicateMatcher {
  match(
    candidate: DuplicateCandidate,
    existing: DuplicateCandidate[],
  ): DuplicateMatch[] {
    return existing
      .map((record) => {
        if (candidate.pmid && record.pmid && candidate.pmid === record.pmid) {
          return {
            candidateId: candidate.id,
            matchedRecordId: record.id,
            score: 1,
            reason: "Exact PMID match",
          };
        }

        if (
          candidate.doi &&
          record.doi &&
          normalize(candidate.doi) === normalize(record.doi)
        ) {
          return {
            candidateId: candidate.id,
            matchedRecordId: record.id,
            score: 0.98,
            reason: "Exact DOI match",
          };
        }

        const score = titleScore(candidate.title, record.title);

        return {
          candidateId: candidate.id,
          matchedRecordId: record.id,
          score,
          reason: score >= 0.85 ? "High title similarity" : "Low similarity",
        };
      })
      .filter((match) => match.score >= 0.85)
      .sort((a, b) => b.score - a.score);
  }
}

export const duplicateMatcher = new DuplicateMatcher();