export const AGGREGATE_REPORT_TYPES = [
  "PSUR_PBRER","DSUR","PADER","LINE_LISTING","CUSTOM",
] as const;

export interface CreateAggregateReportRequest {
  reportKey: string;
  reportType: (typeof AGGREGATE_REPORT_TYPES)[number];
  productKey?: string;
  periodStart: string;
  periodEnd: string;
  reason: string;
}

export interface CreateAggregateVersionRequest {
  content: Record<string, unknown>;
  status: "DRAFT" | "REVIEWED" | "APPROVED" | "FINALIZED";
  changeReason: string;
}
