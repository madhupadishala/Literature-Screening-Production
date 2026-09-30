export type VersionTrigger =
  | "INITIAL_CREATE"
  | "UNLOCK"
  | "OVERRIDE"
  | "ROUTE_BACK"
  | "QC_CORRECTION"
  | "MANUAL_UPDATE"
  | "SYSTEM_UPDATE";

export type VersionStatus = "LATEST" | "ARCHIVED" | "LOCKED";

export type VersionWorkflowStage =
  | "HITS"
  | "SCREENING"
  | "LOCKED"
  | "INTAKE"
  | "QC"
  | "COMPLETED";

export type VersionChange = {
  field: string;
  previousValue?: string | number | boolean | null;
  newValue?: string | number | boolean | null;
  reason?: string;
};

export type VersionUser = {
  id: string;
  name: string;
  role: string;
  tenantId: string;
};

export type PackageVersion = {
  id: string;
  packageId: string;
  versionNumber: number;
  versionLabel: string;
  status: VersionStatus;
  trigger: VersionTrigger;
  workflowStage: VersionWorkflowStage;
  createdBy: VersionUser;
  createdAt: string;
  reason: string;
  sourceVersionId?: string;
  changes: VersionChange[];
};

export type VersionHistory = {
  packageId: string;
  latestVersion: PackageVersion | null;
  totalVersions: number;
  versions: PackageVersion[];
};

export type CreateVersionInput = {
  packageId: string;
  trigger: VersionTrigger;
  workflowStage: VersionWorkflowStage;
  createdBy: VersionUser;
  reason: string;
  changes?: VersionChange[];
};