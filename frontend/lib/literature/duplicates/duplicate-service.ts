import { duplicateMatcher } from "./duplicate-matcher";
import type {
  DuplicateCandidate,
  DuplicateCheckRequest,
  DuplicateCheckResult,
  DuplicateStatus,
} from "./duplicate-types";

class DuplicateService {
  private records: DuplicateCandidate[] = [];
  private history: DuplicateCheckResult[] = [];

  check(request: DuplicateCheckRequest): DuplicateCheckResult {
    const existing = this.records.filter(
      (record) => record.tenantId === request.tenantId,
    );

    const matches = duplicateMatcher.match(request.candidate, existing);

    const result: DuplicateCheckResult = {
      candidate: request.candidate,
      isDuplicate: matches.length > 0,
      matches,
      checkedAt: new Date().toISOString(),
    };

    this.history.unshift(result);

    if (!result.isDuplicate) {
      this.records.push(request.candidate);
    }

    return result;
  }

  list(limit = 20) {
    return this.history.slice(0, limit);
  }

  getStatus(): DuplicateStatus {
    return {
      checkedRecords: this.history.length,
      duplicateRecords: this.history.filter((item) => item.isDuplicate).length,
    };
  }
}

export const duplicateService = new DuplicateService();