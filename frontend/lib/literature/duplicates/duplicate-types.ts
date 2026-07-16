export interface DuplicateCandidate {
  id: string;
  tenantId: string;
  pmid?: string;
  title: string;
  doi?: string;
  authors?: string[];
  publicationDate?: string;
}

export interface DuplicateCheckRequest {
  tenantId: string;
  candidate: DuplicateCandidate;
}

export interface DuplicateMatch {
  candidateId: string;
  matchedRecordId: string;
  score: number;
  reason: string;
}

export interface DuplicateCheckResult {
  candidate: DuplicateCandidate;
  isDuplicate: boolean;
  matches: DuplicateMatch[];
  checkedAt: string;
}

export interface DuplicateStatus {
  checkedRecords: number;
  duplicateRecords: number;
}