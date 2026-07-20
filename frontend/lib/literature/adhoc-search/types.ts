export const SUPPORTED_SOURCE_KEYS = [
  "PUBMED",
  "EUROPE_PMC",
  "CROSSREF",
] as const;

export type SupportedSourceKey =
  (typeof SUPPORTED_SOURCE_KEYS)[number];

export interface AdHocSearchCriteria {
  searchString?: string;
  pmid?: string;
  doi?: string;
  product?: string;
  productId?: string;
  whodrugId?: string;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  sourceKeys?: string[];
  limit?: number;
}

export interface ResolvedProductContext {
  matched: boolean;
  productId?: string;
  whodrugId?: string;
  preferredName?: string;
  searchTerms: string[];
  sourceRecord?: Record<string, unknown>;
}

export interface LiteratureSource {
  sourceKey: string;
  displayName: string;
  connectorType: string;
  enabled: boolean;
  baseUrl: string;
  maxResults: number;
  settings: Record<string, unknown>;
}

export interface NormalizedLiteratureResult {
  sourceKey: string;
  sourceRecordId: string;
  pmid?: string;
  doi?: string;
  title: string;
  authors: string[];
  journal?: string;
  publicationDate?: string;
  language?: string;
  publicationType?: string;
  abstractText?: string;
  landingUrl?: string;
  fullTextStatus:
    | "open_access"
    | "licensed"
    | "abstract_only"
    | "unavailable"
    | "unknown";
  matchMetadata: Record<string, unknown>;
  dedupeKey: string;
  duplicateGroup?: string;
}

export interface ConnectorSearchInput {
  criteria: AdHocSearchCriteria;
  resolvedProduct: ResolvedProductContext;
  source: LiteratureSource;
  limit: number;
}

export interface ConnectorSearchOutput {
  sourceKey: string;
  translatedQuery: string;
  results: NormalizedLiteratureResult[];
  durationMs: number;
}

export interface LiteratureConnector {
  sourceKey: SupportedSourceKey;
  search: (input: ConnectorSearchInput) => Promise<ConnectorSearchOutput>;
}

export interface AdHocSearchExecution {
  searchId: string;
  searchKey: string;
  status: "completed" | "partial" | "failed";
  resultCount: number;
  criteria: AdHocSearchCriteria;
  translatedQueries: Record<string, string>;
  connectorErrors: Record<string, string>;
  results: Array<NormalizedLiteratureResult & { id: string }>;
  durationMs: number;
}
