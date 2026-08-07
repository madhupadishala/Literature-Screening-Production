import "server-only";

import { XMLParser } from "fast-xml-parser";
import { addNcbiIdentity, ncbiBaseUrl, ncbiFetch } from "@/lib/literature/pubmed/ncbi-rate-limit";
import type {
  ArticleFetchRequest,
  ArticleFetchResponse,
  ArticleMetadata,
} from "./article-fetch-types";

export interface ArticleEvidenceManifest {
  evidencePackageId: string;
  tenantId: string;
  pmid: string;
  source: "PubMed";
  retrievalStatus: "SUCCESS";
  createdAt: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractText(node: unknown): string {
  if (typeof node === "string") return decodeXmlEntities(node);
  if (node && typeof node === "object" && "#text" in (node as Record<string, unknown>)) {
    return decodeXmlEntities(String((node as Record<string, unknown>)["#text"]));
  }
  return "";
}

type XmlTextNode = string | { "#text"?: string; "@_Label"?: string; "@_EIdType"?: string; "@_IdType"?: string } | undefined;

interface PubmedArticleXml {
  ArticleTitle?: XmlTextNode;
  Abstract?: { AbstractText?: XmlTextNode | XmlTextNode[] };
  AuthorList?: {
    Author?:
      | { LastName?: string; Initials?: string; ForeName?: string; CollectiveName?: string }
      | Array<{ LastName?: string; Initials?: string; ForeName?: string; CollectiveName?: string }>;
  };
  Journal?: { Title?: string; JournalIssue?: { PubDate?: { Year?: string; Month?: string } } };
  ELocationID?: XmlTextNode | XmlTextNode[];
  Language?: XmlTextNode;
}

interface PubmedDataXml {
  ArticleIdList?: { ArticleId?: XmlTextNode | XmlTextNode[] };
}

function xmlAttr(node: XmlTextNode, attr: "@_Label" | "@_IdType" | "@_EIdType"): string | undefined {
  if (!node || typeof node === "string") return undefined;
  return node[attr];
}

function extractAbstract(articleNode: PubmedArticleXml | undefined): string | undefined {
  const abstractNode = articleNode?.Abstract?.AbstractText;
  if (!abstractNode) return undefined;

  const parts = asArray(abstractNode).map((part) => {
    const label = xmlAttr(part, "@_Label");
    const text = extractText(part);
    return label ? `${label}: ${text}` : text;
  });

  const joined = parts.filter(Boolean).join("\n\n").trim();
  return joined || undefined;
}

function extractAuthors(articleNode: PubmedArticleXml | undefined): string[] {
  const authorList = asArray(articleNode?.AuthorList?.Author);

  return authorList
    .map((author) => {
      const last = author?.LastName ?? "";
      const initials = author?.Initials ?? author?.ForeName ?? "";
      const name = [last, initials].filter(Boolean).join(" ").trim();
      return name || author?.CollectiveName || "";
    })
    .filter(Boolean);
}

function extractDoi(
  articleNode: PubmedArticleXml | undefined,
  pubmedData: PubmedDataXml | undefined,
): string | undefined {
  const fromArticleIds = asArray(pubmedData?.ArticleIdList?.ArticleId).find(
    (id) => xmlAttr(id, "@_IdType") === "doi",
  );
  if (fromArticleIds) return extractText(fromArticleIds);

  const fromELocation = asArray(articleNode?.ELocationID).find(
    (loc) => xmlAttr(loc, "@_EIdType") === "doi",
  );
  return fromELocation ? extractText(fromELocation) : undefined;
}

class ArticleFetchClient {
  async fetchArticle(request: ArticleFetchRequest): Promise<ArticleFetchResponse> {
    const now = new Date().toISOString();

    const fetchUrl = new URL(`${ncbiBaseUrl()}/efetch.fcgi`);
    fetchUrl.searchParams.set("db", "pubmed");
    fetchUrl.searchParams.set("id", request.pmid);
    fetchUrl.searchParams.set("rettype", "abstract");
    fetchUrl.searchParams.set("retmode", "xml");
    addNcbiIdentity(fetchUrl);

    const response = await ncbiFetch(fetchUrl);

    if (!response.ok) {
      const body = await response.text();
      return {
        metadata: {
          pmid: request.pmid,
          title: `Unable to retrieve PMID ${request.pmid}`,
          authors: [],
          fullTextAvailable: false,
        },
        fetchedAt: now,
        workflowStage: "ARTICLE_FETCH_COMPLETED",
        success: false,
        errors: [`NCBI efetch returned HTTP ${response.status}: ${body.slice(0, 200)}`],
      } as ArticleFetchResponse;
    }

    const xml = await response.text();
    const parsed = parser.parse(xml);

    const pubmedArticleSet = asArray(parsed?.PubmedArticleSet?.PubmedArticle);
    const record = pubmedArticleSet[0];

    if (!record) {
      return {
        metadata: {
          pmid: request.pmid,
          title: `PMID ${request.pmid} not found`,
          authors: [],
          fullTextAvailable: false,
        },
        fetchedAt: now,
        workflowStage: "ARTICLE_FETCH_COMPLETED",
        success: false,
        errors: [`NCBI returned no record for PMID ${request.pmid}.`],
      } as ArticleFetchResponse;
    }

    const articleNode = record?.MedlineCitation?.Article;
    const pubmedData = record?.PubmedData;
    const journalIssue = articleNode?.Journal?.JournalIssue;
    const pubDate = journalIssue?.PubDate;

    const publicationDate =
      pubDate?.Year && pubDate?.Month
        ? `${pubDate.Year}-${String(pubDate.Month).padStart(2, "0")}-01`
        : pubDate?.Year
          ? `${pubDate.Year}-01-01`
          : undefined;

    const metadata: ArticleMetadata = {
      pmid: request.pmid,
      title: extractText(articleNode?.ArticleTitle) || `PMID ${request.pmid}`,
      abstract: extractAbstract(articleNode),
      journal: articleNode?.Journal?.Title ? decodeXmlEntities(String(articleNode.Journal.Title)) : undefined,
      publicationDate,
      doi: extractDoi(articleNode, pubmedData),
      authors: extractAuthors(articleNode),
      meshTerms: asArray(record?.MedlineCitation?.MeshHeadingList?.MeshHeading)
        .map((heading) => extractText(heading?.DescriptorName))
        .filter(Boolean),
      language: extractText(articleNode?.Language),
      fullTextAvailable: false,
    };

    const evidenceManifest: ArticleEvidenceManifest = {
      evidencePackageId: `${request.tenantId}_${request.pmid}`,
      tenantId: request.tenantId,
      pmid: request.pmid,
      source: "PubMed",
      retrievalStatus: "SUCCESS",
      createdAt: now,
    };

    return {
      metadata,
      fetchedAt: now,
      workflowStage: "ARTICLE_FETCH_COMPLETED",
      success: true,
      evidenceManifest,
    } as ArticleFetchResponse;
  }
}

export const articleFetchClient = new ArticleFetchClient();
