export const NEXUS_MODULES = {
  LITERATURE: "LITERATURE",
  INTAKE: "INTAKE",
  CASE_PROCESSING: "CASE_PROCESSING",
  MEDICAL_REVIEW: "MEDICAL_REVIEW",
  SIGNAL_MANAGEMENT: "SIGNAL_MANAGEMENT",
  AGGREGATE_REPORTING: "AGGREGATE_REPORTING",
  GOVERNANCE: "GOVERNANCE",
} as const;

export type NexusModuleKey = (typeof NEXUS_MODULES)[keyof typeof NEXUS_MODULES];

export interface NexusModuleDefinition {
  key: NexusModuleKey;
  label: string;
  description: string;
  dependencies: readonly NexusModuleKey[];
}

export const NEXUS_MODULE_DEFINITIONS: Record<NexusModuleKey, NexusModuleDefinition> = {
  LITERATURE: {
    key: "LITERATURE",
    label: "Nexus Literature",
    description: "Literature search, screening, review, medical review handoff and evidence.",
    dependencies: [],
  },
  INTAKE: {
    key: "INTAKE",
    label: "Nexus Intake",
    description: "Safety intake, extraction, validity, triage, duplicate review and disposition.",
    dependencies: [],
  },
  CASE_PROCESSING: {
    key: "CASE_PROCESSING",
    label: "Nexus Case Processing",
    description: "L2A case processing, assessments, narrative, QC, finalisation and export.",
    dependencies: ["INTAKE"],
  },
  MEDICAL_REVIEW: {
    key: "MEDICAL_REVIEW",
    label: "Nexus Medical Review",
    description: "Medical review tasks and governed medical decisions.",
    dependencies: [],
  },
  SIGNAL_MANAGEMENT: {
    key: "SIGNAL_MANAGEMENT",
    label: "Nexus Signals",
    description: "Signal detection and management.",
    dependencies: [],
  },
  AGGREGATE_REPORTING: {
    key: "AGGREGATE_REPORTING",
    label: "Nexus Aggregate",
    description: "Aggregate safety reporting.",
    dependencies: [],
  },
  GOVERNANCE: {
    key: "GOVERNANCE",
    label: "Nexus Governance",
    description: "Controlled governance and regulated content workflows.",
    dependencies: [],
  },
};

export function isNexusModuleKey(value: string): value is NexusModuleKey {
  return Object.prototype.hasOwnProperty.call(NEXUS_MODULE_DEFINITIONS, value);
}

export function getModuleDependencies(moduleKey: NexusModuleKey): readonly NexusModuleKey[] {
  return NEXUS_MODULE_DEFINITIONS[moduleKey].dependencies;
}
