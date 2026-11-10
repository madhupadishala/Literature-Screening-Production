import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { createAIRequestId } from "@/lib/ai/ai-runtime";
import { createScreeningService } from "@/lib/adapters/agentic-ai-screening-adapter";
import type { ScreeningService, ScreeningRecord, ScreeningCriteria, ScreeningDecision } from "@/lib/contracts/screening";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { UNIFIED_PERMISSIONS } from "@/lib/rbac/unified-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Screening service instance (lazy initialization)
let screeningService: ScreeningService | null = null;

function getScreeningService(): ScreeningService {
  if (!screeningService) {
    screeningService = createScreeningService();
  }
  return screeningService;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validArticle(value: unknown): value is {
  pmid: string;
  title: string;
  abstract?: string;
  authors?: string[];
  journal?: string;
  publication_date?: string;
  doi?: string;
  keywords?: string[];
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const article = value as Partial<{
    pmid: string;
    title: string;
    abstract?: string;
    authors?: string[];
    journal?: string;
    publication_date?: string;
    doi?: string;
    keywords?: string[];
  }>;
  return nonEmpty(article.pmid) && nonEmpty(article.title);
}

export async function POST(request: NextRequest): Promise<Response> {
  const correlationId =
    request.headers.get("x-correlation-id") ||
    request.headers.get("x-request-id") ||
    createAIRequestId("correlation-screening");

  try {
    // Use unified permission (SCREENING_EXECUTE from unified permissions)
    const principal = await requirePermission(request, UNIFIED_PERMISSIONS.SCREENING_EXECUTE as any);
    const body = (await request.json()) as { article?: unknown };
    if (!validArticle(body.article)) {
      return Response.json(
        { success: false, correlationId, error: "Valid article.pmid and article.title are required." },
        { status: 400, headers: { "x-correlation-id": correlationId } },
      );
    }

    const article = body.article;
    const normalized: ScreeningRecord = {
      id: article.pmid.trim(),
      title: article.title.trim(),
      authors: Array.isArray(article.authors)
        ? article.authors.filter(nonEmpty).map((author) => author.trim())
        : [],
      abstract: article.abstract || "",
      // Optional fields
      journal: article.journal,
      year: article.publication_date ? new Date(article.publication_date).getFullYear() : undefined,
      doi: article.doi,
      pmid: article.pmid.trim(),
      keywords: article.keywords,
    };

    // Get default screening criteria (in production, this would come from project config)
    const criteria: ScreeningCriteria = {
      inclusionCriteria: ["human", "adverse event", "drug exposure"],
      exclusionCriteria: ["animal only", "in vitro only", "no drug"],
    };

    const service = getScreeningService();
    const result = await service.screenRecord(normalized, criteria);

    // Convert ScreeningDecision to legacy format for backward compatibility
    const legacyResult = {
      decision: result.decision,
      confidence: result.confidence,
      rationale: result.rationale,
      matchedCriteria: result.matchedCriteria,
      aiExecution: result.aiExecution,
    };

    return Response.json(
      { success: true, correlationId, processedAt: new Date().toISOString(), data: legacyResult },
      { status: 200, headers: { "x-correlation-id": correlationId } },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    await requirePermission(request, UNIFIED_PERMISSIONS.SCREENING_REVIEW as any);
    const service = getScreeningService();
    // Note: adapter doesn't have history, would need to be implemented
    return Response.json({ success: true, status: "ok", history: [] });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
