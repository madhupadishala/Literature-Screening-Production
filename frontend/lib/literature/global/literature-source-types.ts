export type LiteratureSourceType =
  | "pubmed"
  | "europe_pmc"
  | "crossref"
  | "clinicaltrials"
  | "jstage"
  | "koreamed"
  | "scielo"
  | "lilacs"
  | "cnki"
  | "wanfang"
  | "ichushi"
  | "custom";

export interface LiteratureSource {
  id: string;
  name: string;
  type: LiteratureSourceType;
  country?: string;
  language?: string;
  requiresLicense: boolean;
  enabled: boolean;
}

export interface LiteratureRoutingRequest {
  tenantId: string;
  countries?: string[];
  languages?: string[];
}

export interface LiteratureRoutingResult {
  sources: LiteratureSource[];
  generatedAt: string;
}

export interface LiteratureSourceStatus {
  totalSources: number;
  enabledSources: number;
}