import type {
  KnowledgeApprovalStatus,
  KnowledgeGovernanceAction,
} from "./knowledge-governance-types";

const allowedTransitions: Record<
  KnowledgeGovernanceAction,
  KnowledgeApprovalStatus[]
> = {
  submit_for_review: ["draft", "rejected"],
  approve: ["in_review"],
  reject: ["in_review"],
  mark_effective: ["approved"],
  supersede: ["effective"],
  retire: ["draft", "approved", "effective", "superseded"],
};

export function resolveNextStatus(
  currentStatus: KnowledgeApprovalStatus,
  action: KnowledgeGovernanceAction,
): KnowledgeApprovalStatus {
  const allowedStatuses = allowedTransitions[action];

  if (!allowedStatuses.includes(currentStatus)) {
    throw new Error(
      `Invalid governance transition from ${currentStatus} using ${action}`,
    );
  }

  if (action === "submit_for_review") {
    return "in_review";
  }

  if (action === "approve") {
    return "approved";
  }

  if (action === "reject") {
    return "rejected";
  }

  if (action === "mark_effective") {
    return "effective";
  }

  if (action === "supersede") {
    return "superseded";
  }

  return "retired";
}