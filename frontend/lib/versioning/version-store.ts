import type {
  CreateVersionInput,
  PackageVersion,
  VersionHistory,
} from "./version-types";

const packageVersions: PackageVersion[] = [
  {
    id: "VER-PKG-LIT-2026-0001-001",
    packageId: "PKG-LIT-2026-0001",
    versionNumber: 1,
    versionLabel: "v1",
    status: "ARCHIVED",
    trigger: "INITIAL_CREATE",
    workflowStage: "HITS",
    createdBy: {
      id: "USR-004",
      name: "Workflow Manager",
      role: "WORKFLOW_MANAGER",
      tenantId: "TENANT-CLINIXAI",
    },
    createdAt: "2026-07-05T08:30:00+05:30",
    reason: "Initial package version created.",
    changes: [
      {
        field: "package",
        previousValue: null,
        newValue: "Created",
        reason: "Initial literature package generation.",
      },
    ],
  },
  {
    id: "VER-PKG-LIT-2026-0001-002",
    packageId: "PKG-LIT-2026-0001",
    versionNumber: 2,
    versionLabel: "v2",
    status: "ARCHIVED",
    trigger: "UNLOCK",
    workflowStage: "SCREENING",
    createdBy: {
      id: "USR-000",
      name: "Super User",
      role: "SUPER_USER",
      tenantId: "TENANT-CLINIXAI",
    },
    createdAt: "2026-07-05T11:00:00+05:30",
    reason: "Package unlocked for screening correction.",
    sourceVersionId: "VER-PKG-LIT-2026-0001-001",
    changes: [
      {
        field: "workflowStatus",
        previousValue: "LOCKED",
        newValue: "SCREENING",
        reason: "Correction required before QC.",
      },
    ],
  },
  {
    id: "VER-PKG-LIT-2026-0001-003",
    packageId: "PKG-LIT-2026-0001",
    versionNumber: 3,
    versionLabel: "v3",
    status: "LATEST",
    trigger: "OVERRIDE",
    workflowStage: "QC",
    createdBy: {
      id: "USR-003",
      name: "QC Reviewer",
      role: "QC_USER",
      tenantId: "TENANT-CLINIXAI",
    },
    createdAt: "2026-07-05T12:20:00+05:30",
    reason: "Expedited seriousness override applied.",
    sourceVersionId: "VER-PKG-LIT-2026-0001-002",
    changes: [
      {
        field: "expeditedStatus",
        previousValue: "Non-expedited",
        newValue: "Expedited",
        reason: "Hospitalization seriousness identified during QC.",
      },
    ],
  },
];

export function getVersionHistory(packageId: string): VersionHistory {
  const versions = packageVersions
    .filter((version) => version.packageId === packageId)
    .sort((a, b) => b.versionNumber - a.versionNumber);

  const latestVersion =
    versions.find((version) => version.status === "LATEST") ??
    versions[0] ??
    null;

  return {
    packageId,
    latestVersion,
    totalVersions: versions.length,
    versions,
  };
}

export function getLatestVersion(packageId: string): PackageVersion | null {
  return getVersionHistory(packageId).latestVersion;
}

export function createInitialVersion(input: CreateVersionInput): PackageVersion {
  const existingVersions = packageVersions.filter(
    (version) => version.packageId === input.packageId,
  );

  if (existingVersions.length > 0) {
    const latest = getLatestVersion(input.packageId);

    if (!latest) {
      throw new Error("Existing version history is invalid.");
    }

    return latest;
  }

  const version: PackageVersion = {
    id: `VER-${input.packageId}-001`,
    packageId: input.packageId,
    versionNumber: 1,
    versionLabel: "v1",
    status: "LATEST",
    trigger: input.trigger,
    workflowStage: input.workflowStage,
    createdBy: input.createdBy,
    createdAt: new Date().toISOString(),
    reason: input.reason,
    changes: input.changes ?? [],
  };

  packageVersions.unshift(version);

  return version;
}

export function incrementVersion(input: CreateVersionInput): PackageVersion {
  const history = getVersionHistory(input.packageId);
  const latest = history.latestVersion;

  for (const version of packageVersions) {
    if (version.packageId === input.packageId && version.status === "LATEST") {
      version.status = "ARCHIVED";
    }
  }

  const nextNumber = latest ? latest.versionNumber + 1 : 1;
  const nextVersion: PackageVersion = {
    id: `VER-${input.packageId}-${String(nextNumber).padStart(3, "0")}`,
    packageId: input.packageId,
    versionNumber: nextNumber,
    versionLabel: `v${nextNumber}`,
    status: "LATEST",
    trigger: input.trigger,
    workflowStage: input.workflowStage,
    createdBy: input.createdBy,
    createdAt: new Date().toISOString(),
    reason: input.reason,
    sourceVersionId: latest?.id,
    changes: input.changes ?? [],
  };

  packageVersions.unshift(nextVersion);

  return nextVersion;
}

export function lockLatestVersion(packageId: string): PackageVersion | null {
  const latest = getLatestVersion(packageId);

  if (!latest) {
    return null;
  }

  latest.status = "LOCKED";

  return latest;
}