import type {
  SearchStrategyRequest,
  SearchTermGroup,
} from "./search-strategy-types";

function sanitize(term: string): string {
  return term.trim().replace(/\s+/g, " ");
}

function quoteIfRequired(term: string): string {
  const value = sanitize(term);

  if (value.includes(" ")) {
    return `"${value}"`;
  }

  return value;
}

function buildOrBlock(terms: string[]): string {
  const cleaned = terms
    .map(quoteIfRequired)
    .filter((item) => item.length > 0);

  if (cleaned.length === 0) {
    return "";
  }

  return `(${cleaned.join(" OR ")})`;
}

export class SearchQueryBuilder {
  buildGroups(
    request: SearchStrategyRequest,
  ): SearchTermGroup[] {
    const groups: SearchTermGroup[] = [];

    groups.push({
      name: "Products",
      operator: "AND",
      terms: request.productNames,
    });

    groups.push({
      name: "Inclusion",
      operator: "AND",
      terms: request.inclusionTerms,
    });

    if (
      request.exclusionTerms &&
      request.exclusionTerms.length > 0
    ) {
      groups.push({
        name: "Exclusion",
        operator: "NOT",
        terms: request.exclusionTerms,
      });
    }

    return groups;
  }

  buildQuery(
    groups: SearchTermGroup[],
  ): string {
    const clauses: string[] = [];

    for (const group of groups) {
      const block = buildOrBlock(group.terms);

      if (!block) {
        continue;
      }

      switch (group.operator) {
        case "AND":
          if (clauses.length === 0) {
            clauses.push(block);
          } else {
            clauses.push(`AND ${block}`);
          }
          break;

        case "OR":
          if (clauses.length === 0) {
            clauses.push(block);
          } else {
            clauses.push(`OR ${block}`);
          }
          break;

        case "NOT":
          clauses.push(`NOT ${block}`);
          break;

        default:
          if (clauses.length === 0) {
            clauses.push(block);
          } else {
            clauses.push(`AND ${block}`);
          }
      }
    }

    return clauses.join(" ");
  }

  buildPubMedQuery(
    request: SearchStrategyRequest,
  ): string {
    return this.buildQuery(
      this.buildGroups(request),
    );
  }
}

export const searchQueryBuilder =
  new SearchQueryBuilder();