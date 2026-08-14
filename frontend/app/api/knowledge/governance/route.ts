import { NextRequest, NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { knowledgeGovernanceService } from "@/lib/knowledge/governance/knowledge-governance-service";
import type {
  CreateGovernanceRecordInput,
  GovernanceActionInput,
} from "@/lib/knowledge/governance/knowledge-governance-types";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.CONFIG_VIEW);
    return NextResponse.json({
      status: knowledgeGovernanceService.getStatus(principal.tenantId),
      records: knowledgeGovernanceService.listRecords(principal.tenantId),
      auditEvents: knowledgeGovernanceService.listAuditEvents(principal.tenantId),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.CONFIG_CREATE);
    const body = (await request.json()) as CreateGovernanceRecordInput;
    if (!body.knowledgeDocumentId || !body.version) {
      throw new Error("knowledgeDocumentId and version are required.");
    }
    const record = knowledgeGovernanceService.createRecord({
      ...body,
      tenantId: principal.tenantId,
    });
    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.CONFIG_APPROVE);
    const body = (await request.json()) as GovernanceActionInput;
    if (!body.governanceRecordId || !body.action) {
      throw new Error("governanceRecordId and action are required.");
    }
    const result = knowledgeGovernanceService.applyAction({
      ...body,
      tenantId: principal.tenantId,
      actor: principal.displayName,
    });
    return NextResponse.json(result);
  } catch (error) {
    return routeErrorResponse(error);
  }
}