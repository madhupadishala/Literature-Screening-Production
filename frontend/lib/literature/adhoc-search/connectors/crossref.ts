import "server-only";

import {
  buildCrossrefQuery,
} from "@/lib/literature/adhoc-search/query-builder";
import {
  buildDedupeKey,
  fetchJson,
  normalizeDoi,
  parseIsoDate,
} from "@/lib/literature/adhoc-search/http";
import type {
  ConnectorSearchInput,
  ConnectorSearchOutput,
  LiteratureConnector,
  NormalizedLiteratureResult,
} from "@/lib/literature/adhoc-search/types";

type CrossrefWork = {
  DOI?: string;
  URL?: string;
  title?: string[];
  abstract?: string;
  author?: Array<{
    given?: string;
    family?: string;
    name?: string;
  }>;
  "container-title"?: string[];
  language?: string;
  type?: string;
  published?: { "date-parts"?: number[][] };
  "published-print"?: { "date-parts"?: number[][] };
  "published-online"?: { "date-parts"?: number[][] };
  link?: Array<{
    URL?: string;
    "content-type"?: string;
    "intended-application"?: string;
  }>;
};

type CrossrefResponse = {
  message?: {
    items?: CrossrefWork[];
  };
};

function dateFromParts(parts?: number[][]): string | undefined {
  const first = parts?.[0];
  if (!first?.[0]) return undefined;

  const year = first[0];
  const month = String(first[1] || 1).padStart(2, "0");
  const day = String(first[2] || 1).padStart(2, "0");
  return parseIsoDate(`${year}-${month}-${day}`);
}

async function searchCrossref(
  input: ConnectorSearchInput,
): Promise<ConnectorSearchOutput> {
  const started = Date.now();
  const translatedQuery = buildCrossrefQuery(
    input.criteria,
    input.resolvedProduct,
  );

  const base = input.source.baseUrl || "https://api.crossref.org/v1/works";
  const url = new URL(base);
  url.searchParams.set("rows", String(input.limit));
  url.searchParams.set("sort", "published");
  url.searchParams.set("order", "desc");

  if (translatedQuery !== "*") {
    url.searchParams.set("query.bibliographic", translatedQuery);
  }

  const filters: string[] = [];
  if (input.criteria.dateFrom) {
    filters.push(`from-pub-date:${input.criteria.dateFrom}`);
  }
  if (input.criteria.dateTo) {
    filters.push(`until-pub-date:${input.criteria.dateTo}`);
  }
  if (filters.length > 0) {
    url.searchParams.set("filter", filters.join(","));
  }

  const mailto = process.env.CROSSREF_MAILTO?.trim();
  if (mailto) url.searchParams.set("mailto", mailto);

  const headers: Record<string, string> = {};
  const token = process.env.CROSSREF_PLUS_API_TOKEN?.trim();
  if (token) {
    headers["Crossref-Plus-API-Token"] = `Bearer ${token}`;
  }

  const response = await fetchJson<CrossrefResponse>(url, { headers });

  const results: NormalizedLiteratureResult[] = (
    response.message?.items || []
  ).flatMap((raw) => {
    const doi = normalizeDoi(raw.DOI);
    const title = String(raw.title?.[0] || "").replace(/<[^>]+>/g, "").trim();
    const sourceRecordId = doi || raw.URL || title;
    if (!title || !sourceRecordId) return [];

    const publicationDate =
      dateFromParts(raw.published?.["date-parts"]) ||
      dateFromParts(raw["published-online"]?.["date-parts"]) ||
      dateFromParts(raw["published-print"]?.["date-parts"]);

    const fullTextLink = raw.link?.find((link) =>
      String(link["content-type"] || "").includes("pdf"),
    );

    return [
      {
        sourceKey: "CROSSREF",
        sourceRecordId,
        doi,
        title,
        authors: (raw.author || [])
          .map((author) =>
            [author.given, author.family]
              .filter(Boolean)
              .join(" ")
              .trim() || String(author.name || "").trim(),
          )
          .filter(Boolean),
        journal: raw["container-title"]?.[0],
        publicationDate,
        language: raw.language,
        publicationType: raw.type,
        abstractText: raw.abstract?.replace(/<[^>]+>/g, " "),
        landingUrl: raw.URL || (doi ? `https://doi.org/${doi}` : undefined),
        fullTextStatus: fullTextLink ? "unknown" : "abstract_only",
        matchMetadata: {
          productMatched: input.resolvedProduct.matched,
          resolvedProduct: input.resolvedProduct,
          fullTextMetadataUrl: fullTextLink?.URL,
        },
        dedupeKey: buildDedupeKey({
          doi,
          title,
          publicationDate,
        }),
      },
    ];
  });

  return {
    sourceKey: "CROSSREF",
    translatedQuery,
    results,
    durationMs: Date.now() - started,
  };
}

export const crossrefConnector: LiteratureConnector = {
  sourceKey: "CROSSREF",
  search: searchCrossref,
};
