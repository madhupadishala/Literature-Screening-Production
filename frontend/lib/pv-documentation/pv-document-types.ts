export const PV_DOCUMENT_TYPES = [
  "PSMF","PVA","RMP","SOP","WORK_INSTRUCTION","SAFETY_REPORT",
  "SIGNAL_DOCUMENT","RISK_DOCUMENT","TRAINING","OTHER",
] as const;

export interface CreatePvDocumentRequest {
  documentKey: string;
  documentType: (typeof PV_DOCUMENT_TYPES)[number];
  title: string;
  reason: string;
}

export interface CreatePvDocumentVersionRequest {
  versionStatus: "DRAFT"|"REVIEWED"|"APPROVED"|"EFFECTIVE"|"RETIRED";
  content: Record<string,unknown>;
  linkedSources?: Array<Record<string,unknown>>;
  changeReason: string;
  effectiveFrom?: string;
  effectiveUntil?: string;
}
