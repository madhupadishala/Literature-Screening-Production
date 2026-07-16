export type WorkflowStage =
  | "HITS"
  | "SCREENING"
  | "INTAKE"
  | "QC"
  | "COMPLETED";

export type WorkflowStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "ON_HOLD"
  | "ESCALATED"
  | "COMPLETED";

export type SeriousnessCategory =
  | "Death"
  | "Life-threatening"
  | "SUSAR"
  | "Hospitalization"
  | "Disability"
  | "Congenital anomaly"
  | "Other medically important condition"
  | "Non-serious";

export type WorkflowPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type WorkflowItem = {
  id: string;
  articleTitle: string;
  source: string;
  product: string;
  country: string;
  stage: WorkflowStage;
  status: WorkflowStatus;
  priority: WorkflowPriority;
  seriousness: SeriousnessCategory[];
  assignedTo: string;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  hasOverride: boolean;
  isExpedited: boolean;
  notes?: string;
};

export type WorkflowSummary = {
  total: number;
  hits: number;
  screening: number;
  intake: number;
  qc: number;
  completed: number;
  escalated: number;
  overrides: number;
  expedited: number;
};