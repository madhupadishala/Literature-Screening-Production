import { NextRequest, NextResponse } from "next/server";
import {
  getAssignableUsers,
  type AssignmentRole,
} from "@/lib/super-user/assignment-store";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { routeErrorResponse } from "@/lib/api/route-error";

const validRoles: AssignmentRole[] = [
  "SUPER_USER",
  "WORKFLOW_MANAGER",
  "HITS_USER",
  "SCREENING_USER",
  "INTAKE_USER",
  "QC_USER",
];

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.SUPER_USER_CONSOLE_MANAGE);

    const { searchParams } = new URL(request.url);

    const roleParam = searchParams.get("role");
    const availabilityOnly = searchParams.get("availabilityOnly") === "true";

    const role =
      roleParam && validRoles.includes(roleParam as AssignmentRole)
        ? (roleParam as AssignmentRole)
        : undefined;

    const users = getAssignableUsers({
      // Previously: tenantId came straight from an unauthenticated query
      // param (`?tenantId=any-other-tenant`), so anyone could list any
      // tenant's users. Now bound to the authenticated caller's own
      // verified tenant.
      tenantId: principal.tenantKey,
      role,
      availabilityOnly,
    });

    return NextResponse.json({
      ok: true,
      module: "super-user-assignable-users",
      generatedAt: new Date().toISOString(),
      data: users,
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}