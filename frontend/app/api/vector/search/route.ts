import { NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { searchControlledKnowledge } from "@/lib/knowledge/retrieval/controlled-knowledge-service";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import type { VectorSearchRequest, VectorSearchResponse } from "@/lib/vector/vector-types";

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.CONFIG_VIEW);
    const body = await request.json() as VectorSearchRequest;
    const controlled = await searchControlledKnowledge({
      tenantId: principal.tenantId,
      query: String(body.query || ""),
      mode: body.mode,
      topK: body.topK,
      minScore: body.minScore,
      actorId: principal.userId,
      requestId: request.headers.get("x-request-id") || undefined,
      correlationId: request.headers.get("x-correlation-id") || undefined,
    });
    const data: VectorSearchResponse = {
      tenantId: controlled.tenantId,
      query: controlled.query,
      mode: controlled.mode,
      results: controlled.results.map((result) => ({
        document: {
          id: result.citation.chunkId,
          tenantId: controlled.tenantId,
          content: result.content,
          normalizedContent: result.content.replace(/\s+/gu, " ").trim().toLowerCase(),
          embedding: [],
          metadata: {
            tenantId: controlled.tenantId,
            sourceType: "knowledge_base",
            sourceId: result.citation.knowledgeObjectId,
            sourceName: result.citation.title,
            versionId: result.citation.version,
            createdAt: controlled.generatedAt,
            tags: [result.citation.domain, result.citation.section],
            status: "active",
          },
        },
        score: result.score,
        matchedBy: controlled.mode,
        explanation: `Governed pgvector match from ${result.citation.citationId}.`,
      })),
      totalResults: controlled.results.length,
      generatedAt: controlled.generatedAt,
    };
    return Response.json({ success: true, data });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
