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
      status: knowledgeStore.getStatus(principal.tenantId),
      documents: knowledgeStore.list(principal.tenantId),
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
    const document = knowledgeStore.create({
      ...body,
      tenantId: principal.tenantId,
    });
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}