import "server-only";

import { XMLParser } from "fast-xml-parser";

import {
  buildPubMedQuery,
} from "@/lib/literature/adhoc-search/query-builder";
import {
  buildDedupeKey,
  normalizeDoi,
  parseIsoDate,
} from "@/lib/literature/adhoc-search/http";
import type {
  ConnectorSearchInput,
  ConnectorSearchOutput,
  LiteratureConnector,
  NormalizedLiteratureResult,
} from "@/lib/literature/adhoc-search/types";
import {
  addNcbiIdentity,
  ncbiFetch,
} from "@/lib/literature/pubmed/ncbi-rate-limit";

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

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

function ncbiBaseUrl(configuredBaseUrl?: string): string {
  return (
    configuredBaseUrl?.trim() ||
    process.env.PUBMED_EUTILS_BASE_URL?.trim() ||
    "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
  );
}

async function fetchNcbiJson<T>(url: URL): Promise<T> {
  const response = await ncbiFetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `NCBI returned HTTP ${response.status}: ${body.slice(0, 300)}`,
    );
  }

  return (await response.json()) as T;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function nodeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (Array.isArray(value)) {
    return value.map(nodeText).filter(Boolean).join(" ").trim();
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record["#text"] !== undefined) {
      return nodeText(record["#text"]);
    }
    return Object.entries(record)
      .filter(([key]) => !key.startsWith("@_"))
      .map(([, child]) => nodeText(child))
      .filter(Boolean)
      .join(" ")
      .trim();
  }
  return "";
}

function abstractText(article: unknown): string | undefined {
  if (!article || typeof article !== "object") return undefined;
  const articleRecord = article as Record<string, unknown>;
  const abstract = articleRecord.Abstract;
  if (!abstract || typeof abstract !== "object") return undefined;

  const parts = asArray(
    (abstract as Record<string, unknown>).AbstractText as unknown,
  )
    .map((part) => {
      const text = nodeText(part);
      if (!text) return "";
      const label =
        part && typeof part === "object" && !Array.isArray(part)
          ? String((part as Record<string, unknown>)["@_Label"] || "").trim()
          : "";
      return label ? `${label}: ${text}` : text;
    })
    .filter(Boolean);

  const joined = parts.join("\n\n").trim();
  return joined || undefined;
}

async function fetchPubMedAbstracts(
  ids: string[],
  configuredBaseUrl?: string,
): Promise<Map<string, string | undefined>> {
  const fetchUrl = new URL(`${ncbiBaseUrl(configuredBaseUrl)}/efetch.fcgi`);
  fetchUrl.searchParams.set("db", "pubmed");
  fetchUrl.searchParams.set("id", ids.join(","));
  fetchUrl.searchParams.set("rettype", "abstract");
  fetchUrl.searchParams.set("retmode", "xml");
  addNcbiIdentity(fetchUrl);

  const response = await ncbiFetch(fetchUrl, {
    headers: { Accept: "application/xml,text/xml" },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `NCBI efetch returned HTTP ${response.status}: ${body.slice(0, 300)}`,
    );
  }

  const parsed = xmlParser.parse(await response.text()) as Record<string, unknown>;
  const root = parsed.PubmedArticleSet;
  const records =
    root && typeof root === "object"
      ? asArray((root as Record<string, unknown>).PubmedArticle as unknown)
      : [];

  const abstracts = new Map<string, string | undefined>();
  for (const record of records) {
    if (!record || typeof record !== "object") continue;
    const medline = (record as Record<string, unknown>).MedlineCitation;
    if (!medline || typeof medline !== "object") continue;
    const medlineRecord = medline as Record<string, unknown>;
    const pmid = nodeText(medlineRecord.PMID);
    if (!pmid) continue;
    abstracts.set(pmid, abstractText(medlineRecord.Article));
  }

  return abstracts;
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

  const searchResponse = await fetchNcbiJson<PubMedSearchResponse>(searchUrl);
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

  const [summary, abstracts] = await Promise.all([
    fetchNcbiJson<PubMedSummaryResponse>(summaryUrl),
    fetchPubMedAbstracts(ids, input.source.baseUrl),
  ]);
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
    const abstract = abstracts.get(pmid);

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
        abstractText: abstract,
        landingUrl: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        fullTextStatus: abstract ? "abstract_only" : "unavailable",
        matchMetadata: {
          productMatched: input.resolvedProduct.matched,
          resolvedProduct: input.resolvedProduct,
          abstractSource: "NCBI_EFETCH",
          abstractAvailable: Boolean(abstract),
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
