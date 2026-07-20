export type GateStatus = "passed" | "failed" | "pending" | "waived";
export type UatMode = "automated" | "manual";
export type EvidenceOutcome = "passed" | "failed" | "blocked";

export interface ReleaseManifest {
  application: string;
  version: string;
  releaseName: string;
  buildSha: string;
  environment: string;
  region: string;
  generatedAt: string;
  architectureBoundary: string;
  includedCapabilities: string[];
  excludedCapabilities: string[];
  manifestHash: string;
}

export interface EnvironmentContractItem {
  name: string;
  passed: boolean;
  critical: boolean;
  message: string;
}

export interface EnvironmentContractReport {
  passed: boolean;
  checkedAt: string;
  items: EnvironmentContractItem[];
}

export interface HttpProbeDefinition {
  id: string;
  title: string;
  description: string;
  category: string;
  path: string;
  method: "GET" | "POST";
  expectedStatuses: number[];
  mandatory: boolean;
  timeoutMs?: number;
}

export interface HttpProbeResult {
  id: string;
  title: string;
  passed: boolean;
  statusCode?: number;
  latencyMs: number;
  checkedAt: string;
  message: string;
  responseSample?: unknown;
}

export interface UatScenario {
  id: string;
  title: string;
  description: string;
  category: string;
  mode: UatMode;
  mandatory: boolean;
  endpoint?: string;
  method?: "GET" | "POST";
  expectedStatuses?: number[];
  acceptanceCriteria: string[];
  evidenceRequired: string[];
}

export interface UatEvidence {
  id: string;
  scenarioId: string;
  mode: UatMode;
  outcome: EvidenceOutcome;
  executedAt: string;
  executedBy: string;
  notes?: string;
  attachments?: string[];
  result?: HttpProbeResult;
  manifestHash: string;
}

export interface ReleaseChecklistDefinition {
  id: string;
  title: string;
  description: string;
  mandatory: boolean;
  ownerRole: string;
}

export interface ReleaseChecklistRecord {
  id: string;
  status: GateStatus;
  updatedAt?: string;
  updatedBy?: string;
  notes?: string;
}

export interface ReleaseGate {
  id: string;
  title: string;
  status: GateStatus;
  mandatory: boolean;
  message: string;
  details?: unknown;
}

export interface SmokeRun {
  id: string;
  startedAt: string;
  completedAt: string;
  executedBy: string;
  passed: boolean;
  manifestHash: string;
  results: HttpProbeResult[];
}

export interface ReleaseCandidate {
  id: string;
  releaseName: string;
  version: string;
  buildSha: string;
  manifestHash: string;
  createdAt: string;
  createdBy: string;
  status: "candidate" | "blocked";
  gateSnapshot: ReleaseGate[];
  rollbackPlan: RollbackPlan;
}

export interface RollbackPlan {
  triggerConditions: string[];
  immediateActions: string[];
  validationSteps: string[];
  ownerRoles: string[];
  targetRecoveryMinutes: number;
}

export interface ReleaseReadinessReport {
  ready: boolean;
  checkedAt: string;
  manifest: ReleaseManifest;
  environment: EnvironmentContractReport;
  enterpriseConfiguration: unknown;
  health: unknown;
  gates: ReleaseGate[];
  checklist: Array<ReleaseChecklistDefinition & ReleaseChecklistRecord>;
  uat: {
    scenarios: UatScenario[];
    latestEvidence: UatEvidence[];
    mandatoryPassed: number;
    mandatoryTotal: number;
  };
  smoke?: SmokeRun;
  candidates: ReleaseCandidate[];
}

export interface ReleaseState {
  version: 1;
  updatedAt: string;
  checklist: Record<string, ReleaseChecklistRecord>;
  uatEvidence: UatEvidence[];
  smokeRuns: SmokeRun[];
  candidates: ReleaseCandidate[];
}
