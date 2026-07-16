import type { SearchStrategyRequest, SearchTermGroup } from "./search-strategy-types";

function wrapTerms(terms: string[]) {
  return `(${terms.join(" OR ")})`;
}

export class SearchQueryBuilder {
  buildGroups(request: SearchStrategyRequest): SearchTermGroup[] {
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

    if ((request.exclusionTerms ?? []).length > 0) {
      groups.push({
        name: "Exclusion",
        operator: "NOT",
        terms: request.exclusionTerms!,
      });
    }

    return groups;
  }

  buildQuery(groups: SearchTermGroup[]) {
    const query: string[] = [];

    groups.forEach((group) => {
      if (group.operator === "NOT") {
        query.push(`NOT ${wrapTerms(group.terms)}`);
      } else {
        if (query.length === 0) {
          query.push(wrapTerms(group.terms));
        } else {
          query.push(`${group.operator} ${wrapTerms(group.terms)}`);
        }
      }
    });

    return query.join(" ");
  }
}