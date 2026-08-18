import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { routeErrorResponse } from "@/lib/api/route-error";
import {
  deleteReportDefinition,
  getReportDefinition,
  updateReportDefinition,
} from "@/lib/reporting/report-definitions-service";
import { REPORT_FIELDS, type ReportFieldId } from "@/lib/reporting/hits-screening-report-service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.SEARCH_EXPORT);
    const { id } = await params;

    const definition = await getReportDefinition(principal.tenantId, id);

    if (!definition) {
      return NextResponse.json({ error: "Report definition not found." }, { status: 404 });
    }

    return NextResponse.json({ definition });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.SEARCH_EXPORT);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const validFieldIds = new Set(REPORT_FIELDS.map((field) => field.id));
    const fields: ReportFieldId[] | undefined = Array.isArray(body.fields)
      ? body.fields.filter((fid: unknown): fid is ReportFieldId => typeof fid === "string" && validFieldIds.has(fid as ReportFieldId))
      : undefined;

    const definition = await updateReportDefinition(principal.tenantId, id, {
      name: typeof body.name === "string" ? body.name.trim() : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      filters: body.filters,
      fields,
    });

    if (!definition) {
      return NextResponse.json({ error: "Report definition not found." }, { status: 404 });
    }

    return NextResponse.json({ definition });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.SEARCH_EXPORT);
    const { id } = await params;

    const deleted = await deleteReportDefinition(principal.tenantId, id);

    if (!deleted) {
      return NextResponse.json({ error: "Report definition not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
