import { duplicateEngine } from "./duplicate-engine";

import type {
  DuplicateCheckRequest,
  DuplicateCheckResponse,
  DuplicateStatus,
} from "./duplicate-types";

class DuplicateService {
  private history: DuplicateCheckResponse[] = [];

  async check(
    request: DuplicateCheckRequest,
  ): Promise<DuplicateCheckResponse> {
    const response =
      duplicateEngine.check(request);

    this.history.unshift(response);

    return response;
  }

  list(
    limit = 20,
  ): DuplicateCheckResponse[] {
    return this.history.slice(0, limit);
  }

  clear(): void {
    this.history = [];
  }

  getStatus(): DuplicateStatus {
    const duplicateCount =
      this.history.filter(
        (item) => item.isDuplicate,
      ).length;

    const checkedRecords =
      this.history.reduce(
        (total, item) =>
          total + item.checkedArticles,
        0,
      );

    return {
      totalChecks: this.history.length,

      checkedRecords,

      duplicateRecords: duplicateCount,

      duplicatesDetected: duplicateCount,

      lastCheckAt:
        this.history.length > 0
          ? this.history[0].checkedAt
          : undefined,
    };
  }
}

export const duplicateService =
  new DuplicateService();