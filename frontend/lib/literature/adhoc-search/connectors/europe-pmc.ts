import "server-only";

import {
  buildEuropePmcQuery,
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

type EuropePmcRecord = {
  id?: string;
  source?: string;
  pmid?: string;
  doi?: string;
  title?: string;
  authorString?: string;
  journalTitle?: string;
  firstPublicationDate?: string;
  electronicPublicationDate?: string;
  pubYear?: string;
  language?: string;
  pubType?: string;
  abstractText?: string;
  isOpenAccess?: string;
  inEPMC?: string;
  fullTextUrlList?: {
    fullTextUrl?: Array<{ url?: string; availability?: string }>;
  };
};

type EuropePmcResponse = {
  resultList?: {
    result?: EuropePmcRecord[];
  };
};

async function searchEuropePmc(
  input: ConnectorSearchInput,
): Promise<ConnectorSearchOutput> {
  const started = Date.now();
  const translatedQuery = buildEuropePmcQuery(
    input.criteria,
    input.resolvedProduct,
  );

  const base =
    input.source.baseUrl ||
    "https://www.ebi.ac.uk/europepmc/webservices/rest/search";
  const url = new URL(base);
  url.searchParams.set("query", translatedQuery);
  url.searchParams.set("format", "json");
  url.searchParams.set("resultType", "core");
  url.searchParams.set("pageSize", String(input.limit));
  url.searchParams.set("sort", "P_PDATE_D desc");

  const email = process.env.EUROPE_PMC_EMAIL?.trim();
  if (email) url.searchParams.set("email", email);

  const response = await fetchJson<EuropePmcResponse>(url);

  const results: NormalizedLiteratureResult[] = (
    response.resultList?.result || []
  ).flatMap((raw) => {
    const title = String(raw.title || "").replace(/<[^>]+>/g, "").trim();
    const sourceRecordId = String(raw.id || raw.pmid || "").trim();
    if (!title || !sourceRecordId) return [];

    const doi = normalizeDoi(raw.doi);
    const pmid = raw.pmid || (raw.source === "MED" ? raw.id : undefined);
    const publicationDate = parseIsoDate(
      raw.firstPublicationDate ||
        raw.electronicPublicationDate ||
        raw.pubYear,
    );

    const openAccess =
      raw.isOpenAccess === "Y" ||
      raw.inEPMC === "Y" ||
      Boolean(raw.fullTextUrlList?.fullTextUrl?.length);

    return [
      {
        sourceKey: "EUROPE_PMC",
        sourceRecordId,
        pmid,
        doi,
        title,
        authors: String(raw.authorString || "")
          .split(",")
          .map((author) => author.trim())
          .filter(Boolean),
        journal: raw.journalTitle,
        publicationDate,
        language: raw.language,
        publicationType: raw.pubType,
        abstractText: raw.abstractText,
        landingUrl: `https://europepmc.org/article/${raw.source || "MED"}/${sourceRecordId}`,
        fullTextStatus: openAccess ? "open_access" : "abstract_only",
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
    sourceKey: "EUROPE_PMC",
    translatedQuery,
    results,
    durationMs: Date.now() - started,
  };
}

export const europePmcConnector: LiteratureConnector = {
  sourceKey: "EUROPE_PMC",
  search: searchEuropePmc,
};
