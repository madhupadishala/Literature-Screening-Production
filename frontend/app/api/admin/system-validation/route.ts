import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import {
  generateSystemValidationPackage,
  getSystemValidationPackage,
  listSystemValidationPackages,
  recordSystemValidationSignoff,
} from "@/lib/validation/system-validation-service";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(request, PERMISSIONS.RELEASE_VIEW);
    const id = request.nextUrl.searchParams.get("id")?.trim();
    if (id) {
      const validationPackage = await getSystemValidationPackage({
        tenantId: principal.tenantId,
        id,
      });
      return Response.json({
        success: true,
        data: { validationPackage },
      });
    }

    const packages = await listSystemValidationPackages({
      tenantId: principal.tenantId,
      limit: Number(request.nextUrl.searchParams.get("limit") || 50),
    });
    return Response.json({ success: true, data: { packages } });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(request, PERMISSIONS.RELEASE_MANAGE);
    const body = await request.json();
    const action = String(body.action || "GENERATE").toUpperCase();

    if (action === "GENERATE") {
      const validationPackage = await generateSystemValidationPackage({
        principal,
        reason: String(body.reason || ""),
      });
      return Response.json(
        { success: true, data: { validationPackage } },
        { status: 201 },
      );
    }

    if (action === "SIGNOFF") {
      const validationPackage = await recordSystemValidationSignoff({
        principal,
        validationPackageId: String(body.validationPackageId || ""),
        signoffRole: String(body.signoffRole || "") as
          | "VALIDATION_OWNER"
          | "QUALITY_APPROVER"
          | "RELEASE_APPROVER",
        decision: String(body.decision || "") as "APPROVED" | "REJECTED",
        comments: String(body.comments || ""),
      });
      return Response.json({
        success: true,
        data: { validationPackage },
      });
    }

    return Response.json(
      { success: false, error: "Unsupported validation action." },
      { status: 400 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
