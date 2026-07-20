export const CONFIGURATION_RESOURCE_TYPES = [
  "PRODUCT_MASTER",
  "LITERATURE_CALENDAR",
  "CLIENT_GUIDELINE",
  "OUTCOME_TEMPLATE",
  "LITERATURE_SOURCE",
] as const;

export type ConfigurationResourceType =
  (typeof CONFIGURATION_RESOURCE_TYPES)[number];

export const CONFIGURATION_LIFECYCLE_STATUSES = [
  "draft",
  "validated",
  "approved",
  "active",
  "superseded",
  "retired",
  "rejected",
] as const;

export type ConfigurationLifecycleStatus =
  (typeof CONFIGURATION_LIFECYCLE_STATUSES)[number];

export interface ConfigurationValidationIssue {
  severity: "error" | "warning";
  path: string;
  message: string;
}

export interface ConfigurationValidationReport {
  valid: boolean;
  errors: ConfigurationValidationIssue[];
  warnings: ConfigurationValidationIssue[];
  validatedAt: string;
}

export interface ConfigurationVersionRecord {
  id: string;
  configSetId: string;
  tenantId: string;
  resourceType: ConfigurationResourceType;
  configKey: string;
  displayName: string;
  versionNumber: number;
  versionLabel: string;
  lifecycleStatus: ConfigurationLifecycleStatus;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  payload: unknown;
  validationReport: ConfigurationValidationReport | Record<string, unknown>;
  sourceFilename: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActiveTenantConfiguration {
  productMaster: ConfigurationVersionRecord | null;
  literatureCalendar: ConfigurationVersionRecord | null;
  clientGuidelines: ConfigurationVersionRecord[];
  outcomeTemplate: ConfigurationVersionRecord | null;
  literatureSources: ConfigurationVersionRecord[];
  capturedAt: string;
}
