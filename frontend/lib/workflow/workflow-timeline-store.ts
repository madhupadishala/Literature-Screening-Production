import type { WorkflowStage } from "./workflow-rules";

export type WorkflowTimelineEvent = {

  id: string;

  packageId: string;

  stage: WorkflowStage;

  action: string;

  performedBy: string;

  timestamp: string;

  comment?: string;
};

const events: WorkflowTimelineEvent[] = [

  {
    id: "TL-1",
    packageId: "PKG-LIT-2026-0001",
    stage: "HITS",
    action: "Hits Generated",
    performedBy: "Workflow Manager",
    timestamp: "2026-07-05T08:00:00+05:30",
  },

  {
    id: "TL-2",
    packageId: "PKG-LIT-2026-0001",
    stage: "SCREENING",
    action: "Screening Started",
    performedBy: "Screening User",
    timestamp: "2026-07-05T09:10:00+05:30",
  },

  {
    id: "TL-3",
    packageId: "PKG-LIT-2026-0001",
    stage: "LOCKED",
    action: "Package Locked",
    performedBy: "Screening Lead",
    timestamp: "2026-07-05T10:40:00+05:30",
  },

  {
    id: "TL-4",
    packageId: "PKG-LIT-2026-0001",
    stage: "INTAKE",
    action: "Sent to Intake",
    performedBy: "Workflow Manager",
    timestamp: "2026-07-05T11:20:00+05:30",
  },

  {
    id: "TL-5",
    packageId: "PKG-LIT-2026-0001",
    stage: "QC",
    action: "QC Review",
    performedBy: "QC Reviewer",
    timestamp: "2026-07-05T12:30:00+05:30",
  },

  {
    id: "TL-6",
    packageId: "PKG-LIT-2026-0001",
    stage: "COMPLETED",
    action: "Completed",
    performedBy: "QC Reviewer",
    timestamp: "2026-07-05T13:10:00+05:30",
  },
];

export function getWorkflowTimeline(packageId: string) {

  return events.filter(
    (event) => event.packageId === packageId,
  );

}