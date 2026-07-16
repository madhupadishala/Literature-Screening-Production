export type BulkPackageAction =
  | "LOCK"
  | "UNLOCK"
  | "ROUTE_BACK"
  | "OVERRIDE";

export type BulkPackageStatus =
  | "HITS"
  | "SCREENING"
  | "LOCKED"
  | "COMPLETED"
  | "UNLOCKED"
  | "ROUTED_BACK"
  | "OVERRIDDEN";

export type BulkPackage = {
  id: string;
  packageName: string;
  tenantId: string;
  product: string;
  status: BulkPackageStatus;
  assignedTo: string;
  selected?: boolean;
};

export type BulkActionResult = {
  packageId: string;
  success: boolean;
  message: string;
  previousStatus?: BulkPackageStatus;
  newStatus?: BulkPackageStatus;
};

export type BulkActionAudit = {
  id: string;
  packageId: string;
  action: BulkPackageAction;
  comment: string;
  performedBy: string;
  performedAt: string;
  previousStatus: BulkPackageStatus;
  newStatus: BulkPackageStatus;
};

const packages: BulkPackage[] = [
  {
    id: "PKG-LIT-2026-0001",
    packageName: "Paracetamol Weekly Literature Package",
    tenantId: "TENANT-CLINIXAI",
    product: "Paracetamol",
    status: "SCREENING",
    assignedTo: "Screening User",
  },
  {
    id: "PKG-LIT-2026-0002",
    packageName: "Oncology Safety Review Package",
    tenantId: "TENANT-CLINIXAI",
    product: "Company Oncology Product",
    status: "LOCKED",
    assignedTo: "QC Reviewer",
  },
  {
    id: "PKG-LIT-2026-0003",
    packageName: "Neurology Pregnancy Exposure Package",
    tenantId: "TENANT-CLINIXAI",
    product: "Company Neurology Product",
    status: "COMPLETED",
    assignedTo: "QC Reviewer",
  },
  {
    id: "PKG-LIT-2026-0004",
    packageName: "Biologic Lack of Efficacy Package",
    tenantId: "TENANT-CLINIXAI",
    product: "Company Biologic Product",
    status: "HITS",
    assignedTo: "Workflow Manager",
  },
];

const audits: BulkActionAudit[] = [];

export function getBulkPackages(tenantId = "TENANT-CLINIXAI") {
  return packages.filter((item) => item.tenantId === tenantId);
}

export function executeBulkAction(input: {
  packageIds: string[];
  tenantId: string;
  action: BulkPackageAction;
  comment: string;
  performedBy: string;
}): BulkActionResult[] {
  const comment = input.comment.trim();

  if (!comment) {
    return input.packageIds.map((packageId) => ({
      packageId,
      success: false,
      message: "Mandatory justification comment is required.",
    }));
  }

  return input.packageIds.map((packageId) => {
    const targetPackage = packages.find(
      (item) => item.id === packageId && item.tenantId === input.tenantId,
    );

    if (!targetPackage) {
      return {
        packageId,
        success: false,
        message: "Package not found or tenant isolation failed.",
      };
    }

    const validation = validateBulkAction(targetPackage.status, input.action);

    if (!validation.ok) {
      return {
        packageId,
        success: false,
        message: validation.message,
        previousStatus: targetPackage.status,
      };
    }

    const previousStatus = targetPackage.status;
    const newStatus = getNewStatus(input.action);

    targetPackage.status = newStatus;

    audits.unshift({
      id: `BULK-AUD-${String(audits.length + 1).padStart(4, "0")}`,
      packageId,
      action: input.action,
      comment,
      performedBy: input.performedBy,
      performedAt: new Date().toISOString(),
      previousStatus,
      newStatus,
    });

    return {
      packageId,
      success: true,
      message: `${input.action} completed successfully.`,
      previousStatus,
      newStatus,
    };
  });
}

function validateBulkAction(
  currentStatus: BulkPackageStatus,
  action: BulkPackageAction,
): { ok: boolean; message: string } {
  if (action === "LOCK") {
    if (currentStatus !== "SCREENING" && currentStatus !== "UNLOCKED") {
      return {
        ok: false,
        message: "Only SCREENING or UNLOCKED packages can be locked.",
      };
    }
  }

  if (action === "UNLOCK") {
    if (currentStatus !== "LOCKED" && currentStatus !== "COMPLETED") {
      return {
        ok: false,
        message: "Only LOCKED or COMPLETED packages can be unlocked.",
      };
    }
  }

  if (action === "ROUTE_BACK") {
    if (currentStatus === "HITS") {
      return {
        ok: false,
        message: "HITS packages cannot be routed back.",
      };
    }
  }

  if (action === "OVERRIDE") {
    if (currentStatus === "HITS") {
      return {
        ok: false,
        message: "HITS packages cannot be overridden.",
      };
    }
  }

  return {
    ok: true,
    message: "Allowed.",
  };
}

function getNewStatus(action: BulkPackageAction): BulkPackageStatus {
  if (action === "LOCK") return "LOCKED";
  if (action === "UNLOCK") return "UNLOCKED";
  if (action === "ROUTE_BACK") return "ROUTED_BACK";
  return "OVERRIDDEN";
}