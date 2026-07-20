import "server-only";

import {
  buildPubMedQuery,
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

type PubMedSearchResponse = {
  esearchresult?: {
    idlist?: string[];
  };
};

type PubMedSummaryAuthor = {
  name?: string;
};

type PubMedSummaryRecord = {
  uid?: string;
  title?: string;
  authors?: PubMedSummaryAuthor[];
  fulljournalname?: string;
  source?: string;
  pubdate?: string;
  sortpubdate?: string;
  lang?: string[];
  pubtype?: string[];
  articleids?: Array<{
    idtype?: string;
    value?: string;
  }>;
};

type PubMedSummaryResponse = {
  result?: {
    uids?: string[];
    [key: string]: PubMedSummaryRecord | string[] | undefined;
  };
};

function ncbiBaseUrl(configuredBaseUrl?: string): string {
  return (
    configuredBaseUrl?.trim() ||
    process.env.PUBMED_EUTILS_BASE_URL?.trim() ||
    "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
  );
}

function addNcbiIdentity(url: URL): void {
  const apiKey = process.env.NCBI_API_KEY?.trim();
  const email = process.env.NCBI_EMAIL?.trim();
  const tool = process.env.NCBI_TOOL?.trim() || "ClinixAI";

  if (apiKey) url.searchParams.set("api_key", apiKey);
  if (email) url.searchParams.set("email", email);
  url.searchParams.set("tool", tool);
}

async function searchPubMed(
  input: ConnectorSearchInput,
): Promise<ConnectorSearchOutput> {
  const started = Date.now();
  const translatedQuery = buildPubMedQuery(
    input.criteria,
    input.resolvedProduct,
  );

  const searchUrl = new URL(`${ncbiBaseUrl(input.source.baseUrl)}/esearch.fcgi`);
  searchUrl.searchParams.set("db", "pubmed");
  searchUrl.searchParams.set("retmode", "json");
  searchUrl.searchParams.set("retmax", String(input.limit));
  searchUrl.searchParams.set("sort", "pub date");
  searchUrl.searchParams.set("term", translatedQuery);
  addNcbiIdentity(searchUrl);

  const searchResponse = await fetchJson<PubMedSearchResponse>(searchUrl);
  const ids = searchResponse.esearchresult?.idlist || [];

  if (ids.length === 0) {
    return {
      sourceKey: "PUBMED",
      translatedQuery,
      results: [],
      durationMs: Date.now() - started,
    };
  }

  const summaryUrl = new URL(`${ncbiBaseUrl(input.source.baseUrl)}/esummary.fcgi`);
  summaryUrl.searchParams.set("db", "pubmed");
  summaryUrl.searchParams.set("retmode", "json");
  summaryUrl.searchParams.set("id", ids.join(","));
  addNcbiIdentity(summaryUrl);

  const summary = await fetchJson<PubMedSummaryResponse>(summaryUrl);
  const resultContainer = summary.result || {};

  const results: NormalizedLiteratureResult[] = ids.flatMap((id) => {
    const raw = resultContainer[id];
    if (!raw || Array.isArray(raw)) return [];

    const title = String(raw.title || "").replace(/\.$/, "").trim();
    if (!title) return [];

    const doi = normalizeDoi(
      raw.articleids?.find((item) => item.idtype === "doi")?.value,
    );
    const pmid =
      raw.articleids?.find((item) => item.idtype === "pubmed")?.value ||
      id;
    const publicationDate = parseIsoDate(
      raw.sortpubdate || raw.pubdate,
    );

    return [
      {
        sourceKey: "PUBMED",
        sourceRecordId: id,
        pmid,
        doi,
        title,
        authors: (raw.authors || [])
          .map((author) => String(author.name || "").trim())
          .filter(Boolean),
        journal: raw.fulljournalname || raw.source,
        publicationDate,
        language: raw.lang?.join(", "),
        publicationType: raw.pubtype?.join(", "),
        landingUrl: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        fullTextStatus: "abstract_only",
        matchMetadata: {
          productMatched: input.resolvedProduct.matched,
          resolvedProduct: input.resolvedProduct,
        },
        dedupeKey: buildDedupeKey({
          doi,
          pmid,
          title,
          publicationDate,
        }),
      },
    ];
  });

  return {
    sourceKey: "PUBMED",
    translatedQuery,
    results,
    durationMs: Date.now() - started,
  };
}

export const pubMedConnector: LiteratureConnector = {
  sourceKey: "PUBMED",
  search: searchPubMed,
};
