import { NextRequest, NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { knowledgeStore } from "@/lib/knowledge/repository/knowledge-store";
import type { CreateKnowledgeDocumentInput } from "@/lib/knowledge/repository/knowledge-types";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.CONFIG_VIEW);
    return NextResponse.json({
      status: await knowledgeStore.getStatus(principal.tenantId),
      documents: await knowledgeStore.list(principal.tenantId),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.SOURCE_MANAGE);
    const body = (await request.json()) as CreateKnowledgeDocumentInput;
    if (!body.title || !body.category || !body.version || !body.content) {
      throw new Error("title, category, version and content are required.");
    }
    const document = await knowledgeStore.create(
      { ...body, tenantId: principal.tenantId },
      principal.userId,
      request.headers.get("x-request-id"),
    );
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.CONFIG_APPROVE);
    const body = (await request.json()) as { documentId?: string; action?: "activate" | "supersede" };
    if (!body.documentId || !body.action) throw new Error("documentId and action are required.");
    const document = await knowledgeStore.updateStatus({
      tenantId: principal.tenantId,
      id: body.documentId,
      action: body.action,
      actorId: principal.userId,
      requestId: request.headers.get("x-request-id"),
    });
    if (!document) throw new Error("Knowledge document not found.");
    return NextResponse.json({ document });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
