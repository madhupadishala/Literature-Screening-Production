import type {
  AdHocSearchCriteria,
  ResolvedProductContext,
} from "@/lib/literature/adhoc-search/types";

function clean(value: unknown): string {
  return String(value || "").trim();
}

function quote(term: string): string {
  const value = clean(term).replaceAll('"', '\\"');
  return value.includes(" ") ? `"${value}"` : value;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(clean).filter(Boolean))];
}

export function normalizeSearchCriteria(
  input: AdHocSearchCriteria,
): AdHocSearchCriteria {
  const date = clean(input.date);
  const dateFrom = clean(input.dateFrom || date);
  const dateTo = clean(input.dateTo || date);

  if (dateFrom && Number.isNaN(Date.parse(dateFrom))) {
    throw new Error("Date From is not a valid date.");
  }

  if (dateTo && Number.isNaN(Date.parse(dateTo))) {
    throw new Error("Date To is not a valid date.");
  }

  if (dateFrom && dateTo && Date.parse(dateFrom) > Date.parse(dateTo)) {
    throw new Error("Date From cannot be later than Date To.");
  }

  const limit = Math.max(1, Math.min(Number(input.limit || 50), 500));

  return {
    searchString: clean(input.searchString) || undefined,
    pmid: clean(input.pmid) || undefined,
    doi: clean(input.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, "") || undefined,
    product: clean(input.product) || undefined,
    productId: clean(input.productId) || undefined,
    whodrugId: clean(input.whodrugId) || undefined,
    date: date || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    sourceKeys: unique(input.sourceKeys || []),
    limit,
  };
}

export function validateSearchGuard(
  criteria: AdHocSearchCriteria,
  selectedSourceCount: number,
): void {
  const hasCriterion = [
    criteria.searchString,
    criteria.pmid,
    criteria.doi,
    criteria.product,
    criteria.productId,
    criteria.whodrugId,
    criteria.date,
    criteria.dateFrom,
    criteria.dateTo,
  ].some((value) => clean(value).length > 0);

  if (hasCriterion) return;

  if (selectedSourceCount > 0 && Number(criteria.limit || 0) <= 100) {
    return;
  }

  throw new Error(
    "Enter at least one search criterion, or select a database with a result limit of 100 or fewer.",
  );
}

export function baseSearchTerms(
  criteria: AdHocSearchCriteria,
  resolvedProduct: ResolvedProductContext,
): string[] {
  return unique([
    criteria.searchString || "",
    criteria.product || "",
    ...resolvedProduct.searchTerms,
  ]);
}

export function buildPubMedQuery(
  criteria: AdHocSearchCriteria,
  resolvedProduct: ResolvedProductContext,
): string {
  const clauses: string[] = [];

  if (criteria.pmid) {
    clauses.push(`${quote(criteria.pmid)}[PMID]`);
  }

  if (criteria.doi) {
    clauses.push(`${quote(criteria.doi)}[AID]`);
  }

  if (criteria.searchString) {
    clauses.push(`(${criteria.searchString})`);
  }

  const productTerms = unique([
    criteria.product || "",
    ...resolvedProduct.searchTerms,
  ]);

  if (productTerms.length > 0) {
    clauses.push(
      `(${productTerms
        .map((term) => `${quote(term)}[Title/Abstract]`)
        .join(" OR ")})`,
    );
  }

  if (criteria.dateFrom || criteria.dateTo) {
    const from = criteria.dateFrom || "1800/01/01";
    const to = criteria.dateTo || new Date().toISOString().slice(0, 10);
    clauses.push(
      `("${from.replaceAll("-", "/")}"[Date - Publication] : "${to.replaceAll("-", "/")}"[Date - Publication])`,
    );
  }

  return clauses.length > 0
    ? clauses.join(" AND ")
    : '("1800/01/01"[Date - Publication] : "3000/12/31"[Date - Publication])';
}

export function buildEuropePmcQuery(
  criteria: AdHocSearchCriteria,
  resolvedProduct: ResolvedProductContext,
): string {
  const clauses: string[] = [];

  if (criteria.pmid) {
    clauses.push(`EXT_ID:${quote(criteria.pmid)} AND SRC:MED`);
  }

  if (criteria.doi) {
    clauses.push(`DOI:${quote(criteria.doi)}`);
  }

  if (criteria.searchString) {
    clauses.push(`(${criteria.searchString})`);
  }

  const productTerms = unique([
    criteria.product || "",
    ...resolvedProduct.searchTerms,
  ]);

  if (productTerms.length > 0) {
    clauses.push(
      `(${productTerms.map((term) => `TITLE_ABS:${quote(term)}`).join(" OR ")})`,
    );
  }

  if (criteria.dateFrom || criteria.dateTo) {
    const from = criteria.dateFrom || "1800-01-01";
    const to = criteria.dateTo || new Date().toISOString().slice(0, 10);
    clauses.push(`FIRST_PDATE:[${from} TO ${to}]`);
  }

  return clauses.length > 0 ? clauses.join(" AND ") : "*";
}

export function buildCrossrefQuery(
  criteria: AdHocSearchCriteria,
  resolvedProduct: ResolvedProductContext,
): string {
  const terms = unique([
    criteria.doi || "",
    criteria.pmid || "",
    ...baseSearchTerms(criteria, resolvedProduct),
  ]);
  return terms.join(" ").trim() || "*";
}
