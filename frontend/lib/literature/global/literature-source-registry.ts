import type { LiteratureSource } from "./literature-source-types";

const DEFAULT_SOURCES: LiteratureSource[] = [
  {
    id: "pubmed",
    name: "PubMed",
    type: "pubmed",
    language: "en",
    requiresLicense: false,
    enabled: true,
  },
  {
    id: "europe-pmc",
    name: "Europe PMC",
    type: "europe_pmc",
    language: "en",
    requiresLicense: false,
    enabled: true,
  },
  {
    id: "jstage",
    name: "J-STAGE",
    type: "jstage",
    country: "JP",
    language: "ja",
    requiresLicense: false,
    enabled: true,
  },
  {
    id: "koreamed",
    name: "KoreaMed",
    type: "koreamed",
    country: "KR",
    language: "ko",
    requiresLicense: false,
    enabled: true,
  },
  {
    id: "cnki",
    name: "CNKI",
    type: "cnki",
    country: "CN",
    language: "zh",
    requiresLicense: true,
    enabled: false,
  },
];

class LiteratureSourceRegistry {
  private sources = [...DEFAULT_SOURCES];

  list() {
    return [...this.sources];
  }
}

export const literatureSourceRegistry = new LiteratureSourceRegistry();