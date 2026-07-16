export type PackageState =
  | "NEW"
  | "HITS_RUNNING"
  | "HITS_COMPLETE"
  | "HITS_REVIEW"
  | "SCREENING_RUNNING"
  | "SCREENING_COMPLETE"
  | "SCREENING_REVIEW"
  | "INTAKE_INPUT_CREATED"
  | "LOCKED"
  | "UNLOCKED"
  | "ROUTE_BACK"
  | "OVERRIDDEN"
  | "COMPLETED";

export type PackageRecord = {
  packageId: string;
  pmid: string;
  title: string;
  product: string;
  tenantId: string;
  tenantName: string;
  environment: "PROD" | "UAT" | "TRAINING";
  currentState: PackageState;
  assignedTo: string;
  locked: boolean;
  lockedAt: string;
  lockedBy: string;
  confidence: number;
  version: number;
  updatedAt: string;
};

export type PackageAudit = {
  id: string;
  packageId: string;
  timestamp: string;
  action: string;
  oldValue: string;
  newValue: string;
  comment: string;
  performedBy: string;
  role: string;
  tenantId: string;
  environment: string;
};

type ActionInput = {
  packageId: string;
  action: "ASSIGN" | "UNLOCK" | "LOCK" | "OVERRIDE" | "ROUTE_BACK" | "FORCE_RERUN";
  assignedTo?: string;
  routeTo?: PackageState;
  comment?: string;
  performedBy?: string;
  role?: string;
  tenantId?: string;
  environment?: string;
};

const now = () => new Date().toISOString();

let packages: PackageRecord[] = [
  {
    packageId: "PMID_DEMO001",
    pmid: "DEMO001",
    title: "Acetaminophen-induced acute liver injury: a case report from Germany",
    product: "Paracetamol",
    tenantId: "demo-tenant",
    tenantName: "Demo Tenant",
    environment: "PROD",
    currentState: "SCREENING_REVIEW",
    assignedTo: "QC User",
    locked: true,
    lockedAt: "2026-07-05T10:42:00.000Z",
    lockedBy: "system",
    confidence: 83,
    version: 1,
    updatedAt: "2026-07-05T10:42:00.000Z",
  },
  {
    packageId: "PMID_VAL_001",
    pmid: "VAL_001",
    title: "VaxGuard special situation literature case",
    product: "VaxGuard",
    tenantId: "demo-tenant",
    tenantName: "Demo Tenant",
    environment: "PROD",
    currentState: "LOCKED",
    assignedTo: "PV Lead",
    locked: true,
    lockedAt: "2026-07-05T11:10:00.000Z",
    lockedBy: "system",
    confidence: 92,
    version: 1,
    updatedAt: "2026-07-05T11:10:00.000Z",
  },
  {
    packageId: "PMID_VAL_002",
    pmid: "VAL_002",
    title: "Non-company product literature article",
    product: "Unknown Product",
    tenantId: "demo-tenant",
    tenantName: "Demo Tenant",
    environment: "PROD",
    currentState: "HITS_REVIEW",
    assignedTo: "Unassigned",
    locked: false,
    lockedAt: "—",
    lockedBy: "—",
    confidence: 71,
    version: 1,
    updatedAt: "2026-07-05T09:15:00.000Z",
  },
];

let audit: PackageAudit[] = [
  {
    id: "AUD-001",
    packageId: "PMID_DEMO001",
    timestamp: "2026-07-05T10:42:00.000Z",
    action: "PACKAGE_LOCKED",
    oldValue: "SCREENING_COMPLETE",
    newValue: "SCREENING_REVIEW",
    comment: "Package locked after screening output generation.",
    performedBy: "system",
    role: "system",
    tenantId: "demo-tenant",
    environment: "PROD",
  },
];

function requireComment(action: ActionInput["action"], comment?: string) {
  const mandatory = ["UNLOCK", "LOCK", "OVERRIDE", "ROUTE_BACK", "FORCE_RERUN"];
  if (mandatory.includes(action) && !comment?.trim()) {
    throw new Error(`${action} requires a mandatory comment.`);
  }
}

function createAudit(
  pkg: PackageRecord,
  action: string,
  oldValue: string,
  newValue: string,
  comment: string,
  performedBy: string,
  role: string
) {
  audit.unshift({
    id: `AUD-${Date.now()}`,
    packageId: pkg.packageId,
    timestamp: now(),
    action,
    oldValue,
    newValue,
    comment,
    performedBy,
    role,
    tenantId: pkg.tenantId,
    environment: pkg.environment,
  });
}

export function searchPackages(query = "", tenantId = "demo-tenant") {
  const q = query.trim().toLowerCase();

  return packages.filter((pkg) => {
    if (pkg.tenantId !== tenantId) return false;
    if (!q) return true;

    return [
      pkg.packageId,
      pkg.pmid,
      pkg.title,
      pkg.product,
      pkg.currentState,
      pkg.assignedTo,
      pkg.tenantName,
      pkg.environment,
    ]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });
}

export function getPackageAudit(packageId: string) {
  return audit.filter((item) => item.packageId === packageId);
}

export function performPackageAction(input: ActionInput) {
  const performedBy = input.performedBy || "Madhu";
  const role = input.role || "Super User";
  const comment = input.comment || "";
  const tenantId = input.tenantId || "demo-tenant";

  requireComment(input.action, comment);

  const index = packages.findIndex(
    (pkg) => pkg.packageId === input.packageId && pkg.tenantId === tenantId
  );

  if (index === -1) {
    throw new Error("Package not found for selected tenant.");
  }

  const current = packages[index];
  let updated: PackageRecord = { ...current };
  const oldValue = current.currentState;

  if (input.action === "ASSIGN") {
    if (!input.assignedTo) throw new Error("Assigned user is required.");
    updated.assignedTo = input.assignedTo;
    updated.updatedAt = now();

    createAudit(
      current,
      "ASSIGN_USER",
      current.assignedTo,
      input.assignedTo,
      comment || `Assigned to ${input.assignedTo}`,
      performedBy,
      role
    );
  }

  if (input.action === "UNLOCK") {
    if (!current.locked) throw new Error("Package is already unlocked.");

    updated.locked = false;
    updated.lockedAt = "—";
    updated.lockedBy = "—";
    updated.currentState = "UNLOCKED";
    updated.version += 1;
    updated.updatedAt = now();

    createAudit(current, "UNLOCK_PACKAGE", oldValue, "UNLOCKED", comment, performedBy, role);
  }

  if (input.action === "LOCK") {
    updated.locked = true;
    updated.lockedAt = now();
    updated.lockedBy = performedBy;
    updated.currentState = "LOCKED";
    updated.version += 1;
    updated.updatedAt = now();

    createAudit(current, "LOCK_PACKAGE", oldValue, "LOCKED", comment, performedBy, role);
  }

  if (input.action === "OVERRIDE") {
    updated.currentState = "OVERRIDDEN";
    updated.locked = true;
    updated.lockedAt = now();
    updated.lockedBy = performedBy;
    updated.version += 1;
    updated.updatedAt = now();

    createAudit(current, "OVERRIDE_AI_OUTPUT", oldValue, "OVERRIDDEN", comment, performedBy, role);
  }

  if (input.action === "ROUTE_BACK") {
    const routeTo = input.routeTo || "SCREENING_REVIEW";

    updated.currentState = routeTo;
    updated.locked = false;
    updated.lockedAt = "—";
    updated.lockedBy = "—";
    updated.version += 1;
    updated.updatedAt = now();

    createAudit(current, "ROUTE_BACK", oldValue, routeTo, comment, performedBy, role);
  }

  if (input.action === "FORCE_RERUN") {
    updated.currentState = "SCREENING_RUNNING";
    updated.locked = false;
    updated.lockedAt = "—";
    updated.lockedBy = "—";
    updated.version += 1;
    updated.updatedAt = now();

    createAudit(current, "FORCE_RERUN", oldValue, "SCREENING_RUNNING", comment, performedBy, role);
  }

  packages[index] = updated;

  return {
    success: true,
    package: updated,
    audit: getPackageAudit(updated.packageId),
  };
}