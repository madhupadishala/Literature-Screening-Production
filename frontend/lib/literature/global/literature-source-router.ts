import { literatureSourceRegistry } from "./literature-source-registry";

import type {
  LiteratureRoutingRequest,
  LiteratureRoutingResult,
  LiteratureSourceStatus,
} from "./literature-source-types";

class LiteratureSourceRouter {
  route(
    request: LiteratureRoutingRequest,
  ): LiteratureRoutingResult {
    const sources = literatureSourceRegistry
      .list()
      .filter((source) => {
        if (!source.enabled) {
          return false;
        }

        if (
          request.languages?.length &&
          source.language &&
          !request.languages.includes(source.language)
        ) {
          return false;
        }

        if (
          request.countries?.length &&
          source.country &&
          !request.countries.includes(source.country)
        ) {
          return false;
        }

        return true;
      });

    return {
      sources,
      generatedAt: new Date().toISOString(),
    };
  }

  getStatus(): LiteratureSourceStatus {
    const sources = literatureSourceRegistry.list();

    return {
      totalSources: sources.length,
      enabledSources: sources.filter((item) => item.enabled).length,
    };
  }
}

export const literatureSourceRouter = new LiteratureSourceRouter();