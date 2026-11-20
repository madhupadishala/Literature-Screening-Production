export const PV_DOCUMENT_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  DRAFT: ["DRAFT", "REVIEWED"],
  IN_REVIEW: ["REVIEWED", "APPROVED"],
  APPROVED: ["EFFECTIVE", "RETIRED"],
  EFFECTIVE: ["RETIRED"],
  RETIRED: [],
};

export function availablePvDocumentTransitions(status: string): readonly string[] {
  return Object.prototype.hasOwnProperty.call(PV_DOCUMENT_TRANSITIONS, status)
    ? PV_DOCUMENT_TRANSITIONS[status]
    : [];
}

export function isPvDocumentApproval(status: string): boolean {
  return status === "APPROVED" || status === "EFFECTIVE" || status === "RETIRED";
}
