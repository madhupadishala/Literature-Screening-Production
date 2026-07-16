import { NextRequest, NextResponse } from "next/server";
import {
  getAssignableUsers,
  type AssignmentRole,
} from "@/lib/super-user/assignment-store";

const validRoles: AssignmentRole[] = [
  "SUPER_USER",
  "WORKFLOW_MANAGER",
  "HITS_USER",
  "SCREENING_USER",
  "INTAKE_USER",
  "QC_USER",
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const tenantId = searchParams.get("tenantId") ?? "TENANT-CLINIXAI";
  const roleParam = searchParams.get("role");
  const availabilityOnly = searchParams.get("availabilityOnly") === "true";

  const role =
    roleParam && validRoles.includes(roleParam as AssignmentRole)
      ? (roleParam as AssignmentRole)
      : undefined;

  const users = getAssignableUsers({
    tenantId,
    role,
    availabilityOnly,
  });

  return NextResponse.json({
    ok: true,
    module: "super-user-assignable-users",
    generatedAt: new Date().toISOString(),
    data: users,
  });
}