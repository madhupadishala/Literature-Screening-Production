import "server-only";

import { addNcbiIdentity, ncbiBaseUrl, ncbiFetch } from "./ncbi-rate-limit";
import type {
  PubMedArticle,
  PubMedSearchRequest,
  PubMedSearchResponse,
} from "./pubmed-types";

const MAX_RESULTS_CAP = 500;
const ESUMMARY_BATCH_SIZE = 200;

type PubMedESearchResponse = {
  esearchresult?: {
    count?: string;
    idlist?: string[];
  };
};

type PubMedSummaryAuthor = { name?: string };

type PubMedSummaryRecord = {
  uid?: string;
  title?: string;
  authors?: PubMedSummaryAuthor[];
  fulljournalname?: string;
  source?: string;
  pubdate?: string;
  sortpubdate?: string;
  lang?: string[];
  articleids?: Array<{ idtype?: string; value?: string }>;
};

type PubMedESummaryResponse = {
  result?: {
    uids?: string[];
    [key: string]: PubMedSummaryRecord | string[] | undefined;
  };
};

async function fetchJson<T>(url: URL): Promise<T> {
  const response = await ncbiFetch(url);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status}: ${body.slice(0, 300)}`);
  }

  return (await response.json()) as T;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

class PubMedClient {
  async search(request: PubMedSearchRequest): Promise<PubMedSearchResponse> {
    const startedAt = Date.now();

    const retmax = Math.min(
      Math.max(1, request.maxResults ?? 20),
      MAX_RESULTS_CAP,
    );

    const searchUrl = new URL(`${ncbiBaseUrl()}/esearch.fcgi`);
    searchUrl.searchParams.set("db", "pubmed");
    searchUrl.searchParams.set("retmode", "json");
    searchUrl.searchParams.set("retmax", String(retmax));
    searchUrl.searchParams.set("sort", "pub date");
    searchUrl.searchParams.set("term", request.query);
    addNcbiIdentity(searchUrl);

    const searchResult = await fetchJson<PubMedESearchResponse>(searchUrl);
    const ids = searchResult.esearchresult?.idlist ?? [];
    const totalResults = Number(searchResult.esearchresult?.count ?? ids.length);

    if (ids.length === 0) {
      return {
        tenantId: request.tenantId,
        query: request.query,
        totalResults,
        retrievedResults: 0,
        articles: [],
        searchedAt: new Date().toISOString(),
        executionTimeMs: Date.now() - startedAt,
        source: "PubMed",
        workflowStage: "SEARCH_COMPLETED",
      };
    }

    // esummary supports many IDs per call, but batching keeps individual
    // requests well under NCBI's recommended payload size and means one
    // slow/failed batch doesn't take down the whole 500-article search.
    const summaryRecords = new Map<string, PubMedSummaryRecord>();

    for (const batch of chunk(ids, ESUMMARY_BATCH_SIZE)) {
      const summaryUrl = new URL(`${ncbiBaseUrl()}/esummary.fcgi`);
      summaryUrl.searchParams.set("db", "pubmed");
      summaryUrl.searchParams.set("retmode", "json");
      summaryUrl.searchParams.set("id", batch.join(","));
      addNcbiIdentity(summaryUrl);

      const summary = await fetchJson<PubMedESummaryResponse>(summaryUrl);
      const container = summary.result ?? {};

      for (const id of batch) {
        const record = container[id];
        if (record && !Array.isArray(record)) {
          summaryRecords.set(id, record);
        }
      }
    }

    const articles: PubMedArticle[] = ids.flatMap((id) => {
      const record = summaryRecords.get(id);
      if (!record) return [];

      const title = String(record.title || "").replace(/\.$/, "").trim();
      if (!title) return [];

      const doi = record.articleids?.find((item) => item.idtype === "doi")?.value;
      const pmid = record.articleids?.find((item) => item.idtype === "pubmed")?.value || id;

      const article: PubMedArticle = {
        pmid,
        title,
        journal: record.fulljournalname || record.source,
        publicationDate: parsePubDate(record.sortpubdate || record.pubdate),
        doi,
        authors: (record.authors || [])
          .map((author) => String(author.name || "").trim())
          .filter(Boolean),
        keywords: [],
        meshTerms: [],
        language: record.lang?.join(", "),
        country: undefined,
        fullTextAvailable: false,
        source: "PubMed",
      };

      return [article];
    });

    return {
      tenantId: request.tenantId,
      query: request.query,
      totalResults,
      retrievedResults: articles.length,
      articles,
      searchedAt: new Date().toISOString(),
      executionTimeMs: Date.now() - startedAt,
      source: "PubMed",
      workflowStage: "SEARCH_COMPLETED",
    };
  }
}

function parsePubDate(value: unknown): string | undefined {
  const raw = String(value || "").trim();
  if (!raw) return undefined;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  const year = raw.match(/\b(19|20)\d{2}\b/)?.[0];
  return year ? `${year}-01-01` : undefined;
}

export const pubMedClient = new PubMedClient();
