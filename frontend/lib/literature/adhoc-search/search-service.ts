import "server-only";

import { randomUUID } from "node:crypto";
import { getLiteratureConnector } from "@/lib/literature/adhoc-search/connector-registry";
import {
  normalizeSearchCriteria,
  validateSearchGuard,
} from "@/lib/literature/adhoc-search/query-builder";
import { resolveProductContext } from "@/lib/literature/adhoc-search/product-resolver";
import {
  completeSearchExecution,
  createSearchExecution,
  listLiteratureSources,
  storeSearchResults,
} from "@/lib/literature/adhoc-search/search-repository";
import type {
  AdHocSearchCriteria,
  AdHocSearchExecution,
  NormalizedLiteratureResult,
} from "@/lib/literature/adhoc-search/types";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";

function markDuplicateGroups(
  results: NormalizedLiteratureResult[],
): NormalizedLiteratureResult[] {
  const groups = new Map<string, NormalizedLiteratureResult[]>();

  for (const result of results) {
    const group = groups.get(result.dedupeKey) || [];
    group.push(result);
    groups.set(result.dedupeKey, group);
  }

  const duplicateGroupIds = new Map<string, string>();
  for (const [dedupeKey, group] of groups.entries()) {
    if (group.length > 1) {
      duplicateGroupIds.set(
        dedupeKey,
        `DUP-${randomUUID().slice(0, 8)}-${dedupeKey.slice(0, 24)}`,
      );
    }
  }

  return results.map((result) => {
    const group = groups.get(result.dedupeKey) || [];
    return {
      ...result,
      duplicateGroup: duplicateGroupIds.get(result.dedupeKey),
      matchMetadata: {
        ...result.matchMetadata,
        duplicateSourceCount: group.length,
        duplicateSources: group.map((item) => item.sourceKey),
      },
    };
  });
}

export async function executeAdHocSearch(input: {
  principal: RequestPrincipal;
  criteria: AdHocSearchCriteria;
}): Promise<AdHocSearchExecution> {
  const started = Date.now();
  const criteria = normalizeSearchCriteria(input.criteria);
  const allSources = await listLiteratureSources(input.principal);

  const requestedSourceKeys = criteria.sourceKeys || [];
  const selectedSources =
    requestedSourceKeys.length > 0
      ? allSources.filter((source) =>
          requestedSourceKeys.includes(source.sourceKey),
        )
      : allSources.filter((source) => source.enabled);

  const disabledRequested = requestedSourceKeys.filter(
    (sourceKey) =>
      !selectedSources.some(
        (source) => source.sourceKey === sourceKey && source.enabled,
      ),
  );

  if (disabledRequested.length > 0) {
    throw new Error(
      `Selected database is disabled or unavailable: ${disabledRequested.join(", ")}`,
    );
  }

  const executableSources = selectedSources.filter((source) => source.enabled);
  if (executableSources.length === 0) {
    throw new Error(
      "No enabled literature database is available for this tenant.",
    );
  }

  validateSearchGuard(criteria, executableSources.length);

  const resolvedProduct = await resolveProductContext({
    tenantId: input.principal.tenantId,
    criteria,
  });

  const search = await createSearchExecution({
    principal: input.principal,
    criteria,
    selectedSources: executableSources.map((source) => source.sourceKey),
  });

  const connectorOutputs = await Promise.allSettled(
    executableSources.map(async (source) => {
      const connector = getLiteratureConnector(source.sourceKey);
      return connector.search({
        criteria,
        resolvedProduct,
        source,
        limit: Math.min(Number(criteria.limit || 50), source.maxResults),
      });
    }),
  );

  const translatedQueries: Record<string, string> = {};
  const connectorErrors: Record<string, string> = {};
  const rawResults: NormalizedLiteratureResult[] = [];

  connectorOutputs.forEach((output, index) => {
    const source = executableSources[index];

    if (output.status === "fulfilled") {
      translatedQueries[source.sourceKey] = output.value.translatedQuery;
      rawResults.push(...output.value.results);
      return;
    }

    connectorErrors[source.sourceKey] =
      output.reason instanceof Error
        ? output.reason.message
        : String(output.reason);
  });

  const results = markDuplicateGroups(rawResults);
  const storedResults = await storeSearchResults({
    principal: input.principal,
    searchId: search.id,
    results,
  });

  const successfulConnectors =
    executableSources.length - Object.keys(connectorErrors).length;

  const status =
    successfulConnectors === 0
      ? "failed"
      : Object.keys(connectorErrors).length > 0
        ? "partial"
        : "completed";

  const durationMs = Date.now() - started;

  await completeSearchExecution({
    searchId: search.id,
    status,
    resultCount: storedResults.length,
    durationMs,
    translatedQueries,
    connectorErrors,
  });

  return {
    searchId: search.id,
    searchKey: search.searchKey,
    status,
    resultCount: storedResults.length,
    criteria,
    translatedQueries,
    connectorErrors,
    results: storedResults,
    durationMs,
  };
}
