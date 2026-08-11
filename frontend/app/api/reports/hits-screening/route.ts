import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { routeErrorResponse } from "@/lib/api/route-error";
import {
  generateHitsScreeningReport,
  REPORT_FIELDS,
  type ReportFieldId,
} from "@/lib/reporting/hits-screening-report-service";

const DEFAULT_FIELDS: ReportFieldId[] = [
  "pmid",
  "title",
  "screeningDecision",
  "screeningConfidence",
  "duplicateStatus",
  "processedAt",
];

// GET returns the available field catalog, so a client can build a
// field-picker UI without hardcoding the list.
export async function GET(request: NextRequest) {
  try {
    await requirePermission(request, PERMISSIONS.SEARCH_EXPORT);

    return NextResponse.json({ fields: REPORT_FIELDS });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

// POST generates and returns the actual .xlsx file.
export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.SEARCH_EXPORT);

    const body = await request.json().catch(() => ({}));

    const validFieldIds = new Set(REPORT_FIELDS.map((field) => field.id));
    const requestedFields: ReportFieldId[] = Array.isArray(body.fields)
      ? body.fields.filter((id: unknown): id is ReportFieldId => typeof id === "string" && validFieldIds.has(id as ReportFieldId))
      : [];

    const fields = requestedFields.length > 0 ? requestedFields : DEFAULT_FIELDS;

    const decisions = Array.isArray(body.decisions)
      ? body.decisions.filter((d: unknown): d is string => typeof d === "string")
      : undefined;

    const buffer = await generateHitsScreeningReport({
      // The caller can never choose which tenant this reports on --
      // always the authenticated principal's own tenant.
      tenantId: principal.tenantId,
      dateFrom: typeof body.dateFrom === "string" ? body.dateFrom : undefined,
      dateTo: typeof body.dateTo === "string" ? body.dateTo : undefined,
      decisions,
      titleContains: typeof body.titleContains === "string" ? body.titleContains : undefined,
      fields,
    });

    const filename = `literature-line-listing-${new Date().toISOString().slice(0, 10)}.xlsx`;

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
