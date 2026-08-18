import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { routeErrorResponse } from "@/lib/api/route-error";
import { createReportDefinition, listReportDefinitions } from "@/lib/reporting/report-definitions-service";
import { REPORT_FIELDS, type ReportFieldId } from "@/lib/reporting/hits-screening-report-service";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.SEARCH_EXPORT);

    const definitions = await listReportDefinitions(principal.tenantId);

    return NextResponse.json({ definitions, availableFields: REPORT_FIELDS });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.SEARCH_EXPORT);

    const body = await request.json().catch(() => ({}));

    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return NextResponse.json({ error: "A report name is required." }, { status: 400 });
    }

    const validFieldIds = new Set(REPORT_FIELDS.map((field) => field.id));
    const fields: ReportFieldId[] = Array.isArray(body.fields)
      ? body.fields.filter((id: unknown): id is ReportFieldId => typeof id === "string" && validFieldIds.has(id as ReportFieldId))
      : [];

    if (fields.length === 0) {
      return NextResponse.json({ error: "At least one field must be selected." }, { status: 400 });
    }

    const definition = await createReportDefinition({
      tenantId: principal.tenantId,
      name: body.name.trim(),
      description: typeof body.description === "string" ? body.description : undefined,
      filters: {
        dateFrom: typeof body.filters?.dateFrom === "string" ? body.filters.dateFrom : undefined,
        dateTo: typeof body.filters?.dateTo === "string" ? body.filters.dateTo : undefined,
        decisions: Array.isArray(body.filters?.decisions) ? body.filters.decisions : undefined,
        titleContains: typeof body.filters?.titleContains === "string" ? body.filters.titleContains : undefined,
      },
      fields,
      createdBy: principal.userId,
    });

    return NextResponse.json({ definition }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
