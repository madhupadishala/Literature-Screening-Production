import type { WorkflowItem, WorkflowSummary } from "./types";

export const mockWorkflowItems: WorkflowItem[] = [
  {
    id: "LIT-2026-0001",
    articleTitle:
      "Acute liver injury associated with concomitant use of paracetamol and herbal supplements",
    source: "PubMed",
    product: "Paracetamol",
    country: "India",
    stage: "SCREENING",
    status: "IN_PROGRESS",
    priority: "HIGH",
    seriousness: ["Hospitalization", "Other medically important condition"],
    assignedTo: "Screening User",
    dueDate: "2026-07-06",
    createdAt: "2026-07-05T09:30:00+05:30",
    updatedAt: "2026-07-05T10:45:00+05:30",
    hasOverride: false,
    isExpedited: true,
    notes: "Potential serious case. Full text review required.",
  },
  {
    id: "LIT-2026-0002",
    articleTitle:
      "Fatal suspected adverse drug reaction after oncology combination therapy",
    source: "Embase",
    product: "Company Oncology Product",
    country: "United States",
    stage: "INTAKE",
    status: "ESCALATED",
    priority: "CRITICAL",
    seriousness: ["Death"],
    assignedTo: "Intake User",
    dueDate: "2026-07-05",
    createdAt: "2026-07-05T08:15:00+05:30",
    updatedAt: "2026-07-05T11:10:00+05:30",
    hasOverride: true,
    isExpedited: true,
    notes: "Death case. Requires immediate intake action.",
  },
];

export function buildWorkflowSummary(items: WorkflowItem[]): WorkflowSummary {
  return {
    total: items.length,
    hits: items.filter((item) => item.stage === "HITS").length,
    screening: items.filter((item) => item.stage === "SCREENING").length,
    intake: items.filter((item) => item.stage === "INTAKE").length,
    qc: items.filter((item) => item.stage === "QC").length,
    completed: items.filter((item) => item.stage === "COMPLETED").length,
    escalated: items.filter((item) => item.status === "ESCALATED").length,
    overrides: items.filter((item) => item.hasOverride).length,
    expedited: items.filter((item) => item.isExpedited).length,
  };
}