import { NextRequest, NextResponse } from "next/server";
import { searchAuditRecords } from "@/lib/audit/audit-store";
import type {
  AuditAction,
  AuditModule,
  AuditSeverity,
} from "@/lib/audit/audit-types";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("pageSize") ?? "10");

  const result = searchAuditRecords({
    page,
    pageSize,
    filters: {
      packageId: searchParams.get("packageId") ?? undefined,
      userId: searchParams.get("userId") ?? undefined,
      tenantId: searchParams.get("tenantId") ?? undefined,
      module: (searchParams.get("module") ?? "ALL") as AuditModule | "ALL",
      action: (searchParams.get("action") ?? "ALL") as AuditAction | "ALL",
      severity: (searchParams.get("severity") ?? "ALL") as AuditSeverity | "ALL",
      workflowStage: searchParams.get("workflowStage") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      search: searchParams.get("search") ?? undefined,
    },
  });

  return NextResponse.json({
    ok: true,
    module: "enterprise-audit-search",
    generatedAt: new Date().toISOString(),
    data: result,
  });
}