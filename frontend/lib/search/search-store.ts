import type {
  SearchIndexRecord,
  SearchRequest,
  SearchResponse,
  SearchResult,
} from "./search-types";

const searchIndex = new Map<string, SearchIndexRecord>();

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function createSearchId(record: SearchIndexRecord): string {
  return [
    record.tenantId,
    record.type,
    record.sourceModule,
    record.sourceId,
  ].join(":");
}

function keywordScore(query: string, record: SearchIndexRecord): number {
  const normalizedQuery = normalize(query);
  const searchableText = normalize(
    [
      record.title,
      record.summary,
      record.content,
      record.productName,
      record.country,
      record.workflowStage,
      ...(record.tags ?? []),
    ]
      .filter(Boolean)
      .join(" "),
  );

  const queryTokens = normalizedQuery.split(" ").filter(Boolean);

  if (queryTokens.length === 0) {
    return 0;
  }

  const matchedTokens = queryTokens.filter((token) =>
    searchableText.includes(token),
  );

  return matchedTokens.length / queryTokens.length;
}

function metadataMatches(
  request: SearchRequest,
  record: SearchIndexRecord,
): boolean {
  if (record.tenantId !== request.tenantId) {
    return false;
  }

  if (request.types?.length && !request.types.includes(record.type)) {
    return false;
  }

  if (
    request.productName &&
    record.productName?.toLowerCase() !== request.productName.toLowerCase()
  ) {
    return false;
  }

  if (
    request.country &&
    record.country?.toLowerCase() !== request.country.toLowerCase()
  ) {
    return false;
  }

  if (
    request.workflowStage &&
    record.workflowStage?.toLowerCase() !== request.workflowStage.toLowerCase()
  ) {
    return false;
  }

  if (
    request.tags?.length &&
    !request.tags.some((tag) => record.tags?.includes(tag))
  ) {
    return false;
  }

  return true;
}

export class SearchStore {
  upsert(record: SearchIndexRecord): SearchIndexRecord {
    const id = createSearchId(record);

    const existing = searchIndex.get(id);

    const storedRecord: SearchIndexRecord = {
      ...record,
      id,
      createdAt: existing?.createdAt ?? record.createdAt,
      updatedAt: new Date().toISOString(),
    };

    searchIndex.set(id, storedRecord);

    return storedRecord;
  }

  search(request: SearchRequest): SearchResponse {
    const mode = request.mode ?? "hybrid";
    const topK = request.topK ?? 20;
    const minScore = request.minScore ?? 0;

    if (!request.tenantId) {
      throw new Error("tenantId is required.");
    }

    if (!request.query.trim()) {
      throw new Error("Search query cannot be empty.");
    }

    const results: SearchResult[] = Array.from(searchIndex.values())
      .filter((record) => metadataMatches(request, record))
      .map((record) => {
        const lexicalScore = keywordScore(request.query, record);

        const score =
          mode === "semantic"
            ? lexicalScore
            : mode === "keyword"
              ? lexicalScore
              : lexicalScore;

        return {
          record,
          score: Number(score.toFixed(6)),
          matchedBy: mode,
          explanation: `Matched ${record.type} from ${record.sourceModule} using ${mode} search.`,
        };
      })
      .filter((result) => result.score >= minScore)
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);

    return {
      tenantId: request.tenantId,
      query: request.query,
      mode,
      results,
      totalResults: results.length,
      generatedAt: new Date().toISOString(),
    };
  }

  list(tenantId: string): SearchIndexRecord[] {
    return Array.from(searchIndex.values()).filter(
      (record) => record.tenantId === tenantId,
    );
  }

  clearTenant(tenantId: string): number {
    let deleted = 0;

    for (const [id, record] of searchIndex.entries()) {
      if (record.tenantId === tenantId) {
        searchIndex.delete(id);
        deleted += 1;
      }
    }

    return deleted;
  }

  seedDemoRecords(tenantId: string): void {
    if (this.list(tenantId).length > 0) {
      return;
    }

    const now = new Date().toISOString();

    this.upsert({
      id: "",
      tenantId,
      type: "hit",
      sourceModule: "hits",
      sourceId: "hit-demo-001",
      title: "Potential literature hit detected",
      summary: "Article contains company product and adverse event signal.",
      content:
        "Literature hit identified for company product with adverse reaction and case report signals.",
      tags: ["literature", "hit", "ai"],
      productName: "Demo Product",
      country: "India",
      workflowStage: "hits",
      createdAt: now,
      href: "/hits",
    });

    this.upsert({
      id: "",
      tenantId,
      type: "screening",
      sourceModule: "screening",
      sourceId: "screening-demo-001",
      title: "Valid screening case",
      summary: "Patient, reporter, product and adverse event criteria detected.",
      content:
        "Screening completed with identifiable patient, identifiable reporter, suspect product and adverse event.",
      tags: ["screening", "validity"],
      productName: "Demo Product",
      country: "India",
      workflowStage: "screening",
      createdAt: now,
      href: "/screening",
    });

    this.upsert({
      id: "",
      tenantId,
      type: "evidence",
      sourceModule: "evidence",
      sourceId: "evidence-demo-001",
      title: "Evidence package generated",
      summary: "Evidence package contains article, RAG context, AI result and review.",
      content:
        "Evidence package includes source article, RAG chunks, AI runtime, reviewer decision and audit references.",
      tags: ["evidence", "audit", "package"],
      workflowStage: "evidence",
      createdAt: now,
      href: "/evidence",
    });
  }
}

export const searchStore = new SearchStore();