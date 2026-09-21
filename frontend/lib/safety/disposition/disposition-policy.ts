import {
  INTAKE_DISPOSITION_TYPES,
  type IntakeDispositionType,
} from "./disposition-types";

export interface IntakeDispositionState {
  validityStatus: string;
  triageOutcome: string;
  followUpRequired: boolean;
  duplicateReviewStatus: string;
  caseRelationship: string;
}

export function deriveAllowedDispositions(
  state: IntakeDispositionState,
  caseProcessingEnabled: boolean,
): IntakeDispositionType[] {
  const allowed = new Set<IntakeDispositionType>(["HOLD"]);

  if (
    state.validityStatus === "VALID" &&
    state.duplicateReviewStatus === "COMPLETE" &&
    ["NEW_CASE", "NOT_MATCH"].includes(state.caseRelationship)
  ) {
    allowed.add("EXPORT_EXTERNAL");
    if (caseProcessingEnabled) allowed.add("CREATE_NEXUS_CASE");
  }

  if (
    state.validityStatus === "VALID" &&
    state.duplicateReviewStatus === "COMPLETE" &&
    state.caseRelationship === "FOLLOW_UP"
  ) {
    allowed.add("FOLLOW_UP_EXISTING_CASE");
    allowed.add("EXPORT_EXTERNAL");
  }

  if (
    state.validityStatus === "VALID" &&
    state.duplicateReviewStatus === "COMPLETE" &&
    state.caseRelationship === "DUPLICATE"
  ) {
    allowed.add("DUPLICATE");
  }

  if (
    state.triageOutcome === "FOLLOW_UP_REQUIRED" ||
    state.followUpRequired
  ) {
    allowed.add("INCOMPLETE_FOLLOW_UP");
  }

  if (
    state.validityStatus === "INVALID" ||
    state.triageOutcome === "NOT_VALID_ICSR"
  ) {
    allowed.add("NON_CASE");
  }

  return INTAKE_DISPOSITION_TYPES.filter((item) => allowed.has(item));
}
