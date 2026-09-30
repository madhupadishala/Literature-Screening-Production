export const SUBMISSION_DESTINATION_TYPES = [
  "REGULATORY_AUTHORITY",
  "PARTNER",
  "SANDBOX",
] as const;

export type SubmissionDestinationType =
  (typeof SUBMISSION_DESTINATION_TYPES)[number];

export const SUBMISSION_ACK_STATUSES = [
  "ACCEPTED",
  "PARTIAL",
  "REJECTED",
  "TECHNICAL_ERROR",
  "PENDING",
] as const;

export type SubmissionAcknowledgementStatus =
  (typeof SUBMISSION_ACK_STATUSES)[number];

export interface CreateSubmissionRequest {
  caseId: string;
  destinationType: SubmissionDestinationType;
  destinationKey: string;
  messageProfile?: string;
  idempotencyKey: string;
  reason: string;
}

export interface RecordAcknowledgementRequest {
  externalAckId: string;
  ackType: string;
  ackStatus: SubmissionAcknowledgementStatus;
  ackPayload?: Record<string, unknown>;
  receivedAt: string;
}

export interface SubmissionTransportRequest {
  submissionId: string;
  submissionKey: string;
  destinationType: SubmissionDestinationType;
  destinationKey: string;
  messageProfile: string;
  packagePayload: Record<string, unknown>;
  packageSha256: string;
  signal: AbortSignal;
}

export interface SubmissionTransportResult {
  externalMessageId: string;
  responseMetadata?: Record<string, unknown>;
}

export interface SubmissionTransportAdapter {
  readonly key: string;
  supports(input: {
    destinationType: SubmissionDestinationType;
    destinationKey: string;
    messageProfile: string;
  }): boolean;
  transmit(
    request: SubmissionTransportRequest,
  ): Promise<SubmissionTransportResult>;
}
