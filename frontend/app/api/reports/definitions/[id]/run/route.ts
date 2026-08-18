import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { routeErrorResponse } from "@/lib/api/route-error";
import { getReportDefinition, markReportDefinitionRun } from "@/lib/reporting/report-definitions-service";
import { generateHitsScreeningReport } from "@/lib/reporting/hits-screening-report-service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.SEARCH_EXPORT);
    const { id } = await params;

    const definition = await getReportDefinition(principal.tenantId, id);

    if (!definition) {
      return NextResponse.json({ error: "Report definition not found." }, { status: 404 });
    }

    const buffer = await generateHitsScreeningReport({
      tenantId: principal.tenantId,
      dateFrom: definition.filters.dateFrom,
      dateTo: definition.filters.dateTo,
      decisions: definition.filters.decisions,
      titleContains: definition.filters.titleContains,
      fields: definition.fields,
    });

    await markReportDefinitionRun(principal.tenantId, id);

    const safeName = definition.name.replace(/[^a-zA-Z0-9-_]+/g, "-").slice(0, 60);
    const filename = `${safeName}-${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
