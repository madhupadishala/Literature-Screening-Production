export type WorkflowStage =
  | "HITS"
  | "SCREENING"
  | "LOCKED"
  | "INTAKE"
  | "QC"
  | "COMPLETED";

export type WorkflowAction =
  | "START_SCREENING"
  | "LOCK"
  | "UNLOCK"
  | "SEND_TO_INTAKE"
  | "SEND_TO_QC"
  | "COMPLETE"
  | "ROUTE_BACK";

export type TransitionResult = {
  allowed: boolean;
  reason?: string;
};

const workflowMap: Record<WorkflowStage, WorkflowAction[]> = {
  HITS: ["START_SCREENING"],

  SCREENING: [
    "LOCK",
    "ROUTE_BACK",
  ],

  LOCKED: [
    "UNLOCK",
    "SEND_TO_INTAKE",
  ],

  INTAKE: [
    "SEND_TO_QC",
    "ROUTE_BACK",
  ],

  QC: [
    "COMPLETE",
    "ROUTE_BACK",
  ],

  COMPLETED: [],
};

export function getAllowedActions(
  stage: WorkflowStage,
): WorkflowAction[] {
  return workflowMap[stage];
}

export function validateTransition(
  stage: WorkflowStage,
  action: WorkflowAction,
): TransitionResult {
  if (workflowMap[stage].includes(action)) {
    return {
      allowed: true,
    };
  }

  return {
    allowed: false,
    reason: `${action} is not permitted from ${stage}.`,
  };
}

export function nextStage(
  stage: WorkflowStage,
  action: WorkflowAction,
): WorkflowStage {

  switch (action) {

    case "START_SCREENING":
      return "SCREENING";

    case "LOCK":
      return "LOCKED";

    case "UNLOCK":
      return "SCREENING";

    case "SEND_TO_INTAKE":
      return "INTAKE";

    case "SEND_TO_QC":
      return "QC";

    case "COMPLETE":
      return "COMPLETED";

    case "ROUTE_BACK":
      return "SCREENING";

    default:
      return stage;
  }
}