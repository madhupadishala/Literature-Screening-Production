import "server-only";

import { pubMedConnector } from "@/lib/literature/adhoc-search/connectors/pubmed";
import { europePmcConnector } from "@/lib/literature/adhoc-search/connectors/europe-pmc";
import { crossrefConnector } from "@/lib/literature/adhoc-search/connectors/crossref";
import type {
  LiteratureConnector,
  SupportedSourceKey,
} from "@/lib/literature/adhoc-search/types";

const CONNECTORS: Record<SupportedSourceKey, LiteratureConnector> = {
  PUBMED: pubMedConnector,
  EUROPE_PMC: europePmcConnector,
  CROSSREF: crossrefConnector,
};

export function getLiteratureConnector(
  sourceKey: string,
): LiteratureConnector {
  const connector = CONNECTORS[sourceKey as SupportedSourceKey];
  if (!connector) {
    throw new Error(
      `No executable connector adapter is registered for ${sourceKey}.`,
    );
  }
  return connector;
}
