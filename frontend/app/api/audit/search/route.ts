import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { recordAuditExport, searchAuditRecords } from "@/lib/audit/audit-store";
import type { AuditSearchFilters, AuditSeverity } from "@/lib/audit/audit-types";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function filters(request: NextRequest): AuditSearchFilters {
  const value = (name: string) => request.nextUrl.searchParams.get(name)?.trim() || undefined;
  return {
    packageId: value("packageId"),
    actorId: value("actorId"),
    eventType: value("eventType"),
    eventCategory: value("eventCategory"),
    outcome: value("outcome"),
    severity: (value("severity") || "ALL") as AuditSeverity | "ALL",
    dateFrom: value("dateFrom"),
    dateTo: value("dateTo"),
    search: value("search"),
  };
}

function csvCell(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const exportRequested = request.nextUrl.searchParams.get("format") === "csv";
    const principal = await requirePermission(
      request,
      exportRequested ? PERMISSIONS.AUDIT_EXPORT : PERMISSIONS.AUDIT_VIEW,
    );
    const rawPage = Number(request.nextUrl.searchParams.get("page") || 1);
    const rawPageSize = Number(request.nextUrl.searchParams.get("pageSize") || 25);
    const activeFilters = filters(request);
    const result = await searchAuditRecords({
      principal,
      filters: activeFilters,
      page: Number.isFinite(rawPage) ? rawPage : 1,
      pageSize: exportRequested ? 250 : Number.isFinite(rawPageSize) ? rawPageSize : 25,
    });

    if (exportRequested) {
      await recordAuditExport({
        principal,
        filters: activeFilters,
        exportedCount: result.records.length,
      });
      const header = [
        "Event ID",
        "Occurred At",
        "Category",
        "Event Type",
        "Outcome",
        "Severity",
        "Package ID",
        "Package Key",
        "Actor ID",
        "Actor",
        "Role",
        "Request ID",
        "Correlation ID",
        "Source IP",
        "Details",
      ];
      const rows = result.records.map((record) =>
        [
          record.id,
          record.performedAt,
          record.eventCategory,
          record.eventType,
          record.outcome,
          record.severity,
          record.packageId,
          record.packageKey,
          record.performedBy.id,
          record.performedBy.name,
          record.performedBy.role,
          record.requestId,
          record.correlationId,
          record.ipAddress,
          record.details,
        ]
          .map(csvCell)
          .join(","),
      );
      return new Response([header.map(csvCell).join(","), ...rows].join("\r\n"), {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Disposition": `attachment; filename="clinixai-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
          "Content-Type": "text/csv; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    return Response.json({ success: true, data: result });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
