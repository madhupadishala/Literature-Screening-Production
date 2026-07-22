import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import {
  buildEvidenceContext,
  type EvidenceContextPurpose,
} from "@/lib/ai/evidence-context-builder";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

interface PackageContextRequestBody {
  purpose?: EvidenceContextPurpose;
  query?: string;
  sourceId?: string;
  sourceTitle?: string;
  sourceAbstract?: string;
  sourceFullText?: string;
  metadata?: Record<string, unknown>;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(request, PERMISSIONS.EVIDENCE_CREATE);
    const body = (await request.json()) as PackageContextRequestBody;
    const context = await buildEvidenceContext({
      tenantId: principal.tenantId,
      purpose: body.purpose ?? "screening",
      query: body.query,
      sourceId: body.sourceId,
      sourceTitle: body.sourceTitle,
      sourceAbstract: body.sourceAbstract,
      sourceFullText: body.sourceFullText,
      actorId: principal.userId,
      requestId: request.headers.get("x-request-id") || undefined,
      correlationId: request.headers.get("x-correlation-id") || undefined,
      metadata: {
        ...(body.metadata ?? {}),
      },
    });
    return Response.json({ success: true, context });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
