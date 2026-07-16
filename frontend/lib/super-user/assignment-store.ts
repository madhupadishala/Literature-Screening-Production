export type AssignmentRole =
  | "SUPER_USER"
  | "WORKFLOW_MANAGER"
  | "HITS_USER"
  | "SCREENING_USER"
  | "INTAKE_USER"
  | "QC_USER";

export type AssignmentStatus =
  | "AVAILABLE"
  | "BUSY"
  | "OFFLINE"
  | "ON_LEAVE";

export type AssignableUser = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: AssignmentRole;
  status: AssignmentStatus;
  activePackages: number;
  maxPackages: number;
};

export type PackageAssignment = {
  id: string;
  packageId: string;
  tenantId: string;
  assignedToUserId: string;
  assignedToName: string;
  assignedBy: string;
  assignedAt: string;
  reason: string;
  isCurrent: boolean;
};

export type AssignmentResult = {
  ok: boolean;
  message: string;
  assignment?: PackageAssignment;
};

const users: AssignableUser[] = [
  {
    id: "USR-001",
    tenantId: "TENANT-CLINIXAI",
    name: "Screening User",
    email: "screening.user@clinixai.local",
    role: "SCREENING_USER",
    status: "AVAILABLE",
    activePackages: 3,
    maxPackages: 10,
  },
  {
    id: "USR-002",
    tenantId: "TENANT-CLINIXAI",
    name: "Intake User",
    email: "intake.user@clinixai.local",
    role: "INTAKE_USER",
    status: "AVAILABLE",
    activePackages: 5,
    maxPackages: 8,
  },
  {
    id: "USR-003",
    tenantId: "TENANT-CLINIXAI",
    name: "QC Reviewer",
    email: "qc.reviewer@clinixai.local",
    role: "QC_USER",
    status: "BUSY",
    activePackages: 8,
    maxPackages: 8,
  },
  {
    id: "USR-004",
    tenantId: "TENANT-CLINIXAI",
    name: "Workflow Manager",
    email: "workflow.manager@clinixai.local",
    role: "WORKFLOW_MANAGER",
    status: "AVAILABLE",
    activePackages: 2,
    maxPackages: 12,
  },
];

const assignments: PackageAssignment[] = [
  {
    id: "ASN-0001",
    packageId: "PKG-LIT-2026-0001",
    tenantId: "TENANT-CLINIXAI",
    assignedToUserId: "USR-001",
    assignedToName: "Screening User",
    assignedBy: "Workflow Manager",
    assignedAt: "2026-07-05T09:00:00+05:30",
    reason: "Initial screening assignment.",
    isCurrent: false,
  },
  {
    id: "ASN-0002",
    packageId: "PKG-LIT-2026-0001",
    tenantId: "TENANT-CLINIXAI",
    assignedToUserId: "USR-003",
    assignedToName: "QC Reviewer",
    assignedBy: "Super User",
    assignedAt: "2026-07-05T12:00:00+05:30",
    reason: "Routed to QC after screening completion.",
    isCurrent: true,
  },
];

export function getAssignableUsers(input?: {
  tenantId?: string;
  role?: AssignmentRole;
  availabilityOnly?: boolean;
}): AssignableUser[] {
  return users.filter((user) => {
    const tenantMatch = !input?.tenantId || user.tenantId === input.tenantId;
    const roleMatch = !input?.role || user.role === input.role;
    const availabilityMatch =
      !input?.availabilityOnly ||
      (user.status === "AVAILABLE" && user.activePackages < user.maxPackages);

    return tenantMatch && roleMatch && availabilityMatch;
  });
}

export function getPackageAssignments(packageId: string): PackageAssignment[] {
  return assignments
    .filter((assignment) => assignment.packageId === packageId)
    .sort(
      (a, b) =>
        new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime(),
    );
}

export function getCurrentAssignment(
  packageId: string,
): PackageAssignment | null {
  return (
    assignments.find(
      (assignment) =>
        assignment.packageId === packageId && assignment.isCurrent === true,
    ) ?? null
  );
}

export function assignPackage(input: {
  packageId: string;
  tenantId: string;
  assignedToUserId: string;
  assignedBy: string;
  reason: string;
}): AssignmentResult {
  const packageId = input.packageId.trim();
  const tenantId = input.tenantId.trim();
  const assignedToUserId = input.assignedToUserId.trim();
  const assignedBy = input.assignedBy.trim();
  const reason = input.reason.trim();

  if (!packageId) {
    return {
      ok: false,
      message: "Package ID is required.",
    };
  }

  if (!tenantId) {
    return {
      ok: false,
      message: "Tenant ID is required.",
    };
  }

  if (!assignedToUserId) {
    return {
      ok: false,
      message: "Assigned user is required.",
    };
  }

  if (!reason) {
    return {
      ok: false,
      message: "Assignment reason is mandatory.",
    };
  }

  const user = users.find((item) => item.id === assignedToUserId);

  if (!user) {
    return {
      ok: false,
      message: "Selected user was not found.",
    };
  }

  if (user.tenantId !== tenantId) {
    return {
      ok: false,
      message: "Tenant isolation failed. User does not belong to this tenant.",
    };
  }

  if (user.status !== "AVAILABLE") {
    return {
      ok: false,
      message: "Selected user is not currently available.",
    };
  }

  if (user.activePackages >= user.maxPackages) {
    return {
      ok: false,
      message: "Selected user workload limit has been reached.",
    };
  }

  for (const assignment of assignments) {
    if (assignment.packageId === packageId) {
      assignment.isCurrent = false;
    }
  }

  const newAssignment: PackageAssignment = {
    id: `ASN-${String(assignments.length + 1).padStart(4, "0")}`,
    packageId,
    tenantId,
    assignedToUserId: user.id,
    assignedToName: user.name,
    assignedBy,
    assignedAt: new Date().toISOString(),
    reason,
    isCurrent: true,
  };

  assignments.unshift(newAssignment);

  user.activePackages += 1;

  return {
    ok: true,
    message: "Package assigned successfully.",
    assignment: newAssignment,
  };
}